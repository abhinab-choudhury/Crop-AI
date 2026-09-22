import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/jwt.js';

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized: missing token' });
    }

    const token = header.slice(7);
    const payload = verifyAccessToken(token);
    if (!payload?.sub) {
      return res.status(401).json({ success: false, message: 'Unauthorized: invalid token' });
    }

    req.userId = payload.sub;
    req.auth = payload;
    next();
  } catch (error) {
    return res
      .status(401)
      .json({ success: false, message: 'Unauthorized: invalid or expired token' });
  }
};
