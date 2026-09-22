import React, { useCallback, useState } from 'react';
import { Text, TouchableOpacity, View, FlatList, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { listThreads, deleteThread, type ThreadRow } from '@/lib/db';

export default function HistoryScreen() {
  const router = useRouter();
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    listThreads()
      .then(setThreads)
      .catch((error) => console.error('Failed to load history:', error))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      refresh();
    }, [refresh]),
  );

  const confirmDelete = (thread: ThreadRow) => {
    Alert.alert('Delete chat?', thread.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteThread(thread.id);
          refresh();
        },
      },
    ]);
  };

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const renderItem = ({ item }: { item: ThreadRow }) => (
    <TouchableOpacity
      onPress={() => router.push(`/(drawer)/chat/${item.id}`)}
      className="mb-3 rounded-xl border border-gray-200 bg-white p-4 active:bg-gray-50"
    >
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 pr-2 text-base font-poppinsMedium text-gray-900" numberOfLines={1}>
          {item.title}
        </Text>
        <Text className="text-xs text-gray-400">{formatDate(item.updated_at)}</Text>
      </View>
      {item.preview ? (
        <Text className="mt-1 text-sm text-gray-500" numberOfLines={2}>
          {item.preview}
        </Text>
      ) : null}
      <View className="mt-2 flex-row items-center justify-between">
        <Text className="text-xs text-teal-700">Open chat</Text>
        <TouchableOpacity onPress={() => confirmDelete(item)} hitSlop={8}>
          <Ionicons name="trash-outline" size={16} color="#dc2626" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-gray-50 p-4">
      {loading ? (
        <View style={{ alignItems: 'center', paddingTop: 60 }}>
          <ActivityIndicator size="large" color="#20C997" />
        </View>
      ) : threads.length === 0 ? (
        <View style={{ alignItems: 'center', paddingTop: 60 }}>
          <Ionicons name="chatbubbles-outline" size={44} color="#cbd5e1" />
          <Text className="mt-3 text-gray-500">No conversations yet.</Text>
          <TouchableOpacity
            onPress={() => router.push('/(drawer)')}
            className="mt-3 rounded-xl bg-teal-600 px-5 py-2"
          >
            <Text className="text-white">Start chatting</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  );
}
