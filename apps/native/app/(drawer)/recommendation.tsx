import * as React from 'react';
import {
  View,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { Input } from '@/components/ui/input';
import { Ionicons } from '@expo/vector-icons';

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

  // if (!user?.primaryEmailAddress?.emailAddress) {
  //   router.replace('/(drawer)/login');
  // }

  const handleChange = (key: string, value: string) => {
    setForm({ ...form, [key]: value });
  };

  const handleSubmit = async () => {
    setLoading(true);
    setResult(null);

    try {
      await new Promise((r) => setTimeout(r, 1500)); // fake delay
      setResult('🍎 Apple');
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
      <ScrollView contentContainerClassName="flex-grow justify-center items-center p-5">
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
        {result && (
          <View className="w-full m-6 bg-green-50 rounded-2xl p-6 shadow-lg items-center">
            <Text className="font-poppinsSemiBold text-2xl text-green-800">{result}</Text>
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
