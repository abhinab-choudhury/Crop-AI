import * as React from 'react';
import {
  View,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Text,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  downloadModel,
  getModelInfo,
  getPartialDownload,
  getRemoteModelSize,
  isModelCached,
  predictDisease,
  testModelOnDevice,
  MODEL_URL,
  MODEL_FILENAME,
  type DiseasePrediction,
} from '@/lib/disease-detection';

type ScreenState =
  | { status: 'checking' }
  | { status: 'download' }
  | { status: 'error'; message: string }
  | { status: 'ready' };

const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return '0 MB';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const formatSpeed = (bytesPerSec: number): string => {
  if (bytesPerSec <= 0) return '—';
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
  return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
};

const formatEta = (seconds: number): string => {
  if (!isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return `${Math.ceil(seconds)}s left`;
  return `${Math.ceil(seconds / 60)}m ${Math.ceil(seconds % 60)}s left`;
};

export default function DiagnosisScreen() {
  const [screen, setScreen] = React.useState<ScreenState>({ status: 'checking' });
  const [modelSize, setModelSize] = React.useState(0);
  const [selectedImage, setSelectedImage] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<DiseasePrediction | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [downloadProgress, setDownloadProgress] = React.useState(0);
  const [downloadStats, setDownloadStats] = React.useState({
    received: 0,
    total: 0,
    speed: 0,
    eta: 0,
  });
  const [resuming, setResuming] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const cancelRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    if (isModelCached()) {
      setScreen({ status: 'ready' });
    } else {
      setScreen({ status: 'download' });
      setResuming(!!getPartialDownload());
      getRemoteModelSize()
        .then(setModelSize)
        .catch(() => {});
    }
  }, []);

  const startDownload = async () => {
    if (!MODEL_URL) {
      Alert.alert(
        'Model URL missing',
        'Set EXPO_PUBLIC_DISEASE_MODEL_URL in apps/native/.env to the hosted .onnx file, then restart the app.',
      );
      return;
    }

    const controller = new AbortController();
    cancelRef.current = controller;
    setScreen({ status: 'download' });
    setDownloadProgress(0);
    setDownloadStats({ received: 0, total: 0, speed: 0, eta: 0 });
    setResuming(!!getPartialDownload());

    const start = Date.now();
    let lastReceived = 0;
    let lastAt = Date.now();

    try {
      await downloadModel((fraction, received, total) => {
        const now = Date.now();
        const dt = now - lastAt;
        const speed = dt > 0 ? ((received - lastReceived) / dt) * 1000 : 0;
        lastReceived = received;
        lastAt = now;
        const remaining = total - received;
        const eta = speed > 0 ? remaining / speed : 0;
        setDownloadProgress(fraction);
        setDownloadStats({ received, total, speed, eta });
      }, controller.signal);
      setScreen({ status: 'ready' });
      setResuming(false);
    } catch (error) {
      const aborted =
        error instanceof Error && (error.message === 'aborted' || error.name === 'AbortError');
      if (aborted) {
        setScreen({ status: 'download' });
        setResuming(!!getPartialDownload());
        return;
      }
      setScreen({
        status: 'error',
        message: `Download failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      cancelRef.current = null;
    }
  };

  const cancelDownload = () => {
    cancelRef.current?.abort();
  };

  const runModelTest = async () => {
    setTesting(true);
    try {
      const result = await testModelOnDevice();
      Alert.alert(result.ok ? 'Model works ✓' : 'Model check failed', result.message);
    } catch (error) {
      Alert.alert('Model check failed', String(error instanceof Error ? error.message : error));
    } finally {
      setTesting(false);
    }
  };

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ base64: false, quality: 1 });
    if (!res.canceled) {
      setSelectedImage(res.assets[0].uri);
      setResult(null);
      predict(res.assets[0].uri);
    }
  };

  const captureImage = async () => {
    const res = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (!res.canceled) {
      setSelectedImage(res.assets[0].uri);
      setResult(null);
      predict(res.assets[0].uri);
    }
  };

  const predict = async (imageUri: string) => {
    try {
      setLoading(true);
      const prediction = await predictDisease(imageUri);
      setResult(prediction);
    } catch (error) {
      console.error('Prediction error:', error);
      setResult(null);
      Alert.alert('Prediction failed', String(error instanceof Error ? error.message : error));
    } finally {
      setLoading(false);
    }
  };

  if (screen.status === 'checking') {
    return (
      <View className="flex-1 bg-white px-6 pt-12 justify-center items-center">
        <ActivityIndicator size="large" color="#14B8A6" />
        <Text className="mt-3 text-gray-500 font-poppinsRegular text-sm">Checking model…</Text>
      </View>
    );
  }

  const showModelCard = screen.status !== 'ready';
  const percent = Math.round(downloadProgress * 100);

  return (
    <View className="flex-1 bg-white">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="pt-2 text-center font-poppinsRegular text-teal-600 text-base mt-1 max-w-xs self-center">
          {showModelCard
            ? 'Runs 100% on your device. The model downloads once, then works offline forever.'
            : 'Snap or pick a leaf photo. The neural network diagnoses it on-device — no internet needed.'}
        </Text>

        {showModelCard && (
          <View className="w-full bg-teal-50 rounded-3xl p-6 border border-teal-100 mt-6">
            <View className="flex-row items-center gap-3">
              <View className="w-12 h-12 rounded-2xl bg-teal-600 items-center justify-center">
                <Ionicons name="file-tray-full-outline" size={26} color="#fff" />
              </View>
              <View className="flex-1">
                <Text className="text-teal-900 font-poppinsSemiBold text-lg">AI Model</Text>
                <Text className="text-teal-600 font-poppinsRegular text-sm" numberOfLines={1}>
                  {MODEL_FILENAME}
                  {modelSize > 0 ? ` · ${formatBytes(modelSize)}` : ''}
                </Text>
              </View>
            </View>

            {screen.status === 'error' && (
              <View className="mt-4 rounded-2xl bg-red-50 border border-red-200 px-4 py-3">
                <Text className="text-red-700 font-poppinsRegular text-sm text-center">
                  {screen.message}
                </Text>
              </View>
            )}

            {screen.status === 'download' ? (
              <View className="mt-5">
                {resuming && downloadProgress === 0 && (
                  <View className="mb-3 flex-row items-center gap-2 justify-center">
                    <Ionicons name="play-skip-forward" size={16} color="#0f766e" />
                    <Text className="text-teal-700 font-poppinsRegular text-sm">
                      Resuming a previous download…
                    </Text>
                  </View>
                )}

                <View className="flex-row justify-between items-end mb-1">
                  <Text className="text-teal-800 font-poppinsSemiBold text-xl">{percent}%</Text>
                  <Text className="text-teal-600 font-poppinsRegular text-sm">
                    {formatBytes(downloadStats.received)}
                    {downloadStats.total > 0 ? ` of ${formatBytes(downloadStats.total)}` : ''}
                  </Text>
                </View>
                <View className="h-4 w-full bg-teal-100 rounded-full overflow-hidden">
                  <View
                    className="h-full bg-teal-600 rounded-full"
                    style={{
                      width: `${downloadProgress > 0 ? Math.max(3, percent) : 1}%`,
                    }}
                  />
                </View>
                <View className="flex-row justify-between mt-3">
                  <Text className="text-teal-600 font-poppinsRegular text-xs">
                    {formatSpeed(downloadStats.speed)}
                  </Text>
                  <Text className="text-teal-600 font-poppinsRegular text-xs">
                    {formatEta(downloadStats.eta)}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={cancelDownload}
                  className="mt-4 rounded-2xl border border-teal-300 bg-white py-3 items-center"
                >
                  <Text className="text-teal-700 font-poppinsSemiBold text-base">Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={startDownload}
                className="mt-5 bg-teal-600 rounded-2xl py-4 items-center shadow-md active:opacity-90"
              >
                <View className="flex-row items-center gap-2">
                  <Ionicons name="download-outline" size={20} color="#fff" />
                  <Text className="text-white font-poppinsSemiBold text-base">Download Model</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}

        {!showModelCard && selectedImage && (
          <Image
            source={{ uri: selectedImage }}
            className="w-64 h-64 rounded-3xl shadow-lg self-center mt-6"
            resizeMode="cover"
          />
        )}

        {!showModelCard && !selectedImage && !loading && (
          <View className="mt-10 items-center">
            <View className="w-20 h-20 rounded-full bg-teal-50 items-center justify-center">
              <Ionicons name="leaf" size={40} color="#14B8A6" />
            </View>
            <Text className="text-gray-500 font-poppinsRegular text-sm mt-4 max-w-xs text-center">
              Choose a photo of a plant leaf or crop below to get an instant diagnosis.
            </Text>
          </View>
        )}

        {!showModelCard && loading && (
          <View className="items-center mt-8">
            <ActivityIndicator size="large" color="#14B8A6" />
            <Text className="text-gray-500 font-poppinsRegular text-sm mt-3">
              Analysing image on device…
            </Text>
          </View>
        )}

        {!showModelCard && result && !loading && (
          <View className="mt-6 rounded-3xl border p-5 shadow-sm bg-white border-teal-100">
            <View className="flex-row items-center gap-3 mb-4">
              <View className="w-12 h-12 rounded-2xl bg-teal-600 items-center justify-center">
                <Ionicons
                  name={result.disease === 'Healthy' ? 'checkmark-done' : 'pulse'}
                  size={26}
                  color="#fff"
                />
              </View>
              <View className="flex-1">
                <Text className="text-gray-500 font-poppinsRegular text-sm">Plant detected</Text>
                <Text className="text-gray-900 font-poppinsSemiBold text-lg">
                  {result.plantName}
                </Text>
              </View>
              <View
                className={`rounded-full px-3 py-1 ${
                  result.disease === 'Healthy' ? 'bg-green-100' : 'bg-amber-100'
                }`}
              >
                <Text
                  className={`font-poppinsSemiBold text-xs ${
                    result.disease === 'Healthy' ? 'text-green-700' : 'text-amber-700'
                  }`}
                >
                  {result.disease === 'Healthy' ? 'Healthy' : 'Disease'}
                </Text>
              </View>
            </View>

            <Text className="text-gray-900 font-poppinsSemiBold text-xl">
              {result.disease === 'Healthy' ? 'Looks healthy 🎉' : result.disease}
            </Text>

            <View className="mt-4">
              <View className="flex-row justify-between mb-1">
                <Text className="text-gray-500 font-poppinsRegular text-sm">Confidence</Text>
                <Text className="text-teal-700 font-poppinsSemiBold text-sm">
                  {(result.confidence * 100).toFixed(1)}%
                </Text>
              </View>
              <View className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
                <View
                  className="h-full bg-teal-600 rounded-full"
                  style={{ width: `${Math.round(result.confidence * 100)}%` }}
                />
              </View>
            </View>

            <Text className="text-gray-500 font-poppinsRegular text-xs mt-4 text-center">
              {result.isConfident
                ? 'On-device · processed offline, nothing leaves your phone'
                : 'Low confidence — verify before treating your crops'}
            </Text>
          </View>
        )}
      </ScrollView>

      {!showModelCard && (
        <>
          <TouchableOpacity
            onPress={runModelTest}
            disabled={loading || testing}
            className="self-end mr-5 mb-2 flex-row items-center rounded-full border border-teal-200 bg-teal-50 px-4 py-2 active:opacity-80"
          >
            {testing ? (
              <ActivityIndicator size="small" color="#0f766e" />
            ) : (
              <Ionicons name="flask-outline" size={16} color="#0f766e" />
            )}
            <Text className="ml-2 text-sm font-poppinsSemiBold text-teal-700">
              {testing ? 'Testing…' : 'Test model'}
            </Text>
          </TouchableOpacity>

          <View className="flex-row justify-between gap-3 px-5 pb-6 pt-2">
            <TouchableOpacity
              onPress={pickImage}
              disabled={loading}
              className="flex-1 flex-row justify-center items-center p-4 rounded-2xl bg-teal-600 shadow-md active:opacity-90"
            >
              <Ionicons name="images-sharp" size={22} color="white" />
              <Text className="text-white ml-2 font-poppinsSemiBold">Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={captureImage}
              disabled={loading}
              className="flex-1 flex-row justify-center items-center p-4 rounded-2xl bg-teal-600 shadow-md active:opacity-90"
            >
              <Ionicons name="camera-outline" size={22} color="white" />
              <Text className="text-white ml-2 font-poppinsSemiBold">Camera</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {showModelCard && getModelInfo().downloaded && (
        <Text className="text-center text-gray-400 font-poppinsRegular text-xs pb-3">
          Model cached locally
        </Text>
      )}
    </View>
  );
}
