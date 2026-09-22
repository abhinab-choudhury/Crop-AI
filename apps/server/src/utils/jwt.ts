import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import env from './env.js';

export interface TokenPayload {
  sub?: string;
  type?: string;
  [key: string]: unknown;
}

const asPayload = (decoded: JwtPayload | string): TokenPayload => {
  if (typeof decoded === 'string') {
    throw new Error('Invalid token payload');
  }
  return decoded;
};

const expiry = (value: string): SignOptions['expiresIn'] =>
  value as unknown as SignOptions['expiresIn'];

export const signAccessToken = (userId: string): string =>
  jwt.sign({ sub: userId, type: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: expiry(env.JWT_ACCESS_EXPIRES_IN),
  });

export const signRefreshToken = (userId: string): string =>
  jwt.sign({ sub: userId, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: expiry(env.JWT_REFRESH_EXPIRES_IN),
  });

export const signVerificationToken = (userId: string): string =>
  jwt.sign({ sub: userId, type: 'verify' }, env.JWT_ACCESS_SECRET, {
    expiresIn: expiry(env.JWT_VERIFY_EXPIRES_IN),
  });

export const verifyAccessToken = (token: string): TokenPayload =>
  asPayload(jwt.verify(token, env.JWT_ACCESS_SECRET));

export const verifyRefreshToken = (token: string): TokenPayload =>
  asPayload(jwt.verify(token, env.JWT_REFRESH_SECRET));

export const verifyVerificationToken = (token: string): TokenPayload =>
  asPayload(jwt.verify(token, env.JWT_ACCESS_SECRET));
