import * as ort from 'onnxruntime-react-native';
import { decode } from 'fast-png';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

export interface DiseasePrediction {
  predictedClass: string;
  plantName: string;
  disease: string;
  confidence: number;
  isConfident: boolean;
}

export const DISEASE_CLASSES: string[] = [
  'Apple___Apple_scab',
  'Apple___Black_rot',
  'Apple___Cedar_apple_rust',
  'Apple___healthy',
  'Blueberry___healthy',
  'Cherry_(including_sour)___Powdery_mildew',
  'Cherry_(including_sour)___healthy',
  'Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot',
  'Corn_(maize)___Common_rust_',
  'Corn_(maize)___Northern_Leaf_Blight',
  'Corn_(maize)___healthy',
  'Grape___Black_rot',
  'Grape___Esca_(Black_Measles)',
  'Grape___Leaf_blight_(Isariopsis_Leaf_Spot)',
  'Grape___healthy',
  'Orange___Haunglongbing_(Citrus_greening)',
  'Peach___Bacterial_spot',
  'Peach___healthy',
  'Pepper,_bell___Bacterial_spot',
  'Pepper,_bell___healthy',
  'Potato___Early_blight',
  'Potato___Late_blight',
  'Potato___healthy',
  'Raspberry___healthy',
  'Soybean___healthy',
  'Squash___Powdery_mildew',
  'Strawberry___Leaf_scorch',
  'Strawberry___healthy',
  'Tomato___Bacterial_spot',
  'Tomato___Early_blight',
  'Tomato___Late_blight',
  'Tomato___Leaf_Mold',
  'Tomato___Septoria_leaf_spot',
  'Tomato___Spider_mites Two-spotted_spider_mite',
  'Tomato___Target_Spot',
  'Tomato___Tomato_Yellow_Leaf_Curl_Virus',
  'Tomato___Tomato_mosaic_virus',
  'Tomato___healthy',
];

export const DEFAULT_MODEL_URL =
  'https://github.com/abhinab-choudhury/Crop-AI/releases/download/plant-disease-model/resnet9_plant_disease.onnx';
export const MODEL_FILENAME = 'resnet9_plant_disease.onnx';
export const MODEL_URL = process.env.EXPO_PUBLIC_DISEASE_MODEL_URL || DEFAULT_MODEL_URL;
export const MODEL_INPUT_SIZE = 256;

const getModelDir = (): Directory => new Directory(Paths.document.uri, 'models');

const getModelFile = (): File => new File(Paths.document.uri, 'models', MODEL_FILENAME);

/** Downloads land in a `.part` file first — a half-downloaded `.onnx` is never
 *  mistaken for a cached model. The `.part` file is renamed to the real name
 *  only once every byte is on disk. */
const getPartFile = (): File => new File(Paths.document.uri, 'models', `${MODEL_FILENAME}.part`);

const toNativePath = (uri: string): string =>
  uri.startsWith('file://') ? uri.slice('file://'.length) : uri;

// Chunked transfer: a dropped connection only re-sends the last 8 MiB chunk
// instead of restarting the whole model from zero.
const DL_CHUNK_BYTES = 8 * 1024 * 1024;
const DL_MAX_ATTEMPTS = 3;
const DL_RETRY_BASE_MS = 600;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function isModelCached(): boolean {
  return getModelFile().exists;
}

/** Size of an in-progress `.part` download, or null if none exists. Lets the UI
 *  tell the user a previous download will be resumed. */
export function getPartialDownload(): { size: number } | null {
  const part = getPartFile();
  return part.exists && (part.size ?? 0) > 0 ? { size: part.size ?? 0 } : null;
}

let cachedRemoteSize = 0;

/** Resolves and caches the remote model size (used to show "~X MB" upfront). */
export async function getRemoteModelSize(): Promise<number> {
  if (cachedRemoteSize <= 0) {
    cachedRemoteSize = await resolveRemoteSize(MODEL_URL);
  }
  return cachedRemoteSize;
}

export function getModelInfo(): { downloaded: boolean; size: number } {
  const file = getModelFile();
  return { downloaded: file.exists, size: file.exists ? (file.size ?? 0) : 0 };
}

/** Resolves the remote size of the model, preferring HEAD / a 0-byte Range probe. */
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
    // Range unsupported — the caller falls back to a single request
  }
  return 0;
}

/**
 * Fetches one byte range, retrying with exponential backoff. Passes the abort
 * signal through so cancelling the download aborts any in-flight request too.
 */
async function fetchRange(
  url: string,
  start: number,
  end: number,
  signal?: AbortSignal,
  attempts: number = DL_MAX_ATTEMPTS,
): Promise<Uint8Array> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (signal?.aborted) throw new Error('aborted');
    try {
      const res = await fetch(url, {
        headers: { Range: `bytes=${start}-${end}` },
        signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (res.status === 206) return bytes;
      throw new Error(`Server ignored Range request (HTTP ${res.status})`);
    } catch (error) {
      const aborted = signal?.aborted || (error instanceof Error && error.name === 'AbortError');
      if (aborted) throw new Error('aborted');
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
 * Downloads and caches the ONNX model to a `.part` file, then atomically
 * renames it into place. Accurate progress is reported because every downloaded
 * byte is counted, and interrupted downloads resume from the partial file on
 * the next attempt instead of starting over. Pass an AbortSignal to cancel.
 */
export async function downloadModel(
  onProgress?: (fraction: number, bytes: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const dir = getModelDir();
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true });
  }

  const dest = getModelFile();
  if (dest.exists) return;

  const total = await resolveRemoteSize(MODEL_URL);

  // Resume from an existing partial download when it is consistent (<= total).
  const part = getPartFile();
  let offset = 0;
  if (part.exists) {
    const existing = part.size ?? 0;
    if (existing > 0 && (total === 0 || existing <= total)) {
      offset = existing;
    }
  }
  if (offset === 0) {
    part.delete();
  }
  part.create({ intermediates: true, overwrite: true });

  const handle = part.open();
  let wrote = offset;
  try {
    handle.offset = offset;
    if (total > 0) {
      while (wrote < total) {
        if (signal?.aborted) throw new Error('aborted');
        const end = Math.min(wrote + DL_CHUNK_BYTES - 1, total - 1);
        const bytes = await fetchRange(MODEL_URL, wrote, end, signal);
        handle.writeBytes(bytes);
        wrote += bytes.byteLength;
        onProgress?.(Math.min(1, wrote / total), wrote, total);
      }
    } else {
      if (signal?.aborted) throw new Error('aborted');
      const res = await fetch(MODEL_URL, { signal });
      if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      handle.writeBytes(bytes);
      wrote += bytes.byteLength;
      onProgress?.(1, wrote, wrote);
    }
  } finally {
    handle.close();
  }

  if (total > 0 && wrote < total) {
    throw new Error('Download incomplete');
  }

  // Atomic finalize: only now does a fully downloaded model replace the cache.
  if (dest.exists) {
    dest.delete();
  }
  part.move(dest);
}

export function removeModel(): void {
  const file = getModelFile();
  if (file.exists) {
    file.delete();
  }
  const part = getPartFile();
  if (part.exists) {
    part.delete();
  }
}

export interface ModelTestResult {
  ok: boolean;
  message: string;
}

/** Runs a quick sanity pass through the cached ONNX model (loads the session
 *  and evaluates a zeroed input) so users can verify the download is usable
 *  without choosing a real photo. */
export async function testModelOnDevice(): Promise<ModelTestResult> {
  if (!isModelCached()) {
    return { ok: false, message: 'The model is not downloaded yet.' };
  }
  try {
    const session = await loadSession();
    const input = new Float32Array(1 * 3 * MODEL_INPUT_SIZE * MODEL_INPUT_SIZE);
    const feeds: Record<string, ort.Tensor> = {
      input: new ort.Tensor('float32', input, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]),
    };
    const outputs = await session.run(feeds);
    const name = Object.keys(outputs)[0];
    const data = (outputs[name]?.data as ArrayLike<number>) ?? [];
    if (data.length <= 0) {
      return { ok: false, message: 'The model ran but returned no output.' };
    }
    return {
      ok: true,
      message: `Model loads and runs. It produces ${data.length} class scores.`,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Model check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

let sessionPromise: Promise<ort.InferenceSession> | null = null;

function loadSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = loadSessionInternal();
  }
  return sessionPromise;
}

async function loadSessionInternal(): Promise<ort.InferenceSession> {
  if (!isModelCached()) {
    throw new Error('Model has not been downloaded yet.');
  }
  try {
    return await ort.InferenceSession.create(toNativePath(getModelFile().uri));
  } catch (error) {
    sessionPromise = null;
    throw error;
  }
}

/**
 * Converts an image file to the [1, 3, 256, 256] float32 input the resnet expects:
 * resize to 256x256, decode PNG, normalise to [0,1], transpose HWC -> CHW.
 */
async function preprocessImage(sourceUri: string): Promise<Float32Array> {
  const SIZE = MODEL_INPUT_SIZE;

  const resized = await ImageManipulator.manipulateAsync(
    sourceUri,
    [{ resize: { width: SIZE, height: SIZE } }],
    { compress: 1, format: ImageManipulator.SaveFormat.PNG, base64: false },
  );

  const png = decode(await new File(resized.uri).bytes());
  if (png.width !== SIZE || png.height !== SIZE) {
    throw new Error(`Expected ${SIZE}x${SIZE} image, got ${png.width}x${png.height}`);
  }

  const channels = png.channels || 4;
  const input = new Float32Array(1 * 3 * SIZE * SIZE);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const src = (y * SIZE + x) * channels;
      const dst = y * SIZE + x;
      input[0 * SIZE * SIZE + dst] = png.data[src] / 255;
      input[1 * SIZE * SIZE + dst] = png.data[src + 1] / 255;
      input[2 * SIZE * SIZE + dst] = png.data[src + 2] / 255;
    }
  }

  return input;
}

/** Runs the full pipeline: preprocess -> ONNX inference -> softmax -> 38-class label. */
export async function predictDisease(imageUri: string): Promise<DiseasePrediction> {
  const input = await preprocessImage(imageUri);
  const session = await loadSession();

  const feeds: Record<string, ort.Tensor> = {
    input: new ort.Tensor('float32', input, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]),
  };

  const outputs = await session.run(feeds);
  const outputName = Object.keys(outputs)[0];
  if (!outputName) {
    throw new Error('Model returned no outputs.');
  }

  const logits = Array.from(outputs[outputName].data as Float32Array);
  const max = Math.max(...logits);
  const exp = logits.map((v) => Math.exp(v - max));
  const sum = exp.reduce((acc, v) => acc + v, 0);
  const probabilities = exp.map((v) => v / sum);

  let best = 0;
  for (let i = 1; i < probabilities.length; i++) {
    if (probabilities[i] > probabilities[best]) best = i;
  }

  const confidence = probabilities[best] ?? 0;
  const predictedClass = DISEASE_CLASSES[best] ?? `Class_${best}`;

  const parts = predictedClass.split('___');
  const plantName =
    parts[0]?.replace(/_/g, ' ').replace(/,/g, ', ').replace(/\s+/g, ' ').trim() || 'Unknown';
  const disease = parts[1] ? parts[1].replace(/_/g, ' ').trim() : 'Unknown';

  return {
    predictedClass,
    plantName,
    disease,
    confidence,
    isConfident: confidence >= 0.4,
  };
}
