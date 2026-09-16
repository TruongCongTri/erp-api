import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

export const MAX_CV_FILE_SIZE_MB = 10;
export const MAX_CV_FILE_SIZE_BYTES = MAX_CV_FILE_SIZE_MB * 1024 * 1024;

export const cvMulterOptions: MulterOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: MAX_CV_FILE_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return callback(
        new BadRequestException(
          'Định dạng tệp không hợp lệ. Chỉ chấp nhận tệp định dạng PDF, DOC hoặc DOCX.',
        ),
        false,
      );
    }

    callback(null, true);
  },
};
