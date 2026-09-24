import * as React from 'react';
import {
  View,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { Input } from '@/components/ui/input';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AGRI_SYSTEM_PROMPT, getChatLanguage, getReadyModelId, streamChatMessage } from '@/lib/llm';
import Markdown from 'react-native-markdown-display';

const markdownStyles = {
  body: { color: '#166534', fontSize: 16, lineHeight: 23 },
  heading1: {
    color: '#166534',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 4,
  },
  heading2: {
    color: '#166534',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 'bold',
    marginTop: 6,
    marginBottom: 3,
  },
  heading3: {
    color: '#166534',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 'bold',
    marginTop: 4,
    marginBottom: 2,
  },
  paragraph: { marginTop: 0, marginBottom: 6 },
  strong: { color: '#14532d', fontWeight: 'bold' },
  bullet_list: { marginTop: 2, marginBottom: 4 },
  bullet_list_item: { marginBottom: 4 },
  ordered_list: { marginTop: 2, marginBottom: 4 },
  ordered_list_item: { marginBottom: 4 },
};

export default function CropRecommendationForm() {
  const [form, setForm] = React.useState({
    nitrogen: '',
    phosphorus: '',
    potassium: '',
    ph: '',
    rainfall: '',
    latitude: '',
    longitude: '',
  });
  const [result, setResult] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [modelReady, setModelReady] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let mounted = true;
    getReadyModelId().then((id) => {
      if (mounted) setModelReady(!!id);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleChange = (key: string, value: string) => {
    setForm({ ...form, [key]: value });
  };

  const buildPrompt = () => {
    const { nitrogen, phosphorus, potassium, ph, rainfall, latitude, longitude } = form;
    return [
      'I am a farmer. Based on the following soil and location parameters, recommend the best crop(s) to plant and explain why.',
      `- Soil nitrogen (N): ${nitrogen} ppm`,
      `- Soil phosphorus (P): ${phosphorus} ppm`,
      `- Soil potassium (K): ${potassium} ppm`,
      `- Soil pH: ${ph}`,
      `- Annual rainfall: ${rainfall} mm`,
      `- Location latitude: ${latitude}`,
      `- Location longitude: ${longitude}`,
      '',
      'Suggest 1 to 3 suitable crops with a short, practical reason for each, and note any fertilizer or watering tip. Keep the answer concise and easy to read.',
    ].join('\n');
  };

  const handleSubmit = async () => {
    const values = Object.values(form);
    if (!values.every((v) => v.trim().length > 0)) {
      Alert.alert('Incomplete input', 'Please fill in every field to get a recommendation.');
      return;
    }
    if (values.some((v) => Number.isNaN(Number(v)))) {
      Alert.alert('Invalid input', 'All values must be numbers.');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const modelId = await getReadyModelId();
      if (!modelId) {
        throw new Error('No AI model downloaded');
      }
      const language = await getChatLanguage();
      const answer = await streamChatMessage({
        messages: [
          { role: 'system', content: AGRI_SYSTEM_PROMPT },
          { role: 'user', content: buildPrompt() },
        ],
        modelId,
        language,
      });
      setResult(answer.trim() || 'No recommendation available right now.');
    } catch (error) {
      console.error('Crop recommendation error:', error);
      Alert.alert(
        'Recommendation failed',
        'The on-device AI model is not available. Open Profile → AI Models and make sure a model is downloaded.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Profile', onPress: () => router.push('/(drawer)/profile') },
        ],
      );
    } finally {
      setLoading(false);
    }
  };

  const inputFields = [
    { key: 'nitrogen', label: 'Nitrogen (N)', icon: 'leaf' },
    { key: 'phosphorus', label: 'Phosphorus (P)', icon: 'water' },
    { key: 'potassium', label: 'Potassium (K)', icon: 'flask' },
    { key: 'ph', label: 'pH Level', icon: 'beaker' },
    { key: 'rainfall', label: 'Rainfall (mm)', icon: 'rainy' },
    { key: 'latitude', label: 'Latitude', icon: 'compass' },
    { key: 'longitude', label: 'Longitude', icon: 'navigate' },
  ];

  return (
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={90} style={{ flex: 1 }}>
      <ScrollView
        contentContainerClassName="flex-grow justify-center items-center p-5"
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <View className="mb-8 items-center">
          <Text className="text-center text-teal-600 text-base max-w-xs">
            Enter your soil and location parameters to get the best crop suggestions.
          </Text>
        </View>

        {/* Input Card */}
        <View className="bg-gray-50 rounded-3xl p-6 w-full shadow-sm border border-gray-100">
          {inputFields.map((field) => (
            <View key={field.key} className="flex-row items-center mb-5 border-gray-200">
              <Ionicons
                name={field.icon as any}
                size={22}
                color="#0f766e"
                style={{ marginRight: 12 }}
              />
              <View className="flex-1">
                <Text className="text-teal-700 font-poppinsMedium mb-1">{field.label}</Text>
                <Input
                  value={form[field.key as keyof typeof form]}
                  onChangeText={(value) => handleChange(field.key, value)}
                  keyboardType="numeric"
                  placeholder={`Enter ${field.label}`}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
            </View>
          ))}
        </View>

        {modelReady === false && (
          <View className="mt-4 w-full flex-row items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
            <Ionicons name="warning" size={18} color="#b45309" />
            <Text className="flex-1 text-amber-800 text-sm">
              No AI model on device. Download one from Profile → AI Models for real recommendations.
            </Text>
          </View>
        )}

        {result && (
          <View className="w-full mt-6 bg-green-50 rounded-2xl p-6 shadow-lg border border-green-100">
            <Markdown style={markdownStyles as StyleSheet.NamedStyles<any>}>{result}</Markdown>
          </View>
        )}

        {/* Submit Button */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={loading}
          className="mt-8 bg-teal-600 rounded-2xl py-4 w-full items-center shadow-md active:scale-95"
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-poppinsSemiBold text-lg">Get Recommendation</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
