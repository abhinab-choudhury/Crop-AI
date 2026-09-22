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
export const MODEL_URL = process.env.EXPO_PUBLIC_DISEASE_MODEL_URL ?? DEFAULT_MODEL_URL;
export const MODEL_INPUT_SIZE = 256;

const getModelDir = (): Directory => new Directory(Paths.document.uri, 'models');

const getModelFile = (): File => new File(Paths.document.uri, 'models', MODEL_FILENAME);

const toNativePath = (uri: string): string =>
  uri.startsWith('file://') ? uri.slice('file://'.length) : uri;

export function isModelCached(): boolean {
  return getModelFile().exists;
}

export function getModelInfo(): { downloaded: boolean; size: number } {
  const file = getModelFile();
  return { downloaded: file.exists, size: file.exists ? (file.size ?? 0) : 0 };
}

/**
 * Downloads and caches the ONNX model (first-run only). After this completes the
 * model is available offline forever.
 */
export async function downloadModel(
  onProgress?: (fraction: number, bytes: number, total: number) => void,
): Promise<void> {
  const dir = getModelDir();
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true });
  }

  const dest = getModelFile();
  if (dest.exists) {
    dest.delete();
  }

  let total = 0;
  try {
    const head = await fetch(MODEL_URL, { method: 'HEAD' });
    total = Number(head.headers.get('content-length') || 0);
  } catch (error) {
    // HEAD unsupported — progress will be indeterminate
  }

  const downloadPromise = File.downloadFileAsync(MODEL_URL, dest, { idempotent: true });

  const poll = setInterval(() => {
    const size = dest.size ?? 0;
    onProgress?.(total ? Math.min(1, size / total) : 0, size, total);
  }, 300);

  try {
    await downloadPromise;
  } finally {
    clearInterval(poll);
    const size = dest.size ?? total;
    onProgress?.(total ? Math.min(1, size / total) : 1, size, total);
  }
}

export function removeModel(): void {
  const file = getModelFile();
  if (file.exists) {
    file.delete();
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
