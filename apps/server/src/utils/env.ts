import dotenv from 'dotenv';
dotenv.config();

const env = {
  PORT: process.env.PORT || '3000',
  DATABASE_URL: process.env.DATABASE_URL || 'mongodb://localhost:27017/crop-ai',
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  ML_SERVER: process.env.ML_SERVER,
  TAVILY_API_KEY: process.env.TAVILY_API_KEY,
  WEATHER_KEY: process.env.WEATHER_KEY,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  JWT_VERIFY_EXPIRES_IN: process.env.JWT_VERIFY_EXPIRES_IN || '10m',
  SMTP_HOST: process.env.SMTP_HOST || 'localhost',
  SMTP_PORT: process.env.SMTP_PORT || '1025',
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  MAIL_FROM: process.env.MAIL_FROM || 'Crop AI <no-reply@crop-ai.local>',
  BACKEND_PUBLIC_URL: process.env.BACKEND_PUBLIC_URL,
  AUTH_LINK_BASE: process.env.AUTH_LINK_BASE || 'cropai:///',
};

export default env;
