import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDownloadedModelIds, getModelInfo, type LlmModelId } from '@/lib/llm';

export interface ModelSelectorProps {
  value: LlmModelId | null;
  onChange: (id: LlmModelId) => void;
  /** Disables the controls while a reply is streaming. */
  disabled?: boolean;
}

/** Compact chip row showing which model is active and letting the user switch
 *  between the models already downloaded on the device. Choosing a model also
 *  persists the selection via the parent (setSelectedModelId). */
export function ModelSelector({ value, onChange, disabled = false }: ModelSelectorProps) {
  const models = getDownloadedModelIds();
  if (models.length === 0) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        rowGap: 6,
        paddingHorizontal: 15,
        paddingBottom: 6,
        gap: 6,
      }}
    >
      <Ionicons name="hardware-chip-outline" size={14} color="#6b7280" />
      {models.map((id) => {
        const label = getModelInfo(id).label;
        const selected = value === id;
        return (
          <TouchableOpacity
            key={id}
            onPress={() => onChange(id)}
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
              numberOfLines={1}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
