import * as React from 'react';
import { View, TouchableOpacity, Image, ActivityIndicator, Alert, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  downloadModel,
  isModelCached,
  predictDisease,
  MODEL_URL,
  MODEL_FILENAME,
  type DiseasePrediction,
} from '@/lib/disease-detection';

type ScreenState =
  | { status: 'checking' }
  | { status: 'download' }
  | { status: 'error'; message: string }
  | { status: 'ready' };

export default function DiagnosisScreen() {
  const [screen, setScreen] = React.useState<ScreenState>({ status: 'checking' });
  const [selectedImage, setSelectedImage] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<DiseasePrediction | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [downloadProgress, setDownloadProgress] = React.useState(0);
  const [downloadBytes, setDownloadBytes] = React.useState({ received: 0, total: 0 });

  React.useEffect(() => {
    if (isModelCached()) {
      setScreen({ status: 'ready' });
    } else {
      setScreen({ status: 'download' });
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

    setScreen({ status: 'download' });
    setDownloadProgress(0);
    setDownloadBytes({ received: 0, total: 0 });

    try {
      await downloadModel((fraction, received, total) => {
        setDownloadProgress(fraction);
        setDownloadBytes({ received, total });
      });
      setScreen({ status: 'ready' });
    } catch (error) {
      setScreen({
        status: 'error',
        message: `Download failed: ${error instanceof Error ? error.message : String(error)}`,
      });
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

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 MB';
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  if (screen.status === 'checking') {
    return (
      <View className="flex-1 bg-white px-6 pt-12 justify-center items-center">
        <ActivityIndicator size="large" color="#14B8A6" />
      </View>
    );
  }

  const showModelCard = screen.status !== 'ready';

  return (
    <View className="flex-1 bg-white px-6 pt-12 justify-between">
      <View className="flex-1 justify-center items-center space-y-4">
        <Text className="text-center font-poppinsRegular text-teal-600 text-base max-w-xs">
          {showModelCard
            ? 'This runs 100% on your device. The AI model downloads once, then works offline.'
            : 'Detect crop diseases in real-time using our AI-powered system. Works offline.'}
        </Text>

        {showModelCard && (
          <View className="w-full bg-teal-50 rounded-2xl p-6 shadow-md border border-teal-100 mt-4">
            <Text className="text-teal-800 font-poppinsSemiBold text-lg text-center">
              Download AI Model
            </Text>
            <Text className="text-teal-600 font-poppinsRegular text-sm text-center mt-1">
              {MODEL_FILENAME} — one-time download, then fully offline.
            </Text>

            {screen.status === 'error' && (
              <Text className="text-red-600 font-poppinsRegular text-sm text-center mt-3">
                {screen.message}
              </Text>
            )}

            {screen.status === 'download' ? (
              downloadProgress > 0 ? (
                <View className="mt-4">
                  <View className="h-3 w-full bg-teal-100 rounded-full overflow-hidden">
                    <View
                      className="h-full bg-teal-600 rounded-full"
                      style={{ width: `${Math.round(downloadProgress * 100)}%` }}
                    />
                  </View>
                  <Text className="text-teal-700 font-poppinsRegular text-sm text-center mt-2">
                    {formatBytes(downloadBytes.received)}
                    {downloadBytes.total > 0
                      ? ` / ${formatBytes(downloadBytes.total)}`
                      : ' downloaded'}
                  </Text>
                </View>
              ) : (
                <ActivityIndicator size="small" color="#0f766e" className="mt-4" />
              )
            ) : (
              <TouchableOpacity
                onPress={startDownload}
                className="mt-4 bg-teal-600 rounded-2xl py-3 w-full items-center shadow-md"
              >
                <Text className="text-white font-poppinsSemiBold text-base">Download Model</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {!showModelCard && selectedImage && (
          <Image
            source={{ uri: selectedImage }}
            className="w-64 h-64 rounded-2xl shadow-lg mt-4"
            resizeMode="cover"
          />
        )}

        {!showModelCard && loading && <ActivityIndicator size="large" color="#14B8A6" />}
        {!showModelCard && result && !loading && (
          <View className="mt-4 bg-teal-100 p-4 rounded-2xl shadow-md w-full">
            <Text className="text-teal-800 font-poppinsSemiBold text-lg text-center">
              {result.disease === 'Healthy' ? 'Healthy' : result.disease}
            </Text>
            <Text className="text-teal-700 font-poppinsRegular text-base text-center">
              {result.plantName}
            </Text>
            <Text className="text-teal-700 font-poppinsRegular text-sm text-center mt-1">
              Confidence: {(result.confidence * 100).toFixed(1)}%
            </Text>
            <Text className="text-teal-600 font-poppinsRegular text-xs text-center mt-2">
              {result.isConfident ? 'On-device, offline' : 'Low confidence — verify before acting'}
            </Text>
          </View>
        )}
      </View>

      {!showModelCard && (
        <View className="flex-row justify-between mt-8 mb-6 gap-2">
          <TouchableOpacity
            onPress={pickImage}
            disabled={loading}
            className="flex-1 flex-row justify-center items-center p-4 rounded-2xl bg-teal-600 shadow-md"
          >
            <Ionicons name="images-sharp" size={24} color="white" />
            <Text className="text-white ml-2 font-poppinsSemiBold">Gallery</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={captureImage}
            disabled={loading}
            className="flex-1 flex-row justify-center items-center p-4 rounded-2xl bg-teal-600 shadow-md"
          >
            <Ionicons name="camera-outline" size={24} color="white" />
            <Text className="text-white ml-2 font-poppinsSemiBold">Camera</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
