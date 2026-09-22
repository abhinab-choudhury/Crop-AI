declare global {
  namespace Express {
    interface Request {
      userId?: string;
      auth?: { sub?: string; type?: string; [key: string]: unknown };
    }
  }
}

export {};