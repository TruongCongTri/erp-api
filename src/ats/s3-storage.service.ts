import {
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { CvStorageLocation } from './enums/ats.enum';

export interface S3UploadResult {
  fileKey: string;
  fileUrl: string;
  bucket: string;
  storageLocation: CvStorageLocation;
}

// Thư mục tạm lưu CV trên đĩa cục bộ khi upload S3 thất bại (mất mạng, S3 downtime, v.v.)
const LOCAL_PENDING_DIR = path.join(process.cwd(), 'storage', 'pending-cvs');

@Injectable()
export class S3StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly region: string;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>(
      'AWS_REGION',
      'ap-southeast-1',
    );
    this.bucketName =
      this.configService.getOrThrow<string>('AWS_S3_BUCKET_NAME');

    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>(
          'AWS_SECRET_ACCESS_KEY',
        ),
      },
    });
  }

  /**
   * Tạo URL S3 chuẩn từ fileKey
   */
  getFileUrl(fileKey: string): string {
    return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${fileKey}`;
  }

  /**
   * Nếu url trỏ vào chính bucket S3 này, trích xuất chính xác fileKey (qua URL pathname
   * thật sự, không đoán mò bằng cách cắt chuỗi). Trả về null nếu url là CDN/domain ngoài
   * (CV ứng viên dán link ngoài, hợp lệ - không nên coi là lỗi).
   */
  extractFileKeyFromUrl(url: string): string | null {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }

    const ownHost = `${this.bucketName}.s3.${this.region}.amazonaws.com`;
    const isOwnBucketHost =
      parsed.hostname === ownHost ||
      parsed.hostname.endsWith('.amazonaws.com') ||
      parsed.hostname.includes(this.bucketName);

    if (!isOwnBucketHost) {
      return null;
    }

    return decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  }

  /**
   * Kiểm tra 1 fileKey có thực sự tồn tại (trên đĩa cục bộ tạm hoặc trên S3) hay không.
   * Dùng để chặn việc ingest 1 submission trỏ vào CV không tồn tại (VD: webhook/portal
   * nhận cvFileKey/cvUrl giả từ client mà chưa từng upload thật).
   *
   * Thử lại vài lần (300ms/700ms) trước khi kết luận "không tồn tại": một tệp vừa upload
   * xong trong CÙNG request đôi khi chưa thấy ngay qua HeadObject (delay mạng/route phía
   * client-SDK), nên kiểm tra 1 lần duy nhất có thể báo sai một upload thật là không tồn tại.
   */
  async fileExists(fileKey: string): Promise<boolean> {
    if (fs.existsSync(this.localPathFor(fileKey))) {
      return true;
    }

    const retryDelaysMs = [0, 300, 700];
    for (let attempt = 0; attempt < retryDelaysMs.length; attempt++) {
      const delay = retryDelaysMs[attempt];
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      try {
        await this.s3Client.send(
          new HeadObjectCommand({ Bucket: this.bucketName, Key: fileKey }),
        );
        if (attempt > 0) {
          this.logger.warn(
            `[fileExists Retry] fileKey ${fileKey} chỉ thấy sau ${attempt + 1} lần thử (HeadObject miss ngay sau upload) - khả năng do độ trễ lan truyền/mạng.`,
          );
        }
        return true;
      } catch {
        // Thử lại ở vòng lặp tiếp theo, hoặc kết luận không tồn tại nếu đã hết lượt
      }
    }

    this.logger.warn(
      `[fileExists] fileKey ${fileKey} không tồn tại sau ${retryDelaysMs.length} lần thử (đã đợi tổng ${retryDelaysMs.reduce((a, b) => a + b, 0)}ms).`,
    );
    return false;
  }

  /**
   * Đường dẫn cục bộ tương ứng với 1 fileKey trong thư mục lưu tạm
   */
  private localPathFor(fileKey: string): string {
    return path.join(LOCAL_PENDING_DIR, fileKey.replace(/\.\./g, ''));
  }

  private async saveLocalPending(
    fileKey: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<void> {
    const localPath = this.localPathFor(fileKey);
    await fsp.mkdir(path.dirname(localPath), { recursive: true });
    await fsp.writeFile(localPath, buffer);
    await fsp.writeFile(`${localPath}.meta.json`, JSON.stringify({ mimeType }));
  }

  /**
   * Đọc Buffer trực tiếp từ S3 bằng fileKey (phục vụ BullMQ AI Screening).
   * Ưu tiên đọc từ đĩa cục bộ nếu tệp đang ở trạng thái LOCAL_PENDING (chưa upload lên S3 thành công).
   */
  async getFileBuffer(
    fileKey: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const localPath = this.localPathFor(fileKey);
    if (fs.existsSync(localPath)) {
      try {
        const buffer = await fsp.readFile(localPath);
        let mimeType = 'application/pdf';
        try {
          const meta = JSON.parse(
            await fsp.readFile(`${localPath}.meta.json`, 'utf-8'),
          ) as { mimeType?: string };
          mimeType = meta.mimeType || mimeType;
        } catch {
          // Bỏ qua nếu thiếu file meta, dùng mimeType mặc định
        }
        return { buffer, mimeType };
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `[Local Get Error] Thất bại khi đọc file tạm ${fileKey}: ${errMsg}`,
        );
        // Rơi xuống thử đọc từ S3 phòng trường hợp file cục bộ bị hỏng
      }
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new NotFoundException(
          `Không tìm thấy dữ liệu tệp cho fileKey: ${fileKey}`,
        );
      }

      // Convert ReadableStream sang Buffer
      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      return {
        buffer: Buffer.concat(chunks),
        mimeType: response.ContentType || 'application/pdf',
      };
    } catch (error: any) {
      this.logger.error(
        `[S3 Get Error] Thất bại khi đọc file ${fileKey}:`,
        error,
      );
      throw new InternalServerErrorException(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        `Không thể lấy tệp CV từ S3 Storage: ${error?.message}`,
      );
    }
  }

  /**
   * Upload file lên S3 dưới dạng stream không chặn main thread, báo cáo tiến độ qua callback.
   * Fail-safe: nếu upload S3 thất bại (mất mạng, S3 downtime), lưu tạm xuống đĩa cục bộ và
   * đánh dấu storageLocation = LOCAL_PENDING để cron retry tải lên lại sau (xem CvRetentionCronService).
   */
  async uploadCvStream(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    onProgress?: (percent: number) => void,
  ): Promise<S3UploadResult> {
    const timestamp = Date.now();
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = `ats/cvs/${new Date().getFullYear()}/${timestamp}_${cleanFileName}`;

    try {
      // Chuyển Buffer thành Stream để tránh giữ buffer tĩnh trong bộ nhớ khi upload file lớn
      const stream = Readable.from(fileBuffer);

      const parallelUpload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucketName,
          Key: fileKey,
          Body: stream,
          ContentType: mimeType,
        },
        queueSize: 4, // Số chunk xử lý đồng thời
        partSize: 5 * 1024 * 1024, // 5MB mỗi part
        leavePartsOnError: false,
      });

      parallelUpload.on('httpUploadProgress', (progress) => {
        if (progress.total && progress.loaded) {
          const percent = Math.min(
            100,
            Math.round((progress.loaded / progress.total) * 100),
          );
          if (onProgress) {
            void Promise.resolve(onProgress(percent)).catch((err: Error) => {
              this.logger.warn(`Lỗi trong onProgress callback: ${err.message}`);
            });
          }
        }
      });

      await parallelUpload.done();

      return {
        fileKey,
        fileUrl: this.getFileUrl(fileKey),
        bucket: this.bucketName,
        storageLocation: CvStorageLocation.S3,
      };
    } catch (error) {
      this.logger.error(
        `[S3 Upload Error] Thất bại khi upload file ${fileKey}, chuyển sang lưu tạm cục bộ:`,
        error,
      );

      try {
        await this.saveLocalPending(fileKey, fileBuffer, mimeType);
        this.logger.warn(
          `[Local Fallback] Đã lưu tạm CV xuống đĩa cục bộ: ${fileKey}. Hệ thống sẽ tự động thử upload lại lên S3.`,
        );

        return {
          fileKey,
          fileUrl: this.getFileUrl(fileKey),
          bucket: this.bucketName,
          storageLocation: CvStorageLocation.LOCAL_PENDING,
        };
      } catch (localError) {
        this.logger.error(
          `[Local Fallback Failed] Không thể lưu tạm CV xuống đĩa cục bộ ${fileKey}:`,
          localError,
        );
        throw new InternalServerErrorException(
          'Không thể tải tệp CV lên hệ thống lưu trữ S3 và cũng không thể lưu tạm cục bộ.',
        );
      }
    }
  }

  /**
   * Thử upload lại 1 tệp đang ở trạng thái LOCAL_PENDING lên S3 (dùng bởi cron retry).
   * Trả về true nếu upload thành công (và đã xóa bản cục bộ), false nếu vẫn thất bại.
   */
  async retryPendingUpload(fileKey: string): Promise<boolean> {
    const localPath = this.localPathFor(fileKey);

    if (!fs.existsSync(localPath)) {
      this.logger.warn(
        `[Retry Upload] Không tìm thấy tệp cục bộ cho fileKey: ${fileKey}`,
      );
      return false;
    }

    try {
      const buffer = await fsp.readFile(localPath);
      let mimeType = 'application/pdf';
      try {
        const meta = JSON.parse(
          await fsp.readFile(`${localPath}.meta.json`, 'utf-8'),
        ) as { mimeType?: string };
        mimeType = meta.mimeType || mimeType;
      } catch {
        // Bỏ qua nếu thiếu file meta
      }

      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: fileKey,
          Body: buffer,
          ContentType: mimeType,
        }),
      );

      await fsp.rm(localPath, { force: true });
      await fsp.rm(`${localPath}.meta.json`, { force: true });

      this.logger.log(
        `[Retry Upload] Đã upload thành công CV cục bộ lên S3: ${fileKey}`,
      );
      return true;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[Retry Upload Failed] Vẫn chưa thể upload CV ${fileKey} lên S3: ${errMsg}`,
      );
      return false;
    }
  }

  /**
   * Delete file from S3
   * @param fileKey
   * @returns
   */

  async deleteFile(fileKey: string): Promise<void> {
    if (!fileKey) return;

    const localPath = this.localPathFor(fileKey);
    if (fs.existsSync(localPath)) {
      await fsp.rm(localPath, { force: true });
      await fsp.rm(`${localPath}.meta.json`, { force: true });
    }

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
      });

      await this.s3Client.send(command);
      this.logger.log(`[S3 Purge] Đã xóa thành công CV khỏi S3: ${fileKey}`);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[S3 Purge Failed] Không thể xóa tệp ${fileKey} trên S3: ${errMsg}`,
      );
      // Không ném lỗi ra ngoài để tránh làm crash quy trình lưu kết quả screening
    }
  }

  /**
   * Upload Buffer dưới dạng Stream không chặn Event Loop (Dùng chung cho Avatar, Documents, v.v.)
   */
  async uploadStream(
    fileBuffer: Buffer,
    fileKey: string,
    mimeType: string,
  ): Promise<{ fileKey: string; fileUrl: string; bucket: string }> {
    try {
      const stream = Readable.from(fileBuffer);

      const parallelUpload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucketName,
          Key: fileKey,
          Body: stream,
          ContentType: mimeType,
        },
        queueSize: 4,
        partSize: 5 * 1024 * 1024, // 5MB chunks
        leavePartsOnError: false,
      });

      await parallelUpload.done();

      return {
        fileKey,
        fileUrl: this.getFileUrl(fileKey),
        bucket: this.bucketName,
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[S3 Upload Error] Thất bại khi upload file ${fileKey}: ${errMsg}`,
      );
      throw new InternalServerErrorException(
        'Không thể tải tệp lên hệ thống lưu trữ S3.',
      );
    }
  }
}
