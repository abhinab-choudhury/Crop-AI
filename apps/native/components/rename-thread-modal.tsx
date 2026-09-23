import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  visible: boolean;
  initialTitle?: string;
  onCancel: () => void;
  onSave: (title: string) => void;
  /** Returns an AI-generated title (async). Omit/undefined to hide the button. */
  onSuggest?: () => Promise<string>;
  /** Disable the suggest button while a reply is streaming. */
  canSuggest?: boolean;
};

export function RenameThreadModal({
  visible,
  initialTitle = '',
  onCancel,
  onSave,
  onSuggest,
  canSuggest = true,
}: Props) {
  const [value, setValue] = useState(initialTitle);
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    if (visible) {
      setValue(initialTitle);
      setSuggesting(false);
    }
  }, [visible, initialTitle]);

  const trimmed = value.trim();
  const canSave = trimmed.length > 0;
  const showSuggest = !!onSuggest;

  const handleSuggest = async () => {
    if (!onSuggest || suggesting) return;
    try {
      setSuggesting(true);
      const suggestion = await onSuggest();
      if (suggestion.trim()) {
        setValue(suggestion.trim());
      }
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
            className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          />

          {showSuggest && (
            <TouchableOpacity
              onPress={handleSuggest}
              disabled={suggesting || !canSuggest}
              className={`mb-3 flex-row items-center justify-center rounded-xl border px-4 py-2.5 ${
                canSuggest && !suggesting
                  ? 'border-teal-200 bg-teal-50'
                  : 'border-gray-200 bg-gray-50'
              }`}
            >
              {suggesting ? (
                <ActivityIndicator size="small" color="#0f766e" />
              ) : (
                <Ionicons name="sparkles-outline" size={16} color="#0f766e" />
              )}
              <Text
                className={`ml-2 text-sm font-semibold ${
                  canSuggest && !suggesting ? 'text-teal-700' : 'text-gray-400'
                }`}
              >
                {suggesting ? 'Thinking…' : '✨ Suggest with on-device AI'}
              </Text>
            </TouchableOpacity>
          )}

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
