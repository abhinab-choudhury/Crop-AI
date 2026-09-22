import React from 'react';
import { View, Text, ScrollView } from 'react-native';

export default function Profile() {
  return (
    <ScrollView className="flex-1">
      <View className="p-6">
        {/* Header Card */}
        <View className="rounded-2xl mb-6">
          <Text className="text-base text-gray-600 leading-6 text-start font-poppinsRegular">
            Crop AI is a revolutionary, AI-powered platform designed to empower farmers with a
            science-based approach to agriculture. Developed in collaboration with the Government of
            Jharkhand's Department of Higher and Technical Education, our mission is to make expert
            farming advice accessible, personalized, and impactful.
          </Text>
        </View>

        {/* Mission Section */}
        <View className="mb-6">
          <Text className="text-xl font-poppinsBold text-[#34495e] mb-2">Our Mission</Text>
          <Text className="text-base text-gray-600 leading-6 font-poppinsRegular">
            Farmers often face challenges in accessing timely and accurate agricultural support due
            to language barriers and limited resources. Our mission is to bridge this gap by
            providing an intelligent decision support system that helps farmers increase income, use
            resources more efficiently, and adopt sustainable farming practices.
          </Text>
        </View>

        {/* Features Section */}
        <View className="mb-6">
          <Text className="text-xl font-poppinsBold text-[#34495e] mb-4">Key Features</Text>

          {/* Feature Cards */}
          <View className="rounded-xl p-2 mb-3">
            <Text className="text-base text-gray-700 font-poppinsBold mb-1">AI-Powered Chat</Text>
            <Text className="text-base text-gray-600 font-poppinsRegular">
              Ask questions in your local language and get instant, actionable advice on any farming
              challenge, from pest control to nutrient management.
            </Text>
          </View>

          <View className="rounded-xl p-2 mb-3">
            <Text className="text-base text-gray-700 font-poppinsBold mb-1">
              Intelligent Recommendations
            </Text>
            <Text className="text-base text-gray-600 font-poppinsRegular">
              The app suggests the most appropriate crops for your specific conditions, with
              forecasts for yield, profit, and sustainability.
            </Text>
          </View>

          <View className="rounded-xl p-2">
            <Text className="text-base text-gray-700 font-poppinsBold mb-1">
              Personalized Profile
            </Text>
            <Text className="text-base text-gray-600 font-poppinsRegular">
              Your profile stores all your farm’s data, past recommendations, and chat history for a
              truly personalized experience.
            </Text>
          </View>
        </View>

        <View className="p-6 items-center">
          <Text className="text-black text-sm mb-1 text-center">
            Crop AI - Powered by AI for Farmers
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
