import { initLlama, releaseAllLlama, type LlamaContext, type TokenData } from 'llama.rn';
import { Directory, File, Paths } from 'expo-file-system';
import { getSetting, setSetting } from '@/lib/db';

export type LlmModelId = 'qwen2.5-0.5b' | 'qwen2.5-1.5b' | 'qwen2.5-vl-3b';

export interface LlmModelInfo {
  id: LlmModelId;
  label: string;
  description: string;
  filename: string;
  url: string;
  approxSize: string;
  contextLength: number;
  sizeBytes: number;
  /** Present only for multimodal (vision) models — the mmproj projector GGUF. */
  mmprojFilename?: string;
  mmprojUrl?: string;
  mmprojSizeBytes?: number;
  /** True when the model can accept images (a vision encoder is bundled). */
  vision?: boolean;
}

const HF_BASE = 'https://huggingface.co';
const GGUF = 'resolve/main';

export const LLM_MODELS: LlmModelInfo[] = [
  {
    id: 'qwen2.5-0.5b',
    label: 'Qwen 2.5 0.5B',
    description: 'Fast & light — best for weak devices',
    filename: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    url:
      process.env.EXPO_PUBLIC_LLM_MODEL_0_5B_URL ??
      `${HF_BASE}/Qwen/Qwen2.5-0.5B-Instruct-GGUF/${GGUF}/qwen2.5-0.5b-instruct-q4_k_m.gguf`,
    approxSize: '~0.5 GB',
    contextLength: 2048,
    sizeBytes: 491400032,
  },
  {
    id: 'qwen2.5-1.5b',
    label: 'Qwen 2.5 1.5B',
    description: 'Smarter answers — recommended',
    filename: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    url:
      process.env.EXPO_PUBLIC_LLM_MODEL_1_5B_URL ??
      `${HF_BASE}/Qwen/Qwen2.5-1.5B-Instruct-GGUF/${GGUF}/qwen2.5-1.5b-instruct-q4_k_m.gguf`,
    approxSize: '~1 GB',
    contextLength: 2048,
    sizeBytes: 1117320736,
  },
  {
    id: 'qwen2.5-vl-3b',
    label: 'Qwen 2.5-VL 3B',
    description: 'Vision model — reads photos of crops & leaves',
    filename: 'Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf',
    url:
      process.env.EXPO_PUBLIC_LLM_MODEL_VISION_URL ??
      `${HF_BASE}/ggml-org/Qwen2.5-VL-3B-Instruct-GGUF/${GGUF}/Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf`,
    mmprojFilename: 'mmproj-Qwen2.5-VL-3B-Instruct-f16.gguf',
    mmprojUrl:
      process.env.EXPO_PUBLIC_LLM_MMPROJ_URL ??
      `${HF_BASE}/ggml-org/Qwen2.5-VL-3B-Instruct-GGUF/${GGUF}/mmproj-Qwen2.5-VL-3B-Instruct-f16.gguf`,
    mmprojSizeBytes: 1240000000,
    approxSize: '~3.1 GB (backbone + vision)',
    contextLength: 4096,
    sizeBytes: 1934123648,
    vision: true,
  },
];

const DL_CHUNK_BYTES = 8 * 1024 * 1024;
const DL_MAX_ATTEMPTS = 5;
const DL_RETRY_BASE_MS = 1000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const DEFAULT_MODEL_ID: LlmModelId = 'qwen2.5-1.5b';

const SETTING_MODEL = 'llm.model';

const getModelDir = (): Directory => new Directory(Paths.document.uri, 'models');

const getModelFile = (id: LlmModelId): File =>
  new File(Paths.document.uri, 'models', getModelInfo(id).filename);

const getMmprojFile = (id: LlmModelId): File | null => {
  const info = getModelInfo(id);
  return info.mmprojFilename ? new File(Paths.document.uri, 'models', info.mmprojFilename) : null;
};

export function getModelInfo(id: LlmModelId): LlmModelInfo {
  const info = LLM_MODELS.find((m) => m.id === id);
  if (!info) throw new Error(`Unknown LLM model: ${id}`);
  return info;
}

export function modelSupportsVision(id: LlmModelId): boolean {
  return !!getModelInfo(id).vision;
}

export function isModelDownloaded(id: LlmModelId): boolean {
  return getModelDownloadInfo(id).downloaded;
}

export function getModelDownloadInfo(id: LlmModelId): { downloaded: boolean; size: number } {
  const info = getModelInfo(id);
  const file = getModelFile(id);
  const size = file.exists ? (file.size ?? 0) : 0;
  const expectedSize = Math.floor(info.sizeBytes * 0.99);

  // Vision models are only usable when BOTH the text backbone and the mmproj
  // vision encoder are on disk.
  let mmprojOk = true;
  let totalSize = size;
  if (info.mmprojFilename && info.mmprojSizeBytes) {
    const mmproj = getMmprojFile(id);
    const mmprojSize = mmproj?.exists ? (mmproj.size ?? 0) : 0;
    totalSize += mmprojSize;
    mmprojOk = mmprojSize >= Math.floor(info.mmprojSizeBytes * 0.99);
  }

  return { downloaded: file.exists && size >= expectedSize && mmprojOk, size: totalSize };
}

const toNativePath = (uri: string): string =>
  uri.startsWith('file://') ? uri.slice('file://'.length) : uri;

/**
 * Fetches a byte range, retrying with exponential backoff. A chunk failure only
 * loses that chunk, so interrupted connections resume instead of restarting the
 * whole model download.
 */
async function fetchRange(
  url: string,
  start: number,
  end: number,
  attempts: number = DL_MAX_ATTEMPTS,
): Promise<Uint8Array> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Range: `bytes=${start}-${end}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (res.status === 206) return bytes;
      throw new Error(`Server ignored Range request (HTTP ${res.status})`);
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await sleep(DL_RETRY_BASE_MS * 2 ** attempt);
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to download chunk ${start}-${end}`);
}

/** Resolves the remote size of a file, preferring HEAD / a 0-byte Range probe. */
async function resolveRemoteSize(url: string): Promise<number> {
  try {
    const head = await fetch(url, { method: 'HEAD' });
    const len = Number(head.headers.get('content-length') ?? 0);
    if (len > 0) return len;
  } catch (error) {
    // HEAD unsupported — fall through to a Range probe
  }
  try {
    const probe = await fetch(url, { headers: { Range: 'bytes=0-0' } });
    const match = /bytes\s+0-0\/(\d+)/.exec(probe.headers.get('content-range') ?? '');
    if (match) return Number(match[1]);
  } catch (error) {
    // range unsupported — caller falls back to a single request
  }
  return 0;
}

interface FileDownloadOptions {
  url: string;
  dest: File;
  /** Known remote size (0 = unknown). */
  totalHint?: number;
  /** Expected size used to sanity-check when `totalHint` is unknown. */
  expectedBytes?: number;
  /** Total bytes already committed across this model download (for multi-file aggregate). */
  baseBytes?: number;
  /** Grand total across all files (for multi-file aggregate fraction). */
  grandTotal?: number;
  onProgress?: (fraction: number, bytes: number, total: number) => void;
}

/**
 * Downloads one GGUF to `dest`, byte-range by byte-range, appending each chunk.
 * Progress is reported against the whole model bundle (not just this file) when
 * `grandTotal` is set, which is how the vision model reports a single progress
 * bar across its backbone + mmproj files.
 */
async function downloadOneFile(options: FileDownloadOptions): Promise<void> {
  const {
    url,
    dest,
    totalHint = 0,
    expectedBytes = 0,
    baseBytes = 0,
    grandTotal = 0,
    onProgress,
  } = options;

  const dir = dest.parentDirectory;
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true });
  }

  let total = totalHint > 0 ? totalHint : await resolveRemoteSize(url);
  const expected = total > 0 ? total : expectedBytes;

  if (dest.exists && expected > 0 && (dest.size ?? 0) >= expected) {
    const done = baseBytes + (dest.size ?? 0);
    onProgress?.(grandTotal > 0 ? Math.min(1, done / grandTotal) : 1, done, grandTotal || expected);
    return;
  }

  if (dest.exists) {
    dest.delete();
  }
  dest.create({ intermediates: true, overwrite: true });

  const handle = dest.open();
  let offset = 0;
  try {
    if (total > 0) {
      while (offset < total) {
        const end = Math.min(offset + DL_CHUNK_BYTES - 1, total - 1);
        const bytes = await fetchRange(url, offset, end);
        handle.offset = offset;
        handle.writeBytes(bytes);
        offset += bytes.byteLength;
        const done = baseBytes + offset;
        onProgress?.(
          grandTotal > 0 ? Math.min(1, done / grandTotal) : Math.min(1, offset / total),
          done,
          grandTotal || total,
        );
      }
    } else {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      handle.writeBytes(bytes);
      offset = bytes.byteLength;
      const done = baseBytes + offset;
      onProgress?.(
        expected > 0 ? Math.min(1, done / (grandTotal || expected)) : 1,
        done,
        grandTotal || expected,
      );
    }
  } finally {
    handle.close();
  }

  if (expected > 0 && offset < expected) {
    throw new Error('Download incomplete');
  }
}

/**
 * Downloads and caches a model (first-run only). Afterwards the model is
 * available fully offline, exactly like the ONNX disease model.
 *
 * The download is split into fixed-size byte ranges that are appended to the
 * target file. Each chunk is retried independently, so a dropped connection
 * (common on mobile networks when downloading hundreds of MB) resumes rather
 * than restarting from zero.
 *
 * Vision models download two files — the text backbone and the mmproj vision
 * encoder (initMultimodal) — reported as one combined progress value.
 */
export async function downloadModel(
  id: LlmModelId,
  onProgress?: (fraction: number, bytes: number, total: number) => void,
): Promise<void> {
  const info = getModelInfo(id);

  const files: { url: string; dest: File; totalHint: number; expectedBytes: number }[] = [
    {
      url: info.url,
      dest: getModelFile(id),
      totalHint: await resolveRemoteSize(info.url),
      expectedBytes: info.sizeBytes,
    },
  ];
  if (info.mmprojUrl && info.mmprojFilename) {
    files.push({
      url: info.mmprojUrl,
      dest: getMmprojFile(id) as File,
      totalHint: await resolveRemoteSize(info.mmprojUrl),
      expectedBytes: info.mmprojSizeBytes ?? 0,
    });
  }

  const grandTotal = files.reduce((sum, f) => sum + (f.totalHint || f.expectedBytes), 0);
  let baseBytes = 0;

  for (const fileSpec of files) {
    await downloadOneFile({
      ...fileSpec,
      baseBytes,
      grandTotal,
      onProgress: (fraction, bytes, total) => onProgress?.(fraction, bytes, total),
    });
    baseBytes += fileSpec.dest.exists ? (fileSpec.dest.size ?? 0) : fileSpec.totalHint || 0;
    onProgress?.(
      grandTotal > 0 ? Math.min(1, baseBytes / grandTotal) : baseBytes,
      baseBytes,
      grandTotal,
    );
  }

  if (grandTotal > 0 && baseBytes < grandTotal) {
    throw new Error('Download incomplete');
  }
}

export async function deleteModel(id: LlmModelId): Promise<void> {
  if (contextModelId === id) {
    await releaseContext();
  }
  const file = getModelFile(id);
  if (file.exists) {
    file.delete();
  }
  const mmproj = getMmprojFile(id);
  if (mmproj?.exists) {
    mmproj.delete();
  }
}

export function getDownloadedModelIds(): LlmModelId[] {
  return LLM_MODELS.filter((m) => isModelDownloaded(m.id)).map((m) => m.id);
}

export async function getSelectedModelId(): Promise<LlmModelId> {
  const stored = await getSetting(SETTING_MODEL);
  if (stored && LLM_MODELS.some((m) => m.id === stored)) {
    return stored as LlmModelId;
  }
  return DEFAULT_MODEL_ID;
}

export async function setSelectedModelId(id: LlmModelId): Promise<void> {
  if (contextModelId === id) return;
  await releaseContext();
  await setSetting(SETTING_MODEL, id);
}

/**
 * Returns a model id that is actually present on disk — the user's chosen one
 * when downloaded, otherwise any downloaded model, otherwise null.
 */
export async function getReadyModelId(): Promise<LlmModelId | null> {
  const preferred = await getSelectedModelId();
  if (isModelDownloaded(preferred)) return preferred;
  const downloaded = getDownloadedModelIds();
  return downloaded.length ? downloaded[0] : null;
}

let context: LlamaContext | null = null;
let contextModelId: LlmModelId | null = null;

async function getContext(modelId: LlmModelId): Promise<LlamaContext> {
  if (context && contextModelId === modelId) {
    return context;
  }
  await releaseContext();

  const info = getModelInfo(modelId);
  const modelPath = toNativePath(getModelFile(modelId).uri);

  // CPU only: the Android emulator has no usable GPU; also keeps x86_64 builds fast.
  // Vision models must run with context shifting disabled (media positions rely
  // on a stable KV cache), and get a bigger context for image tokens.
  context = await initLlama(
    {
      model: modelPath,
      n_ctx: info.contextLength,
      use_mlock: false,
      use_mmap: true,
      n_gpu_layers: 0,
      ctx_shift: false,
    },
    () => {
      // progress callback for model load (per-token evaluation starts after load)
    },
  );

  // Attach the vision encoder for multimodal models so chat messages can carry
  // images. use_gpu is false (CPU) to match the rest of the pipeline.
  if (info.vision && info.mmprojFilename) {
    const mmproj = getMmprojFile(modelId);
    if (mmproj?.exists) {
      const ok = await context.initMultimodal({ path: toNativePath(mmproj.uri), use_gpu: false });
      if (!ok) {
        await context.release().catch(() => {});
        context = null;
        contextModelId = null;
        throw new Error(`Failed to enable vision support for ${info.label}.`);
      }
    }
  }

  contextModelId = modelId;
  return context;
}

export async function releaseContext(): Promise<void> {
  if (context) {
    try {
      context.stopCompletion();
    } catch (error) {
      // context may already be released
    }
    try {
      await context.release();
    } catch (error) {
      // ignore
    }
    context = null;
    contextModelId = null;
  }
}

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** When set, the message is sent as a multimodal text+image payload. */
  imageUri?: string | null;
}

export type ChatLanguage = 'english' | 'hindi' | 'bengali' | 'tamil';

export interface ChatLanguageOption {
  id: ChatLanguage;
  /** Human-readable name in English, e.g. "Hindi". */
  label: string;
  /** The language written in its own script, e.g. "हिन्दी". */
  native: string;
}

export const CHAT_LANGUAGES: ChatLanguageOption[] = [
  { id: 'english', label: 'English', native: 'English' },
  { id: 'hindi', label: 'Hindi', native: 'हिन्दी' },
  { id: 'bengali', label: 'Bengali', native: 'বাংলা' },
  { id: 'tamil', label: 'Tamil', native: 'தமிழ்' },
];

const SETTING_LANGUAGE = 'chat.language';

/** Returns the farmer's preferred chat language, defaulting to English. */
export async function getChatLanguage(): Promise<ChatLanguage> {
  const stored = await getSetting(SETTING_LANGUAGE);
  const valid = CHAT_LANGUAGES.some((l) => l.id === stored);
  return valid ? (stored as ChatLanguage) : 'english';
}

export async function setChatLanguage(language: ChatLanguage): Promise<void> {
  await setSetting(SETTING_LANGUAGE, language);
  languageRef.current = language;
}

let languageRef: { current: ChatLanguage } = { current: 'english' };

/** Directives threaded into the system prompt so the on-device model replies
 *  in the farmer's chosen language, not just in whatever it was asked in. */
export function languageDirective(language: ChatLanguage): string {
  switch (language) {
    case 'hindi':
      return 'Respond in Hindi (हिन्दी). Write your whole answer in Devanagari script.';
    case 'bengali':
      return 'Respond in Bengali (বাংলা). Write your whole answer in the Bengali script.';
    case 'tamil':
      return 'Respond in Tamil (தமிழ்). Write your whole answer in the Tamil script.';
    default:
      return 'Respond in English.';
  }
}

/** Appends the language instruction to the leading system message so the reply
 *  is generated in the chosen language regardless of how the question was typed. */
function applyLanguage(systemPrompt: string, language: ChatLanguage): string {
  return `${systemPrompt}\n\n${languageDirective(language)}`;
}

export interface OfflineChatOptions {
  messages: ChatMessage[];
  modelId: LlmModelId | null;
  /** Optional preferred reply language. Falls back to the persisted setting. */
  language?: ChatLanguage;
  onToken?: (partial: string, accumulated: string) => void;
  signal?: AbortSignal;
}

const FILTERED = new Set(['<|im_end|>', '<|im_start|>', '<|endoftext|>', '<s>', '</s>', '�']);

function cleanToken(token: string): string {
  if (FILTERED.has(token.trim())) return '';
  return token;
}

/** Converts our chat messages to the connector format, embedding images. */
function toLlamaMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    if (m.imageUri) {
      return {
        role: m.role,
        content: [
          { type: 'text', text: m.content || 'What do you see in this image?' },
          { type: 'image_url', image_url: { url: m.imageUri } },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });
}

/** Appends the reply-language directive to the leading system message so the
 *  model generates its answer in the chosen language, regardless of how the
 *  question was typed. A no-op when there is no system message in the list. */
function injectLanguageDirective(messages: ChatMessage[], language: ChatLanguage): ChatMessage[] {
  let injected = false;
  return messages.map((m) => {
    if (!injected && m.role === 'system') {
      injected = true;
      return { ...m, content: applyLanguage(m.content, language) };
    }
    return m;
  });
}

/**
 * Streams a reply from the on-device model. Returns the full generated text.
 * Throws if no model is downloaded or if aborted.
 */
export async function streamChatMessage({
  messages,
  modelId,
  language,
  onToken,
  signal,
}: OfflineChatOptions): Promise<string> {
  if (!modelId || !isModelDownloaded(modelId)) {
    throw new Error('AI model not downloaded yet. Download it from the Profile screen.');
  }

  const hasImage = messages.some((m) => !!m.imageUri);
  if (hasImage && !modelSupportsVision(modelId)) {
    throw new Error(
      'This model is text-only. Download the Qwen 2.5-VL 3B vision model to send photos.',
    );
  }

  if (signal?.aborted) {
    throw new Error('aborted');
  }

  const replyLanguage = language ?? (await getChatLanguage());
  const ctx = await getContext(modelId);
  const abort = () => ctx.stopCompletion();

  if (signal) {
    signal.addEventListener('abort', abort, { once: true });
  }

  try {
    let accumulated = '';
    const result = await ctx.completion(
      {
        messages: toLlamaMessages(injectLanguageDirective(messages, replyLanguage)),
        n_predict: 512,
        temperature: 0.7,
        top_p: 0.9,
        top_k: 40,
        penalty_repeat: 1.1,
        enable_thinking: false,
        reasoning_format: 'none',
      },
      (data: TokenData) => {
        const next = cleanToken(data.token ?? '');
        if (next) {
          accumulated += next;
          onToken?.(next, accumulated);
        }
      },
    );

    if (signal?.aborted) {
      throw new Error('aborted');
    }
    void result;
    return accumulated;
  } finally {
    if (signal) {
      signal.removeEventListener('abort', abort);
    }
  }
}

const cleanTitle = (raw: string): string => {
  const cleaned = raw
    .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[:.]+$/, '')
    .trim();
  return cleaned.slice(0, 40) || 'New chat';
};

/**
 * Generates a short, precise title for a conversation using the on-device LLM.
 * Returns an empty string when nothing sensible could be produced (e.g. the
 * model is not ready), so callers can fall back to their own default.
 */
export async function suggestChatTitle(
  messages: ChatMessage[],
  modelId: LlmModelId | null,
  signal?: AbortSignal,
): Promise<string> {
  if (!modelId || !isModelDownloaded(modelId) || signal?.aborted) {
    return '';
  }

  const transcript = messages
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  try {
    const ctx = await getContext(modelId);
    let title = '';
    await ctx.completion(
      {
        messages: [
          {
            role: 'system',
            content: applyLanguage(AGRI_SYSTEM_PROMPT, await getChatLanguage()),
          },
          {
            role: 'user',
            content:
              'Write ONE very short chat title (maximum 6 words) that summarizes this conversation. Reply with ONLY the title, no quotes, no punctuation.\n\n' +
              transcript,
          },
        ],
        n_predict: 24,
        temperature: 0.3,
        top_p: 0.9,
        top_k: 20,
        penalty_repeat: 1.2,
        enable_thinking: false,
        reasoning_format: 'none',
      },
      (data: TokenData) => {
        const next = cleanToken(data.token ?? '');
        if (next) title += next;
      },
    );
    return cleanTitle(title);
  } catch (error) {
    if (signal?.aborted) return '';
    console.warn('Title suggestion failed:', error);
    return '';
  }
}

export async function shutdownLlama(): Promise<void> {
  await releaseContext();
  try {
    await releaseAllLlama();
  } catch (error) {
    // ignore
  }
}

export const AGRI_SYSTEM_PROMPT = `You are Crop AI, an offline agricultural assistant running entirely on this device.
You help farmers with crop selection, crop rotation, soil health, fertilizer guidance, pest and disease identification, irrigation, and seasonal planning.
Reply in clear, simple language. Be practical and specific. If a question is outside farming, politely say you only cover agriculture.
You work fully offline with no internet access, so never claim to fetch live weather, market prices, or news.`;
