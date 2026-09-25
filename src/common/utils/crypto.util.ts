// common/utils/crypto.util.ts
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
} from 'crypto';
import { InternalServerErrorException } from '@nestjs/common';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits - Độ dài IV tiêu chuẩn tối ưu nhất cho AES-GCM theo NIST SP 800-38D
const SALT = 'nestjs-boilerplate-cookie-vault';

// In-memory cache lưu trữ các khóa 32 bytes đã được dẫn xuất qua scrypt
// Giúp tránh lặp lại phép tính băm scryptSync đắt đỏ trên từng dòng CSDL
const derivedKeyCache = new Map<string, Buffer>();

/**
 * Dẫn xuất khóa 256-bit (32 bytes) từ mật mã bí mật (kèm cơ chế bộ đệm in-memory)
 */
function deriveKey(customSecret?: string): Buffer {
  const secret =
    customSecret ||
    process.env.DATA_ENCRYPTION_KEY ||
    process.env.ENCRYPTION_KEY;

  if (!secret) {
    throw new InternalServerErrorException(
      'ENCRYPTION_KEY chưa được cấu hình trong biến môi trường',
    );
  }

  let key = derivedKeyCache.get(secret);
  if (!key) {
    // Chỉ tính toán scrypt 1 lần duy nhất cho mỗi secret
    key = scryptSync(secret, SALT, 32);
    derivedKeyCache.set(secret, key);
  }

  return key;
}

/**
 * Mã hóa chuỗi plaintext bằng AES-256-GCM.
 * Định dạng đầu ra: base64(iv):base64(authTag):base64(ciphertext)
 */
export function encryptSecret(
  plainText: string | number,
  customSecret?: string,
): string {
  if (plainText === null || plainText === undefined || plainText === '') {
    return '';
  }

  const rawText = String(plainText);
  const key = deriveKey(customSecret);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(rawText, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/**
 * Giải mã payload được sinh ra từ `encryptSecret`.
 * Tự động kiểm tra tính toàn vẹn dữ liệu thông qua AuthTag.
 */
export function decryptSecret(
  encrypted: string,
  customSecret?: string,
): string {
  if (!encrypted || !encrypted.includes(':')) {
    return encrypted || '';
  }

  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new InternalServerErrorException(
      'Dữ liệu mã hóa không hợp lệ (sai định dạng payload)',
    );
  }

  const [ivB64, authTagB64, ciphertextB64] = parts;
  const key = deriveKey(customSecret);

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, 'base64')),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    throw new InternalServerErrorException(
      `Giải mã dữ liệu thất bại (khóa không hợp lệ hoặc dữ liệu bị can thiệp): ${errMsg}`,
    );
  }
}

/**
 * Lớp tiện ích đóng gói chuẩn Class/Static Methods phục vụ các Service NestJS
 */
export class CryptoUtil {
  /**
   * Mã hóa chuỗi hoặc số (Lương, CCCD, Thuế, BHXH)
   */
  static encrypt(
    plainText: string | number | null | undefined,
    customSecret?: string,
  ): string {
    if (plainText === null || plainText === undefined || plainText === '') {
      return '';
    }
    return encryptSecret(plainText, customSecret);
  }

  /**
   * Giải mã về chuỗi gốc (Trả về chuỗi rỗng nếu payload rỗng)
   */
  static decrypt(
    encryptedPayload: string | null | undefined,
    customSecret?: string,
  ): string {
    if (!encryptedPayload) {
      return '';
    }
    return decryptSecret(encryptedPayload, customSecret);
  }

  /**
   * Tạo Blind Index (HMAC-SHA256) phục vụ tìm kiếm O(1) và Unique Constraint
   * mà không cần giải mã hoặc quét toàn bộ bảng.
   */
  static generateBlindIndex(plainText: string, customSecret?: string): string {
    if (!plainText) return '';
    const secret =
      customSecret ||
      process.env.DATA_ENCRYPTION_KEY ||
      process.env.ENCRYPTION_KEY ||
      'default-blind-index-salt';
    return createHmac('sha256', secret).update(plainText.trim()).digest('hex');
  }
}
