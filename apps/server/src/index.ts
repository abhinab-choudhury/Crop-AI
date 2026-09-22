import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import { connectDB } from './db/connect.js';
import authRouter from './routes/auth.js';
import chatRouter from './routes/chat.js';
import env from './utils/env.js';
import { sendResponse } from './utils/response-handler.js';
import { requireAuth } from './middleware/auth.js';
import upload from './utils/multer.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(
  cors({
    origin: env.CORS_ORIGIN || '*',
    credentials: true,
  }),
);
app.use(express.urlencoded({ extended: true, limit: '16kb' }));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use('/api/auth', authRouter);
app.use('/api/chat', chatRouter);

app.post('/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) {
    return sendResponse(res, 400, 'No file uploaded');
  }

  return sendResponse(res, 200, 'File uploaded successfully', {
    file_path: `uploads/${req.file.filename}`,
    original_name: req.file.originalname,
  });
});

app.get('/health', (_req, res) => {
  return res.json({ status: 200, success: true, message: 'Node.js running', data: null });
});
app.get('', (_req, res) => {
  res.status(200).render('index');
});

const PORT = env.PORT;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server is listening on port http://localhost:${PORT}`);
    });
  })
  .catch((error: Error) => {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    process.exit(1);
  });
