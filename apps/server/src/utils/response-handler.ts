import type { Response } from 'express';

export const sendResponse = (
  res: Response,
  statusCode: number,
  message: string,
  data: unknown = null,
) =>
  res.status(statusCode).json({
    status: statusCode,
    success: statusCode >= 400 ? false : true,
    message,
    data,
  });
