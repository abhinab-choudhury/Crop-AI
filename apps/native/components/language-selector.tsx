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
        rowGap: 6,
        paddingHorizontal: 15,
        paddingTop: 6,
        paddingBottom: 8,
        gap: 6,
      }}
    >
      <Ionicons name="language-outline" size={14} color="#6b7280" />
      {CHAT_LANGUAGES.map((lang) => {
        const selected = lang.id === value;
        return (
          <TouchableOpacity
            key={lang.id}
            onPress={() => onChange(lang.id)}
            disabled={disabled}
            activeOpacity={0.7}
            style={{
              justifyContent: 'center',
              paddingHorizontal: 13,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: selected ? '#0f766e' : '#e5e7eb',
              backgroundColor: selected ? '#e6f7f5' : '#f8fafc',
            }}
          >
            <Text
              style={{
                fontSize: 13,
                lineHeight: 18,
                includeFontPadding: false,
                textAlign: 'center',
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
