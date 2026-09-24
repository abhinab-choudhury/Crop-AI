import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { getSetting, setSetting } from '@/lib/db';
import {
  LLM_MODELS,
  downloadModel,
  getModelDownloadInfo,
  getModelInfo,
  setSelectedModelId,
  type LlmModelId,
} from '@/lib/llm';
import * as Notifications from 'expo-notifications';

const FIELDS = [
  {
    key: 'profile.name' as const,
    label: 'Full Name',
    placeholder: 'Enter your name',
    icon: 'person-outline',
  },
  {
    key: 'profile.location' as const,
    label: 'Location',
    placeholder: 'Village / district',
    icon: 'location-outline',
  },
  {
    key: 'profile.farm_size' as const,
    label: 'Farm Size',
    placeholder: 'e.g. 2 acres',
    icon: 'resize-outline',
  },
  {
    key: 'profile.preferred_crops' as const,
    label: 'Preferred Crops',
    placeholder: 'e.g. Rice, Tomato',
    icon: 'leaf-outline',
  },
];

const STEP_TOTAL = 2;

const checkOnline = async (url: string): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    await fetch(url, { method: 'HEAD', signal: controller.signal as any });
    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
};

const ensureNotifications = async (): Promise<boolean> => {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return false;
    await Notifications.setNotificationChannelAsync('downloads', {
      name: 'Model Downloads',
      importance: Notifications.AndroidImportance.LOW,
    });
    return true;
  } catch {
    return false;
  }
};

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(1);

  const [values, setValues] = useState<Record<string, string>>({
    'profile.name': '',
    'profile.location': '',
    'profile.farm_size': '',
    'profile.preferred_crops': '',
  });
  const [downloadingId, setDownloadingId] = useState<LlmModelId | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set());
  const permissionsRef = useRef(false);
  const cancelRef = useRef<AbortController | null>(null);

  useEffect(() => {
    LLM_MODELS.forEach((model) => {
      if (getModelDownloadInfo(model.id).downloaded) {
        setDownloaded((prev) => new Set(prev).add(model.id));
      }
    });
  }, []);

  const profileValid = FIELDS.every((f) => values[f.key].trim().length > 0);
  const canContinue = profileValid && downloaded.size > 0;
  const step1Done = profileValid;
  const step2Done = downloaded.size > 0;

  const handleDownload = async (id: LlmModelId) => {
    const controller = new AbortController();
    cancelRef.current = controller;
    setDownloadingId(id);
    setProgress((prev) => ({ ...prev, [id]: 0 }));

    const info = getModelInfo(id);
    const online = await checkOnline(info.url);
    if (!online) {
      Alert.alert('Connection error', 'Could not connect to the internet');
      cancelRef.current = null;
      setDownloadingId(null);
      return;
    }

    let canNotify = false;
    if (!permissionsRef.current) {
      canNotify = await ensureNotifications();
      permissionsRef.current = canNotify;
    } else {
      canNotify = true;
    }

    const dlIdentifier = `download-${id}-${Date.now()}`;

    try {
      if (canNotify) {
        await Notifications.scheduleNotificationAsync({
          identifier: dlIdentifier,
          content: {
            title: `Downloading ${info.label}`,
            body: '0%',
            sound: false,
            priority: Notifications.AndroidNotificationPriority.LOW,
          },
          trigger: null,
        });
      }

      await downloadModel(
        id,
        (fraction) => {
          setProgress((prev) => ({ ...prev, [id]: fraction }));
          if (canNotify) {
            Notifications.scheduleNotificationAsync({
              identifier: dlIdentifier,
              content: {
                title: `Downloading ${info.label}`,
                body: `${Math.round(fraction * 100)}%`,
                sound: false,
                priority: Notifications.AndroidNotificationPriority.LOW,
              },
              trigger: null,
            }).catch(() => {});
          }
        },
        controller.signal,
      );

      setDownloaded((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });

      // Make the onboarding download the app's default (active) model.
      await setSelectedModelId(id);

      await Notifications.dismissNotificationAsync(dlIdentifier).catch(() => {});
    } catch (error) {
      await Notifications.dismissNotificationAsync(dlIdentifier).catch(() => {});
      const aborted =
        error instanceof Error && (error.message === 'aborted' || error.name === 'AbortError');
      if (!aborted) {
        Alert.alert('Download failed', error instanceof Error ? error.message : 'Unknown error');
      }
    } finally {
      cancelRef.current = null;
      setDownloadingId(null);
    }
  };

  const cancelDownload = () => {
    cancelRef.current?.abort();
  };

  const handleContinue = async () => {
    if (!canContinue) return;
    await Promise.all([
      setSetting('profile.name', values['profile.name'].trim()),
      setSetting('profile.location', values['profile.location'].trim()),
      setSetting('profile.farm_size', values['profile.farm_size'].trim()),
      setSetting('profile.preferred_crops', values['profile.preferred_crops'].trim()),
      setSetting('onboarding.completed', 'true'),
    ]);
    router.replace('/(drawer)');
  };

  const goNext = () => {
    if (step < STEP_TOTAL && step1Done) setStep(step + 1);
  };

  const goBack = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <View className="flex-1 bg-gray-50" style={{ paddingTop: insets.top }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : insets.top}
      >
        <ScrollView
          contentContainerClassName="px-5 pt-4 pb-8"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Progress indicator */}
          <View className="flex-row items-center justify-between mb-8">
            {Array.from({ length: STEP_TOTAL }).map((_, i) => (
              <React.Fragment key={i}>
                <View className="flex-1 flex-row items-center">
                  <View
                    className={`h-2.5 rounded-full ${
                      i < step ? 'bg-teal-600' : i === step - 1 ? 'bg-teal-400' : 'bg-gray-200'
                    }`}
                  />
                </View>
                {i < STEP_TOTAL - 1 && <View className="w-3" />}
              </React.Fragment>
            ))}
          </View>

          <Text className="text-3xl font-poppinsBold text-gray-900 mb-2">
            {step === 1 ? "Let's get to know you" : 'Download your AI model'}
          </Text>
          <Text className="text-base text-gray-500 mb-8">
            {step === 1
              ? 'Tell us a bit about your farm so we can personalise your experience.'
              : 'Choose one model to download. It runs entirely on your device after this.'}
          </Text>

          {step === 1 && (
            <View className="gap-5">
              {FIELDS.map((field) => (
                <View
                  key={field.key}
                  className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm"
                >
                  <View className="flex-row items-center mb-2">
                    <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-teal-50">
                      <Ionicons name={field.icon as any} size={20} color="#0d9488" />
                    </View>
                    <Text className="text-base font-semibold text-gray-800">{field.label}</Text>
                  </View>
                  <TextInput
                    value={values[field.key]}
                    onChangeText={(text) => setValues((prev) => ({ ...prev, [field.key]: text }))}
                    placeholder={field.placeholder}
                    placeholderTextColor="#9ca3af"
                    className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                  />
                </View>
              ))}
            </View>
          )}

          {step === 2 && (
            <View className="gap-4">
              {LLM_MODELS.map((model) => {
                const isDownloaded = downloaded.has(model.id);
                const isDownloading = downloadingId === model.id;
                const prog = progress[model.id] ?? 0;

                return (
                  <View
                    key={model.id}
                    className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm"
                  >
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1">
                        <Text className="text-lg font-semibold text-gray-900">{model.label}</Text>
                        <Text className="text-sm text-gray-500 mt-1">
                          {model.description} — {model.approxSize}
                        </Text>
                      </View>
                      {isDownloaded && (
                        <View className="rounded-full bg-green-50 px-3 py-1">
                          <Text className="text-xs font-semibold text-green-700">Ready</Text>
                        </View>
                      )}
                    </View>

                    {isDownloading && (
                      <View className="mt-4">
                        <View className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <View
                            className="h-full rounded-full bg-teal-600"
                            style={{ width: `${Math.round(prog * 100)}%` }}
                          />
                        </View>
                        <View className="flex-row items-center mt-2">
                          <ActivityIndicator size="small" color="#0d9488" />
                          <Text className="text-xs text-gray-500 ml-2">
                            Downloading… {Math.round(prog * 100)}%
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={cancelDownload}
                          className="mt-3 flex-row items-center justify-center rounded-xl border border-gray-300 bg-white py-2.5 active:bg-gray-50"
                        >
                          <Ionicons name="close-circle-outline" size={16} color="#6b7280" />
                          <Text className="ml-2 text-sm font-semibold text-gray-700">Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {isDownloaded && (
                      <View className="mt-3 flex-row items-center">
                        <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                        <Text className="text-green-700 ml-2 text-sm font-medium">Downloaded</Text>
                      </View>
                    )}

                    {!isDownloaded && !isDownloading && (
                      <TouchableOpacity
                        onPress={() => handleDownload(model.id)}
                        className="mt-4 flex-row items-center justify-center rounded-xl bg-teal-600 py-3 active:bg-teal-700"
                      >
                        <Ionicons name="download-outline" size={18} color="white" />
                        <Text className="ml-2 text-sm font-semibold text-white">Download</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          <View className="mt-8 flex-row gap-3">
            {step > 1 && (
              <TouchableOpacity
                onPress={goBack}
                className="flex-1 rounded-xl border border-gray-300 bg-white py-4 items-center active:bg-gray-50"
              >
                <Text className="text-base font-semibold text-gray-700">Back</Text>
              </TouchableOpacity>
            )}

            {step < STEP_TOTAL ? (
              <TouchableOpacity
                onPress={goNext}
                disabled={!step1Done}
                className={`flex-1 rounded-xl py-4 items-center ${
                  step1Done ? 'bg-teal-600 active:bg-teal-700' : 'bg-gray-200'
                }`}
              >
                <Text
                  className={`text-base font-semibold ${step1Done ? 'text-white' : 'text-gray-400'}`}
                >
                  Next
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleContinue}
                disabled={!canContinue}
                className={`flex-1 rounded-xl py-4 items-center ${
                  canContinue ? 'bg-teal-600 active:bg-teal-700' : 'bg-gray-200'
                }`}
              >
                <Text
                  className={`text-base font-semibold ${canContinue ? 'text-white' : 'text-gray-400'}`}
                >
                  Get Started
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
