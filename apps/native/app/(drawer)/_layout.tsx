import React, { ComponentProps, useEffect } from 'react';
import { Drawer } from 'expo-router/drawer';
import { Ionicons } from '@expo/vector-icons';
import { DefaultTheme, Theme } from '@react-navigation/native';
import { NAV_THEME, THEME } from '@/lib/constants';
import { DrawerContentScrollView, DrawerItem, DrawerItemList } from '@react-navigation/drawer';
import { Image, Text, View } from 'react-native';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useRouter } from 'expo-router';
import { getSetting } from '@/lib/db';
import { requestNewChat } from '@/lib/chat-session';
import logo from '@/assets/icon.png';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export default function DrawerLayout() {
  const router = useRouter();

  useEffect(() => {
    getSetting('onboarding.completed').then((v) => {
      if (v !== 'true') {
        router.replace('/onboarding' as any);
      }
    });
  }, [router]);

  const LIGHT_THEME: Theme = {
    ...DefaultTheme,
    colors: NAV_THEME.light.colors,
  };
  const tabIcon = (
    focused: boolean,
    active: IoniconName,
    inactive: IoniconName,
    size: number,
    color: string,
  ) => (
    <Ionicons name={focused ? active : inactive} size={focused ? size + 2 : size} color={color} />
  );

  return (
    <Drawer
      screenOptions={{
        headerShown: true,
        drawerActiveTintColor: LIGHT_THEME.colors.primary,
        drawerInactiveTintColor: THEME.light.mutedForeground,
        drawerActiveBackgroundColor: THEME.light.muted,
        drawerLabelStyle: {
          fontSize: 15,
          fontWeight: '500',
        },
        drawerType: 'slide',
        swipeEdgeWidth: 80,
      }}
      drawerContent={(props) => (
        <DrawerContentScrollView {...props} contentContainerStyle={{ flex: 1 }}>
          <View className="font-poppinsBold items-center border-b border-gray-200 py-6">
            <Image source={logo} className="w-16 h-16 rounded-full mb-2" />
            <Text className="text-lg font-poppinsBold">Crop AI</Text>
          </View>

          <View className="mt-4 flex-1 px-2">
            <DrawerItem
              label={({ color }) => (
                <Text className="font-poppinsMedium text-xl" style={{ color }}>
                  New Chat
                </Text>
              )}
              icon={({ focused, color, size }) =>
                tabIcon(focused, 'chatbubble', 'chatbubble-outline', size, color)
              }
              focused={props.state.routes[props.state.index]?.name === 'index'}
              activeTintColor={LIGHT_THEME.colors.primary}
              inactiveTintColor={THEME.light.mutedForeground}
              activeBackgroundColor={THEME.light.muted}
              labelStyle={{ fontSize: 15, fontWeight: '500' }}
              onPress={() => {
                props.navigation.navigate('index');
                requestNewChat();
              }}
            />
            <DrawerItemList {...props} />
          </View>

          <View className="flex flex-row items-center gap-4 p-2 bg-gray-50 rounded-xl shadow-sm">
            <Avatar className="w-16 h-16 rounded-full border-2 border-teal-900" alt="offline-app">
              <AvatarFallback className="bg-teal-600">
                <Text className="text-white font-bold">AI</Text>
              </AvatarFallback>
            </Avatar>
            <View className="flex flex-col">
              <Text className="text-gray-900 font-semibold text-lg">Offline Mode</Text>
              <Text className="text-gray-500 text-sm">No account or internet needed</Text>
            </View>
          </View>
        </DrawerContentScrollView>
      )}
    >
      <Drawer.Screen
        name="index"
        options={{
          title: 'New Chat',
          drawerItemStyle: { display: 'none' },
          headerTitle: () => <Text className="font-poppinsMedium text-xl">New Chat</Text>,
          drawerLabel: ({ focused, color }) => (
            <Text
              className="font-poppinsMedium text-xl"
              style={{
                color: color,
              }}
            >
              New Chat
            </Text>
          ),
          drawerIcon: ({ focused, color, size }) =>
            tabIcon(focused, 'chatbubble', 'chatbubble-outline', size, color),
        }}
      />
      <Drawer.Screen
        name="history"
        options={{
          title: 'History',
          headerTitle: () => <Text className="font-poppinsMedium text-xl">History</Text>,
          drawerLabel: ({ focused, color }) => (
            <Text
              className="font-poppinsMedium text-xl"
              style={{
                color: color,
              }}
            >
              History
            </Text>
          ),
          drawerIcon: ({ focused, color, size }) =>
            tabIcon(focused, 'time', 'time-outline', size, color),
        }}
      />
      <Drawer.Screen
        name="diagnosis"
        options={{
          title: 'Plant Diagnosis',
          headerTitle: () => <Text className="font-poppinsMedium text-xl">Plant Diagnosis</Text>,
          drawerLabel: ({ color }) => (
            <Text
              className="font-poppinsMedium text-xl"
              style={{
                color: color,
              }}
            >
              Plant Diagnosis
            </Text>
          ),
          drawerIcon: ({ focused, color, size }) =>
            tabIcon(focused, 'paper-plane', 'paper-plane-outline', size, color),
        }}
      />
      <Drawer.Screen
        name="recommendation"
        options={{
          title: 'Crop Recommendation',
          headerTitle: () => (
            <Text className="font-poppinsMedium text-xl">Crop Recommendation</Text>
          ),
          drawerLabel: ({ color }) => (
            <Text
              className="font-poppinsMedium text-xl"
              style={{
                color: color,
              }}
            >
              Crop Recommendation
            </Text>
          ),
          drawerIcon: ({ focused, color, size }) =>
            tabIcon(focused, 'leaf', 'leaf-outline', size, color),
        }}
      />
      <Drawer.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerTitle: () => <Text className="font-poppinsMedium text-xl">Profile</Text>,
          drawerLabel: ({ focused, color }) => (
            <Text
              className="font-poppinsMedium text-xl"
              style={{
                color: color,
              }}
            >
              Profile
            </Text>
          ),
          drawerIcon: ({ focused, color, size }) =>
            tabIcon(focused, 'person', 'person-outline', size, color),
        }}
      />
      <Drawer.Screen
        name="about"
        options={{
          title: 'About',
          headerTitle: () => <Text className="font-poppinsMedium text-xl">About</Text>,
          drawerLabel: ({ focused, color }) => (
            <Text
              className="font-poppinsMedium text-xl"
              style={{
                color: color,
              }}
            >
              About
            </Text>
          ),
          drawerIcon: ({ focused, color, size }) =>
            tabIcon(focused, 'information-circle', 'information-circle-outline', size, color),
        }}
      />
      <Drawer.Screen
        name="chat/[id]"
        options={{
          title: 'Chat',
          headerTitle: () => <Text className="font-poppinsMedium text-xl">Chat</Text>,
          drawerItemStyle: { display: 'none' },
          drawerIcon: ({ focused, color, size }) =>
            tabIcon(focused, 'time', 'time-outline', size, color),
        }}
      />
    </Drawer>
  );
}
