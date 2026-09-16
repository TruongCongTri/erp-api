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
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';

export interface S3UploadResult {
  fileKey: string;
  fileUrl: string;
  bucket: string;
}

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
   * Đọc Buffer trực tiếp từ S3 bằng fileKey (phục vụ BullMQ AI Screening)
   */
  async getFileBuffer(
    fileKey: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
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

    // Chuyển Buffer thành Stream để tránh giữ buffer tĩnh trong bộ nhớ khi upload file lớn
    const stream = Readable.from(fileBuffer);

    try {
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

      const fileUrl = this.getFileUrl(fileKey);

      return {
        fileKey,
        fileUrl,
        bucket: this.bucketName,
      };
    } catch (error) {
      this.logger.error(
        `[S3 Upload Error] Thất bại khi upload file ${fileKey}:`,
        error,
      );
      throw new InternalServerErrorException(
        'Không thể tải tệp CV lên hệ thống lưu trữ S3.',
      );
    }
  }

  /**
   * Delete file from S3
   * @param fileKey
   * @returns
   */

  async deleteFile(fileKey: string): Promise<void> {
    if (!fileKey) return;

    try {
      const command = new DeleteObjectCommand({
        Bucket:
          process.env.AWS_S3_BUCKET_NAME ||
          'storage-chinhnamerp-666952271487-ap-southeast-2-an',
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
}
