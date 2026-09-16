import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { createRequire } from 'module';

type RequireFn = ReturnType<typeof createRequire>;

type PdfParseResult = {
  numpages: number;
  numrender: number;
  info: unknown;
  metadata: unknown;
  text: string;
  version: string;
};

type PdfParserFn = (
  buf: Buffer,
  options?: Record<string, unknown>,
) => Promise<PdfParseResult>;

interface MammothHandler {
  extractRawText(options: { buffer: Buffer }): Promise<{ value: string }>;
}

@Injectable()
export class CvParserService {
  private readonly logger = new Logger(CvParserService.name);
  private cachedPdfParser: PdfParserFn | null = null;
  private cachedMammoth: MammothHandler | null = null;
  private nodeRequire: RequireFn;

  constructor() {
    try {
      this.nodeRequire = createRequire(__filename);
    } catch {
      this.nodeRequire = createRequire(process.cwd());
    }
  }

  async extractText(fileBuffer: Buffer, mimeType: string): Promise<string> {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('Buffer tài liệu CV rỗng.');
    }

    const cleanMime = mimeType.toLowerCase();

    try {
      if (cleanMime.includes('pdf')) {
        return await this.parsePdf(fileBuffer);
      }

      if (
        cleanMime.includes('wordprocessingml') ||
        cleanMime.includes('docx') ||
        cleanMime.includes('msword')
      ) {
        return await this.parseDocx(fileBuffer);
      }

      if (cleanMime.includes('text/plain')) {
        return fileBuffer.toString('utf-8');
      }

      throw new BadRequestException(
        `Định dạng tệp không được hỗ trợ: ${mimeType}`,
      );
    } catch (error) {
      this.logger.error(`Lỗi trích xuất văn bản từ CV (${mimeType})`, error);
      throw new BadRequestException(
        `Không thể trích xuất nội dung văn bản từ hồ sơ: ${(error as Error).message}`,
      );
    }
  }

  // =========================================================================
  // TYPE-SAFE MODULE LOADERS (LOẠI BỎ TOÀN BỘ ANY VÀ TS2307 SUBPATH ERROR)
  // =========================================================================

  private safeRequire(modulePath: string): unknown {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const req = require as (id: string) => unknown;
      return req(modulePath);
    } catch {
      return null;
    }
  }

  private async safeImport(modulePath: string): Promise<unknown> {
    try {
      // Ép kiểu Promise<unknown> để loại bỏ any và tránh TS2307 khi truyền biến path
      return await (import(modulePath) as Promise<unknown>);
    } catch {
      return null;
    }
  }

  // =========================================================================
  // XỬ LÝ PHÂN TÍCH PDF
  // =========================================================================

  private async parsePdf(buffer: Buffer): Promise<string> {
    try {
      const parseFn = await this.getPdfParser();
      const parsed = await parseFn(buffer);

      if (parsed?.text && parsed.text.trim().length > 0) {
        return this.normalizeText(parsed.text);
      }

      throw new Error('Nội dung text sau khi phân tích PDF rỗng.');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `pdf-parse thất bại (${errMsg}), thử nghiệm fallback text buffer thô`,
      );
      return this.normalizeText(buffer.toString('utf-8'));
    }
  }

  private async getPdfParser(): Promise<PdfParserFn> {
    if (this.cachedPdfParser) return this.cachedPdfParser;

    const subpath = 'pdf-parse/lib/pdf-parse.js';

    // 1. Thử load 'pdf-parse/lib/pdf-parse.js' qua require (tránh bug module.parent của index.js)
    const lib = this.safeRequire(subpath);
    let resolved = this.resolveParserFn(lib);
    if (resolved) {
      this.cachedPdfParser = resolved;
      return resolved;
    }

    // 2. Thử load 'pdf-parse' gốc qua require
    const root = this.safeRequire('pdf-parse');
    resolved = this.resolveParserFn(root);
    if (resolved) {
      this.cachedPdfParser = resolved;
      return resolved;
    }

    // 3. Fallback qua dynamic import cho ESM
    const esmLib = await this.safeImport(subpath);
    resolved = this.resolveParserFn(esmLib);
    if (resolved) {
      this.cachedPdfParser = resolved;
      return resolved;
    }

    const esmRoot = await this.safeImport('pdf-parse');
    resolved = this.resolveParserFn(esmRoot);
    if (resolved) {
      this.cachedPdfParser = resolved;
      return resolved;
    }

    throw new Error(
      'Không thể phân giải hàm xử lý của thư viện pdf-parse (kiểm tra lại package pdf-parse).',
    );
  }

  private resolveParserFn(candidate: unknown): PdfParserFn | undefined {
    if (typeof candidate === 'function') {
      return candidate as PdfParserFn;
    }

    if (typeof candidate === 'object' && candidate !== null) {
      const obj = candidate as Record<string, unknown>;

      if (typeof obj.default === 'function') {
        return obj.default as PdfParserFn;
      }

      if (
        typeof obj.default === 'object' &&
        obj.default !== null &&
        typeof (obj.default as Record<string, unknown>).default === 'function'
      ) {
        return (obj.default as Record<string, unknown>).default as PdfParserFn;
      }
    }

    return undefined;
  }

  // =========================================================================
  // XỬ LÝ PHÂN TÍCH WORD DOCX
  // =========================================================================

  private async parseDocx(buffer: Buffer): Promise<string> {
    try {
      const mammoth = await this.getMammothHandler();
      const result = await mammoth.extractRawText({ buffer });
      return this.normalizeText(result.value);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`mammoth parsing thất bại (${errMsg}), fallback buffer`);
      return this.normalizeText(buffer.toString('utf-8'));
    }
  }

  private async getMammothHandler(): Promise<MammothHandler> {
    if (this.cachedMammoth) {
      return this.cachedMammoth;
    }

    const reqMod = this.safeRequire('mammoth');
    let resolved = this.resolveMammothHandler(reqMod);
    if (resolved) {
      this.cachedMammoth = resolved;
      return resolved;
    }

    const esmMod = await this.safeImport('mammoth');
    resolved = this.resolveMammothHandler(esmMod);
    if (resolved) {
      this.cachedMammoth = resolved;
      return resolved;
    }

    throw new Error('Không thể phân giải module mammoth để đọc tệp Word.');
  }

  private resolveMammothHandler(
    candidate: unknown,
  ): MammothHandler | undefined {
    if (
      typeof candidate === 'object' &&
      candidate !== null &&
      'extractRawText' in candidate &&
      typeof (candidate as Record<string, unknown>).extractRawText ===
        'function'
    ) {
      return candidate as MammothHandler;
    }

    if (
      typeof candidate === 'object' &&
      candidate !== null &&
      'default' in candidate
    ) {
      const def = (candidate as Record<string, unknown>).default;
      if (
        typeof def === 'object' &&
        def !== null &&
        'extractRawText' in def &&
        typeof (def as Record<string, unknown>).extractRawText === 'function'
      ) {
        return def as MammothHandler;
      }
    }

    return undefined;
  }

  // =========================================================================
  // TIỆN ÍCH CHUẨN HOÁ VĂN BẢN
  // =========================================================================

  private normalizeText(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
