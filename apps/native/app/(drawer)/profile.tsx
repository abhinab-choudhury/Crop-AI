import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { getSetting, setSetting } from '@/lib/db';
import {
  LLM_MODELS,
  getSelectedModelId,
  setSelectedModelId,
  downloadModel,
  deleteModel,
  getModelDownloadInfo,
  getModelInfo,
  type LlmModelId,
} from '@/lib/llm';
import * as Notifications from 'expo-notifications';

type EditableRowProps = {
  label: string;
  value: string;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onChangeText: (text: string) => void;
  placeholder?: string;
};

const EditableRow: React.FC<EditableRowProps> = ({
  label,
  value,
  isEditing,
  onEdit,
  onSave,
  onChangeText,
  placeholder,
}) => {
  return (
    <View className="flex-row justify-between items-center mb-4 border-b border-gray-100 pb-4">
      <Text className="text-gray-600 font-semibold w-1/3">{label}</Text>
      <View className="flex-1 items-end">
        {isEditing ? (
          <TextInput
            className="text-gray-800 text-right w-full border-b border-teal-600 px-2"
            value={value}
            onChangeText={onChangeText}
            autoFocus={true}
            placeholder={placeholder}
          />
        ) : (
          <Text className="text-gray-800 text-right" numberOfLines={1}>
            {value}
          </Text>
        )}
      </View>
      <View className="w-16 items-end">
        <TouchableOpacity onPress={isEditing ? onSave : onEdit} className="pl-4">
          <Text className="text-teal-600 font-semibold">{isEditing ? 'Save' : 'Edit'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const fmtBytes = (bytes: number) => {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
};

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

export default function ProfileScreen() {
  const [name, setName] = useState('Farmer');
  const [location, setLocation] = useState('Not provided');
  const [farmSize, setFarmSize] = useState('Not provided');
  const [preferredCrops, setPreferredCrops] = useState('Not specified');

  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [isEditingFarmSize, setIsEditingFarmSize] = useState(false);
  const [isEditingCrops, setIsEditingCrops] = useState(false);

  const [selectedModel, setSelectedModel] = useState<LlmModelId | null>(null);
  const [downloads, setDownloads] = useState<
    Record<string, { downloading: boolean; progress: number }>
  >({});
  const permissionsRef = useRef(false);

  const refreshAll = useCallback(async () => {
    const [storedName, storedLocation, storedFarmSize, storedCrops, model] = await Promise.all([
      getSetting('profile.name'),
      getSetting('profile.location'),
      getSetting('profile.farm_size'),
      getSetting('profile.preferred_crops'),
      getSelectedModelId(),
    ]);
    if (storedName) setName(storedName);
    if (storedLocation) setLocation(storedLocation);
    if (storedFarmSize) setFarmSize(storedFarmSize);
    if (storedCrops) setPreferredCrops(storedCrops);
    setSelectedModel(model);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshAll();
    }, [refreshAll]),
  );

  const handleSave = async (key: string, value: string, setEditing: (v: boolean) => void) => {
    await setSetting(key, value);
    setEditing(false);
  };

  const handleDownload = async (id: LlmModelId) => {
    const fileSize = getModelDownloadInfo(id).downloaded;
    const proceed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        'Download model',
        `Download ${id === 'qwen2.5-1.5b' ? 'Qwen 2.5 1.5B' : 'Qwen 2.5 0.5B'} (${id === 'qwen2.5-1.5b' ? '~1 GB' : '~0.5 GB'})? ` +
          (fileSize
            ? 'A copy already exists and will be replaced.'
            : 'Needs internet once — then it works fully offline.'),
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Download', onPress: () => resolve(true) },
        ],
      );
    });
    if (!proceed) return;

    const info = getModelInfo(id);
    const online = await checkOnline(info.url);
    if (!online) {
      Alert.alert('Connection error', 'Could not connect to the internet');
      return;
    }

    const dlIdentifier = `download-${id}-${Date.now()}`;
    let canNotify = false;
    if (!permissionsRef.current) {
      canNotify = await ensureNotifications();
      permissionsRef.current = canNotify;
    } else {
      canNotify = true;
    }

    setDownloads((prev) => ({ ...prev, [id]: { downloading: true, progress: 0 } }));

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

      await downloadModel(id, (fraction) => {
        setDownloads((prev) => ({ ...prev, [id]: { downloading: true, progress: fraction } }));
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
      });

      await Notifications.dismissNotificationAsync(dlIdentifier).catch(() => {});

      await setSelectedModelId(id);
      await refreshAll();
      Alert.alert('Model ready', 'The AI model is now available offline. Open Chat to start.');
    } catch (error) {
      await Notifications.dismissNotificationAsync(dlIdentifier).catch(() => {});
      console.error('Model download failed:', error);
      Alert.alert('Download failed', 'Check your internet connection and try again.');
    } finally {
      setDownloads((prev) => ({ ...prev, [id]: { downloading: false, progress: 0 } }));
      refreshAll();
    }
  };

  const handleDelete = async (id: LlmModelId) => {
    const info = LLM_MODELS.find((m) => m.id === id);
    Alert.alert('Delete model?', `Remove ${info?.label} from this device?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteModel(id);
          refreshAll();
        },
      },
    ]);
  };

  const handleSelect = async (id: LlmModelId) => {
    await setSelectedModelId(id);
    setSelectedModel(id);
  };

  return (
    <ScrollView className="flex-1 bg-gray-50">
      {/* Personal info */}
      <View className="mx-3 mt-4 rounded-xl bg-white p-4 shadow-sm">
        <View className="mb-3 flex-row items-center">
          <Ionicons name="person-circle" size={28} color="#0d9488" />
          <Text className="ml-2 text-lg font-bold text-gray-800">Farmer Profile</Text>
        </View>

        <EditableRow
          label="Name"
          value={name}
          isEditing={isEditingName}
          onEdit={() => setIsEditingName(true)}
          onSave={() => handleSave('profile.name', name || 'Farmer', setIsEditingName)}
          onChangeText={setName}
          placeholder="Your name"
        />
        <EditableRow
          label="Location"
          value={location}
          isEditing={isEditingLocation}
          onEdit={() => setIsEditingLocation(true)}
          onSave={() => handleSave('profile.location', location, setIsEditingLocation)}
          onChangeText={setLocation}
          placeholder="Village / district"
        />
        <EditableRow
          label="Farm Size"
          value={farmSize}
          isEditing={isEditingFarmSize}
          onEdit={() => setIsEditingFarmSize(true)}
          onSave={() => handleSave('profile.farm_size', farmSize, setIsEditingFarmSize)}
          onChangeText={setFarmSize}
          placeholder="e.g. 2 acres"
        />
        <EditableRow
          label="Preferred Crops"
          value={preferredCrops}
          isEditing={isEditingCrops}
          onEdit={() => setIsEditingCrops(true)}
          onSave={() => handleSave('profile.preferred_crops', preferredCrops, setIsEditingCrops)}
          onChangeText={setPreferredCrops}
          placeholder="e.g. Rice, Tomato"
        />
      </View>

      {/* AI Models */}
      <View className="mx-3 mt-4 rounded-xl bg-white p-4 shadow-sm pb-6">
        <View className="mb-2 flex-row items-center">
          <Ionicons name="download" size={28} color="#0d9488" />
          <Text className="ml-2 text-lg font-bold text-gray-800">AI Models (offline)</Text>
        </View>
        <Text className="mb-4 text-sm text-gray-500">
          Download once over internet, then Chat runs 100% offline on this device.
        </Text>

        {LLM_MODELS.map((model) => {
          const info = getModelDownloadInfo(model.id);
          const dl = downloads[model.id];
          const isDownloading = dl?.downloading ?? false;
          const isSelected = selectedModel === model.id;

          return (
            <View
              key={model.id}
              className="mb-3 rounded-xl border border-gray-200 p-4"
              style={{ borderColor: isSelected ? '#0d9488' : '#e5e7eb', borderWidth: 1.5 }}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="text-base font-semibold text-gray-800">{model.label}</Text>
                  <Text className="text-xs text-gray-500">{model.description}</Text>
                </View>
                {isSelected && (
                  <View className="rounded-full bg-teal-100 px-2 py-0.5">
                    <Text className="text-xs font-semibold text-teal-700">Active</Text>
                  </View>
                )}
              </View>

              {isDownloading && (
                <View className="mt-2">
                  <View className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                    <View
                      className="h-1.5 rounded-full bg-teal-600"
                      style={{ width: `${Math.round((dl?.progress ?? 0) * 100)}%` }}
                    />
                  </View>
                  <View className="flex-row items-center mt-2">
                    <ActivityIndicator size="small" color="#0d9488" />
                    <Text className="text-xs text-gray-500 ml-2">
                      Downloading… {Math.round((dl?.progress ?? 0) * 100)}%
                    </Text>
                  </View>
                </View>
              )}

              {!isDownloading && info.downloaded && (
                <View className="mt-2 flex-row items-center">
                  <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                  <Text className="text-green-700 ml-1 text-sm">Downloaded</Text>
                </View>
              )}

              {!isDownloading && !info.downloaded && (
                <Text className="text-xs text-gray-400 mt-2">
                  Not downloaded · {model.approxSize}
                </Text>
              )}

              <View className="mt-3 flex-row gap-2">
                {!info.downloaded ? (
                  <TouchableOpacity
                    onPress={() => handleDownload(model.id)}
                    disabled={isDownloading}
                    className="flex-row items-center rounded-lg bg-teal-600 px-4 py-2"
                  >
                    <Ionicons name="download-outline" size={16} color="white" />
                    <Text className="ml-1 text-sm font-semibold text-white">
                      {isDownloading ? 'Downloading…' : 'Download'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity
                      onPress={() => handleSelect(model.id)}
                      className="flex-row items-center rounded-lg bg-teal-600 px-4 py-2"
                    >
                      <Ionicons name="checkmark" size={16} color="white" />
                      <Text className="ml-1 text-sm font-semibold text-white">
                        {isSelected ? 'Selected' : 'Use this'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(model.id)}
                      className="flex-row items-center rounded-lg border border-red-300 px-4 py-2"
                    >
                      <Ionicons name="trash-outline" size={16} color="#dc2626" />
                      <Text className="ml-1 text-sm font-semibold text-red-600">Delete</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          );
        })}
      </View>

      <View className="p-6 items-center">
        <Text className="text-gray-500 text-sm mb-1 text-center">
          Crop AI - Powered by AI for Farmers
        </Text>
        <Text className="text-gray-500 text-sm text-center">
          In collaboration with Government of Jharkhand
        </Text>
      </View>
    </ScrollView>
  );
}
