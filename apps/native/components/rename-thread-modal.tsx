import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  visible: boolean;
  initialTitle?: string;
  onCancel: () => void;
  onSave: (title: string) => void;
};

export function RenameThreadModal({ visible, initialTitle = '', onCancel, onSave }: Props) {
  const [value, setValue] = useState(initialTitle);

  useEffect(() => {
    if (visible) setValue(initialTitle);
  }, [visible, initialTitle]);

  const trimmed = value.trim();
  const canSave = trimmed.length > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View className="w-full rounded-2xl bg-white p-6 shadow-xl">
          <View className="mb-4 flex-row items-center gap-2">
            <Ionicons name="create-outline" size={22} color="#0f766e" />
            <Text className="text-lg font-poppinsBold text-gray-900">Rename chat</Text>
          </View>
          <TextInput
            value={value}
            onChangeText={setValue}
            autoFocus
            maxLength={40}
            placeholder="Enter a title…"
            placeholderTextColor="#9ca3af"
            onSubmitEditing={() => canSave && onSave(trimmed)}
            className="mb-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          />
          <View className="flex-row justify-end gap-3">
            <TouchableOpacity onPress={onCancel} className="rounded-xl px-4 py-2">
              <Text className="font-medium text-gray-500">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => canSave && onSave(trimmed)}
              disabled={!canSave}
              className={`rounded-xl px-5 py-2 ${canSave ? 'bg-teal-600' : 'bg-gray-200'}`}
            >
              <Text className={`font-semibold ${canSave ? 'text-white' : 'text-gray-400'}`}>
                Save
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
