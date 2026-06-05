import { Response } from 'express';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, data } satisfies ApiResponse<T>);
}

export function sendError(res: Response, error: string, statusCode = 500): void {
  res.status(statusCode).json({ success: false, error } satisfies ApiResponse);
}
