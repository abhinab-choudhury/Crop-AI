import { Stack } from 'expo-router';
import { DarkTheme, DefaultTheme, type Theme, ThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import React, { useRef, useState, useEffect } from 'react';
import { ActivityIndicator, Image, Platform, View } from 'react-native';
import logo from '@/assets/icon.png';

import '../global.css';
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_700Bold,
  useFonts,
} from '@expo-google-fonts/poppins';
import { NAV_THEME } from '@/lib/constants';
import { useColorScheme } from '@/lib/use-color-scheme';
import { setAndroidNavigationBar } from '@/lib/android-navigation-bar';
import { initDb, getSetting } from '@/lib/db';

const useIsomorphicLayoutEffect =
  Platform.OS === 'web' && typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

const LIGHT_THEME: Theme = {
  ...DefaultTheme,
  colors: NAV_THEME.light.colors,
};
const DARK_THEME: Theme = {
  ...DarkTheme,
  colors: NAV_THEME.dark.colors,
};

export const unstable_settings = {
  initialRouteName: '(drawer)',
};

export default function RootLayout() {
  const hasMounted = useRef(false);
  const { colorScheme, isDarkColorScheme } = useColorScheme();
  const [isColorSchemeLoaded, setIsColorSchemeLoaded] = React.useState(false);
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_700Bold,
  });
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (hasMounted.current) return;

    if (Platform.OS === 'web') {
      document.documentElement.classList.add('bg-background');
    }

    setAndroidNavigationBar(colorScheme);
    if (Platform.OS !== 'web') {
      initDb().catch((error) => console.error('Failed to init SQLite:', error));
    }
    setIsColorSchemeLoaded(true);
    hasMounted.current = true;
  }, []);

  useEffect(() => {
    getSetting('onboarding.completed').then((v) => {
      setOnboardingComplete(v === 'true');
    });
  }, []);

  if (!fontsLoaded || !isColorSchemeLoaded || onboardingComplete === null) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Image source={logo} className="w-24 h-24 rounded-full mb-6" />
        <ActivityIndicator size="large" color="#20C997" />
      </View>
    );
  }

  return (
    <ThemeProvider value={isDarkColorScheme ? DARK_THEME : LIGHT_THEME}>
      <StatusBar style={isDarkColorScheme ? 'light' : 'dark'} />
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(drawer)" />
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          </Stack>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
