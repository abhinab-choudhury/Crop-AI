import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CHAT_LANGUAGES, type ChatLanguage } from '@/lib/llm';

export interface LanguageSelectorProps {
  value: ChatLanguage;
  onChange: (language: ChatLanguage) => void;
  /** Disables the controls while a reply is streaming. */
  disabled?: boolean;
}

/** Compact chip row for picking the assistant's reply language. The chosen
 *  language is persisted by the parent via setChatLanguage(). */
export function LanguageSelector({ value, onChange, disabled = false }: LanguageSelectorProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        paddingHorizontal: 15,
        paddingBottom: 6,
      }}
    >
      <Ionicons name="language-outline" size={14} color="#6b7280" style={{ marginRight: 6 }} />
      {CHAT_LANGUAGES.map((lang) => {
        const selected = lang.id === value;
        return (
          <TouchableOpacity
            key={lang.id}
            onPress={() => onChange(lang.id)}
            disabled={disabled}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: 999,
              marginRight: 6,
              marginBottom: 4,
              borderWidth: 1,
              borderColor: selected ? '#0f766e' : '#e5e7eb',
              backgroundColor: selected ? '#e6f7f5' : '#f8fafc',
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: selected ? '600' : '400',
                color: selected ? '#0f766e' : '#374151',
              }}
            >
              {lang.native}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
