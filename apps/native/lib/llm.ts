import { initLlama, releaseAllLlama, type LlamaContext, type TokenData } from 'llama.rn';
import { Directory, File, Paths } from 'expo-file-system';
import { getSetting, setSetting } from '@/lib/db';

export type LlmModelId = 'qwen2.5-0.5b' | 'qwen2.5-1.5b';

export interface LlmModelInfo {
  id: LlmModelId;
  label: string;
  description: string;
  filename: string;
  url: string;
  approxSize: string;
  contextLength: number;
  sizeBytes: number;
}

const HF_BASE = 'https://huggingface.co/Qwen';
const GGUF = 'resolve/main';

export const LLM_MODELS: LlmModelInfo[] = [
  {
    id: 'qwen2.5-0.5b',
    label: 'Qwen 2.5 0.5B',
    description: 'Fast & light — best for weak devices',
    filename: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    url:
      process.env.EXPO_PUBLIC_LLM_MODEL_0_5B_URL ??
      `${HF_BASE}/Qwen2.5-0.5B-Instruct-GGUF/${GGUF}/qwen2.5-0.5b-instruct-q4_k_m.gguf`,
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
      `${HF_BASE}/Qwen2.5-1.5B-Instruct-GGUF/${GGUF}/qwen2.5-1.5b-instruct-q4_k_m.gguf`,
    approxSize: '~1 GB',
    contextLength: 2048,
    sizeBytes: 1117320736,
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

export function getModelInfo(id: LlmModelId): LlmModelInfo {
  const info = LLM_MODELS.find((m) => m.id === id);
  if (!info) throw new Error(`Unknown LLM model: ${id}`);
  return info;
}

export function isModelDownloaded(id: LlmModelId): boolean {
  return getModelDownloadInfo(id).downloaded;
}

export function getModelDownloadInfo(id: LlmModelId): { downloaded: boolean; size: number } {
  const file = getModelFile(id);
  const size = file.exists ? (file.size ?? 0) : 0;
  const expectedSize = Math.floor(getModelInfo(id).sizeBytes * 0.99);
  return { downloaded: file.exists && size >= expectedSize, size };
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

/**
 * Downloads and caches a GGUF model (first-run only). Afterwards the model is
 * available fully offline, exactly like the ONNX disease model.
 *
 * The download is split into fixed-size byte ranges that are appended to the
 * target file. Each chunk is retried independently, so a dropped connection
 * (common on mobile networks when downloading hundreds of MB) resumes rather
 * than restarting from zero.
 *
 * NOTE: The app is not a strict single path — if the server reports no
 * Content-Length via HEAD, a single whole-body request is used as a fallback.
 */
export async function downloadModel(
  id: LlmModelId,
  onProgress?: (fraction: number, bytes: number, total: number) => void,
): Promise<void> {
  const info = getModelInfo(id);
  const dir = getModelDir();
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true });
  }

  const dest = getModelFile(id);

  let total = 0;
  try {
    const head = await fetch(info.url, { method: 'HEAD' });
    total = Number(head.headers.get('content-length') || 0);
  } catch (error) {
    // HEAD unsupported — the chunked path below falls back to a single request
  }
  const expected = total > 0 ? total : info.sizeBytes;

  if (dest.exists && dest.size >= expected) {
    onProgress?.(1, dest.size, expected);
    return;
  }

  dest.delete();
  dest.create({ intermediates: true, overwrite: true });

  const handle = dest.open();
  let offset = 0;
  try {
    if (total > 0) {
      while (offset < total) {
        const end = Math.min(offset + DL_CHUNK_BYTES - 1, total - 1);
        const bytes = await fetchRange(info.url, offset, end);
        handle.offset = offset;
        handle.writeBytes(bytes);
        offset += bytes.byteLength;
        onProgress?.(Math.min(1, offset / total), offset, total);
      }
    } else {
      const res = await fetch(info.url);
      if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      handle.writeBytes(bytes);
      offset = bytes.byteLength;
      onProgress?.(
        info.sizeBytes ? Math.min(1, offset / info.sizeBytes) : 1,
        offset,
        info.sizeBytes,
      );
    }
  } finally {
    handle.close();
  }

  if (expected > 0 && offset < expected) {
    throw new Error('Download incomplete');
  }

  onProgress?.(1, offset, expected);
}

export async function deleteModel(id: LlmModelId): Promise<void> {
  if (contextModelId === id) {
    await releaseContext();
  }
  const file = getModelFile(id);
  if (file.exists) {
    file.delete();
  }
}

export function getDownloadedModelIds(): LlmModelId[] {
  return LLM_MODELS.filter((m) => isModelDownloaded(m.id)).map((m) => m.id);
}

export async function getSelectedModelId(): Promise<LlmModelId> {
  const stored = await getSetting(SETTING_MODEL);
  if (stored && (stored === 'qwen2.5-0.5b' || stored === 'qwen2.5-1.5b')) {
    return stored;
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

export interface OfflineChatOptions {
  messages: { role: ChatRole; content: string }[];
  modelId: LlmModelId | null;
  onToken?: (partial: string, accumulated: string) => void;
  signal?: AbortSignal;
}

const FILTERED = new Set(['<|im_end|>', '<|im_start|>', '<|endoftext|>', '<s>', '</s>', '�']);

function cleanToken(token: string): string {
  if (FILTERED.has(token.trim())) return '';
  return token;
}

/**
 * Streams a reply from the on-device model. Returns the full generated text.
 * Throws if no model is downloaded or if aborted.
 */
export async function streamChatMessage({
  messages,
  modelId,
  onToken,
  signal,
}: OfflineChatOptions): Promise<string> {
  if (!modelId || !isModelDownloaded(modelId)) {
    throw new Error('AI model not downloaded yet. Download it from the Profile screen.');
  }

  if (signal?.aborted) {
    throw new Error('aborted');
  }

  const ctx = await getContext(modelId);
  const abort = () => ctx.stopCompletion();

  if (signal) {
    signal.addEventListener('abort', abort, { once: true });
  }

  try {
    let accumulated = '';
    const result = await ctx.completion(
      {
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
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
