import * as SQLite from 'expo-sqlite';

const DB_NAME = 'cropai.db';

export interface ThreadRow {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  preview?: string | null;
}

export interface MessageRow {
  id: number;
  thread_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: number;
  /** Local file URI of an image attached to this message, if any. */
  imageUri: string | null;
}

export type ProfileKey =
  | 'profile.name'
  | 'profile.location'
  | 'profile.farm_size'
  | 'profile.preferred_crops';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS threads (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          image_uri TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, id);
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
      `);
      // Migration: older installs created `messages` without image_uri.
      const cols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(messages)');
      if (!cols.some((c) => c.name === 'image_uri')) {
        await db.execAsync('ALTER TABLE messages ADD COLUMN image_uri TEXT');
      }
      return db;
    });
  }
  return dbPromise;
}

export async function initDb(): Promise<void> {
  await getDb();
}

export async function createThread(title: string): Promise<string> {
  const db = await getDb();
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  await db.runAsync(
    'INSERT INTO threads (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
    id,
    title,
    now,
    now,
  );
  return id;
}

export async function listThreads(): Promise<ThreadRow[]> {
  const db = await getDb();
  const rows = (await db.getAllAsync<Record<string, unknown>>(
    `SELECT t.id, t.title, t.created_at, t.updated_at,
            (SELECT content FROM messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS preview
     FROM threads t ORDER BY t.updated_at DESC`,
  )) as unknown as (ThreadRow & { preview: string | null })[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    created_at: r.created_at,
    updated_at: r.updated_at,
    preview: r.preview ?? null,
  }));
}

export async function getThread(threadId: string): Promise<ThreadRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT id, title, created_at, updated_at FROM threads WHERE id = ?',
    threadId,
  );
  return row ? (row as unknown as ThreadRow) : null;
}

export async function getMessages(threadId: string): Promise<MessageRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT id, thread_id, role, content, image_uri, created_at FROM messages WHERE thread_id = ? ORDER BY id ASC',
    threadId,
  );
  return rows.map((r) => ({
    id: r.id as number,
    thread_id: r.thread_id as string,
    role: r.role as MessageRow['role'],
    content: r.content as string,
    imageUri: (r.image_uri as string | null) ?? null,
    created_at: r.created_at as number,
  }));
}

export async function addMessage(
  threadId: string,
  role: 'user' | 'assistant',
  content: string,
  imageUri?: string | null,
): Promise<number> {
  const db = await getDb();
  const now = Date.now();
  const result = await db.runAsync(
    'INSERT INTO messages (thread_id, role, content, image_uri, created_at) VALUES (?, ?, ?, ?, ?)',
    threadId,
    role,
    content,
    imageUri ?? null,
    now,
  );
  await db.runAsync('UPDATE threads SET updated_at = ? WHERE id = ?', now, threadId);
  return result.lastInsertRowId;
}

export async function updateThreadTitle(threadId: string, title: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE threads SET title = ?, updated_at = ? WHERE id = ?',
    title,
    Date.now(),
    threadId,
  );
}

export async function deleteThread(threadId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM messages WHERE thread_id = ?', threadId);
  await db.runAsync('DELETE FROM threads WHERE id = ?', threadId);
}

export async function deleteAllThreads(): Promise<void> {
  const db = await getDb();
  await db.execAsync('DELETE FROM messages; DELETE FROM threads;');
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}
