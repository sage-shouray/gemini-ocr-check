import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { sendError } from '../utils/response';
import multer from 'multer';

export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      sendError(res, 'File too large. Maximum size is 20MB.', 413);
      return;
    }
    sendError(res, `Upload error: ${err.message}`, 400);
    return;
  }

  if (err.message.startsWith('Unsupported file type')) {
    sendError(res, err.message, 415);
    return;
  }

  sendError(res, 'Internal server error', 500);
}
