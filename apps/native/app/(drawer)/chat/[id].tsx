import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import botIcon from '@/assets/bot.png';
import { AGRI_SYSTEM_PROMPT, getReadyModelId, streamChatMessage, type LlmModelId } from '@/lib/llm';
import { addMessage, getMessages, getThread, updateThreadTitle, type MessageRow } from '@/lib/db';
import { RenameThreadModal } from '@/components/rename-thread-modal';

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const flatListRef = useRef<FlatList>(null);
  const abortRef = useRef<AbortController | null>(null);
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation();

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [text, setText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [modelId, setModelId] = useState<LlmModelId | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('Chat');
  const [renameVisible, setRenameVisible] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <Text className="max-w-[220px] font-poppinsMedium text-xl text-gray-900" numberOfLines={1}>
          {title}
        </Text>
      ),
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setRenameVisible(true)}
          hitSlop={10}
          style={{ marginRight: 16 }}
        >
          <Ionicons name="pencil" size={18} color="#0f766e" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, title]);

  const saveTitle = async (next: string) => {
    if (!id) return;
    await updateThreadTitle(id, next);
    setTitle(next);
    setRenameVisible(false);
  };

  useEffect(() => {
    getReadyModelId().then(setModelId);
    if (id) {
      getMessages(id).then((rows) => {
        setMessages(rows);
        setLoaded(true);
      });
      getThread(id).then((thread) => {
        if (thread) setTitle(thread.title);
      });
    } else {
      setLoaded(true);
    }
    return () => abortRef.current?.abort();
  }, [id]);

  const scrollToEnd = () =>
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 60);

  const streamReply = useCallback(
    async (history: MessageRow[], query: string) => {
      let accumulated = '';
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await streamChatMessage({
          messages: [
            { role: 'system', content: AGRI_SYSTEM_PROMPT },
            ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content: query },
          ],
          modelId,
          signal: controller.signal,
          onToken: (_tok, acc) => {
            accumulated = acc;
            setStreaming(acc);
          },
        });
        if (id && accumulated.trim()) {
          await addMessage(id, 'assistant', accumulated);
          setMessages((prev) => [
            ...prev,
            {
              id: -2,
              thread_id: id,
              role: 'assistant',
              content: accumulated,
              created_at: Date.now(),
            },
          ]);
        }
        setStreaming('');
        setIsThinking(false);
      } catch (error) {
        const aborted =
          error instanceof Error && (error.message === 'aborted' || error.name === 'AbortError');
        if (!aborted) {
          console.error('Offline chat error:', error);
          setStreaming('');
          setIsThinking(false);
          if (id) {
            const errorMsg =
              '❌ The AI model is not available yet. Open Profile → AI Models and make sure a model is downloaded.';
            await addMessage(id, 'assistant', errorMsg);
            setMessages((prev) => [
              ...prev,
              {
                id: -3,
                thread_id: id,
                role: 'assistant',
                content: errorMsg,
                created_at: Date.now(),
              },
            ]);
          }
        }
      } finally {
        abortRef.current = null;
        setIsThinking(false);
      }
    },
    [id, modelId],
  );

  const sendMessage = async (raw: string) => {
    const query = raw.trim();
    if (!query || isThinking || streaming || !modelId || !id) return;

    setText('');
    setStreaming('');
    setIsThinking(true);
    scrollToEnd();

    const userMsg: MessageRow = {
      id: -1,
      thread_id: id,
      role: 'user',
      content: query,
      created_at: Date.now(),
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    await addMessage(id, 'user', query);

    await streamReply(nextHistory.slice(0, -1), query);
    scrollToEnd();
  };

  const displayMessages = streaming
    ? [
        ...messages,
        {
          id: -2,
          thread_id: id ?? '',
          role: 'assistant' as const,
          content: streaming,
          created_at: Date.now(),
        },
      ]
    : messages;
  const generatingId = displayMessages.length
    ? displayMessages[displayMessages.length - 1].id
    : null;

  const renderItem = ({ item }: { item: MessageRow }) => {
    const isUser = item.role === 'user';
    const isGenerating = isThinking && !isUser && item.id === generatingId;
    return (
      <View
        style={{
          flexDirection: 'row',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
          marginVertical: 6,
        }}
      >
        {!isUser && (
          <Image
            source={botIcon}
            style={{ width: 32, height: 32, borderRadius: 16, marginRight: 8 }}
          />
        )}
        <View
          style={{
            backgroundColor: isUser ? '#20C997' : '#E6F7F5',
            padding: 12,
            borderRadius: 16,
            maxWidth: '78%',
          }}
        >
          <Text style={{ color: isUser ? '#fff' : '#004D40', fontSize: 16 }}>{item.content}</Text>
        </View>
        {isGenerating && (
          <ActivityIndicator
            size="small"
            color="#20C997"
            style={{ marginLeft: 8, marginTop: 14 }}
          />
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight + (!modelId && !isThinking ? 40 : 0)}
    >
      {!modelId && !isThinking && (
        <TouchableOpacity
          onPress={() => router.push('/(drawer)/profile')}
          className="mx-3 mt-2 flex-row items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2"
        >
          <Ionicons name="warning" size={18} color="#b45309" />
          <Text className="flex-1 text-amber-800 text-sm">
            No AI model on device. Download Qwen from Profile → AI Models.
          </Text>
        </TouchableOpacity>
      )}

      {!loaded ? (
        <View style={{ alignItems: 'center', padding: 40 }}>
          <ActivityIndicator size="large" color="#20C997" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={displayMessages}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 15 }}
          style={{ flex: 1 }}
          onContentSizeChange={scrollToEnd}
          onLayout={scrollToEnd}
          ListEmptyComponent={
            !isThinking && loaded ? (
              <Text style={{ textAlign: 'center', color: '#666', marginTop: 40 }}>
                No messages yet. Ask a question below.
              </Text>
            ) : null
          }
        />
      )}

      {isThinking && streaming.length > 0 && (
        <View style={{ flexDirection: 'row', paddingLeft: 15, paddingBottom: 4 }}>
          <Text style={{ color: '#20C997', fontSize: 13 }}>Streaming…</Text>
        </View>
      )}

      <View
        style={{
          padding: 12,
          backgroundColor: '#ffffff',
          paddingBottom: Math.max(insets.bottom, 12),
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#f1f3f5',
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 30,
          }}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message Crop AI…"
            placeholderTextColor="#9ca3af"
            editable={!isThinking}
            style={{
              flex: 1,
              fontSize: 16,
              paddingVertical: 6,
              paddingHorizontal: 4,
              color: '#333',
            }}
          />
          <TouchableOpacity
            onPress={() => sendMessage(text)}
            disabled={!text.trim() || isThinking || !modelId}
            style={{
              padding: 10,
              borderRadius: 50,
              backgroundColor: text.trim() && !isThinking && modelId ? '#16a34a' : '#d1d5db',
            }}
          >
            <Ionicons
              name="send"
              size={18}
              color={text.trim() && !isThinking && modelId ? '#fff' : '#6b7280'}
            />
          </TouchableOpacity>
        </View>
      </View>

      <RenameThreadModal
        visible={renameVisible}
        initialTitle={title}
        onCancel={() => setRenameVisible(false)}
        onSave={saveTitle}
      />
    </KeyboardAvoidingView>
  );
}
