import React, { useRef } from 'react';
import {
  Alert,
  Image,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface ChatInputProps {
  value: string;
  onChangeText: (text: string) => void;
  /** Currently attached image URI (or null). Lifted to the screen so the user
   *  message bubble can render the same image. */
  imageUri: string | null;
  onChangeImage: (uri: string | null) => void;
  /** Triggered when the user taps send. The screen owns the logic and clears
   *  value/imageUri. */
  onSend: () => void;
  /** False while no model is ready on device. */
  canSend: boolean;
  /** True while an assistant reply is streaming; disables input + send. */
  busy: boolean;
  /** Whether the active model supports images. If not, tapping the image icon
   *  invokes onDisabledImagePress instead of the picker. */
  canUseImages: boolean;
  onDisabledImagePress?: () => void;
  placeholder?: string;
}

const MAX_INPUT_HEIGHT = 128;

export function ChatInput({
  value,
  onChangeText,
  imageUri,
  onChangeImage,
  onSend,
  canSend,
  busy,
  canUseImages,
  onDisabledImagePress,
  placeholder = 'Message Crop AI…',
}: ChatInputProps) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const hasText = value.trim().length > 0;
  const readyToSend = !busy && canSend && (hasText || !!imageUri);

  const handleSend = () => {
    if (!readyToSend) return;
    onSend();
  };

  const requestLibraryPermission = async (): Promise<boolean> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to attach images.');
      return false;
    }
    return true;
  };

  const requestCameraPermission = async (): Promise<boolean> => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera access to take a photo.');
      return false;
    }
    return true;
  };

  const pickFromLibrary = async () => {
    if (!(await requestLibraryPermission())) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!res.canceled && res.assets?.[0]) {
      onChangeImage(res.assets[0].uri);
      inputRef.current?.focus();
    }
  };

  const takePhoto = async () => {
    if (!(await requestCameraPermission())) return;
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!res.canceled && res.assets?.[0]) {
      onChangeImage(res.assets[0].uri);
      inputRef.current?.focus();
    }
  };

  const handleImagePress = () => {
    if (!canUseImages) {
      onDisabledImagePress?.();
      return;
    }
    Alert.alert('Add a photo', 'Attach a picture of a plant, leaf or crop for the AI to see.', [
      { text: 'Take photo', onPress: takePhoto },
      { text: 'Choose from gallery', onPress: pickFromLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View
      style={{
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 10),
        backgroundColor: '#ffffff',
      }}
    >
      {imageUri && (
        <View style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ position: 'relative' }}>
            <Image
              source={{ uri: imageUri }}
              style={{ width: 58, height: 58, borderRadius: 12, backgroundColor: '#f1f3f5' }}
            />
            <TouchableOpacity
              onPress={() => onChangeImage(null)}
              hitSlop={8}
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: '#111827',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="close" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
          <Text
            style={{ marginLeft: 10, color: '#9ca3af', fontSize: 12, flex: 1 }}
            numberOfLines={1}
          >
            Image attached — the vision model will see this photo.
          </Text>
        </View>
      )}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          backgroundColor: '#f1f3f5',
          borderRadius: 24,
          paddingHorizontal: 6,
          paddingVertical: 6,
          borderWidth: 1,
          borderColor: busy ? '#e5e7eb' : '#e0e7e6',
        }}
      >
        <TouchableOpacity
          onPress={handleImagePress}
          disabled={busy}
          hitSlop={6}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: canUseImages ? '#e6f7f5' : '#f3f4f6',
          }}
        >
          <Ionicons name="image-outline" size={22} color={canUseImages ? '#0f766e' : '#9ca3af'} />
        </TouchableOpacity>

        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9ca3af"
          editable={!busy}
          multiline
          blurOnSubmit={false}
          submitBehavior="newline"
          textAlignVertical="top"
          style={{
            flex: 1,
            minHeight: 40,
            maxHeight: Platform.OS === 'ios' ? MAX_INPUT_HEIGHT : 100,
            fontSize: 16,
            lineHeight: 21,
            paddingHorizontal: 8,
            paddingVertical: 10,
            color: '#333',
          }}
        />

        <TouchableOpacity
          onPress={handleSend}
          disabled={!readyToSend}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: readyToSend ? '#16a34a' : '#d1d5db',
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#6b7280" />
          ) : (
            <Ionicons name="arrow-up" size={20} color={readyToSend ? '#fff' : '#6b7280'} />
          )}
        </TouchableOpacity>
      </View>

      <Text
        style={{
          marginTop: 5,
          textAlign: 'center',
          color: '#9ca3af',
          fontSize: 11,
        }}
      >
        Enter ↳ adds a new line · send with the ↑ button
      </Text>
    </View>
  );
}
