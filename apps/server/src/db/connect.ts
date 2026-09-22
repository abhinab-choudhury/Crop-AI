import mongoose from 'mongoose';
import env from '../utils/env.js';

export async function connectDB() {
  const connection = await mongoose.connect(env.DATABASE_URL);
  console.log(`✅ MongoDB connected: ${connection.connection.host}`);
  return connection;
}
