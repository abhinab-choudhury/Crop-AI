import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import botIcon from '@/assets/bot.png';
import {
  AGRI_SYSTEM_PROMPT,
  getReadyModelId,
  modelSupportsVision,
  streamChatMessage,
  suggestChatTitle,
  type LlmModelId,
  type ChatRole,
} from '@/lib/llm';
import { addMessage, getMessages, getThread, updateThreadTitle, type MessageRow } from '@/lib/db';
import { RenameThreadModal } from '@/components/rename-thread-modal';
import { ChatInput } from '@/components/chat-input';
import { MessageBubble } from '@/components/message-bubble';

// Transient id for the in-flight reply bubble so it never collides with
// persisted message ids (which are positive, or optimistic -1/-2).
const STREAMING_PLACEHOLDER_ID = -999;

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const flatListRef = useRef<FlatList>(null);
  const abortRef = useRef<AbortController | null>(null);
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation();

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [text, setText] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [modelId, setModelId] = useState<LlmModelId | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('Chat');
  const [renameVisible, setRenameVisible] = useState(false);

  const canUseImages = modelId ? modelSupportsVision(modelId) : false;

  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <TouchableOpacity
          onPress={() => setRenameVisible(true)}
          activeOpacity={0.7}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            maxWidth: 240,
            borderWidth: 1,
            borderColor: '#ccfbf1',
            backgroundColor: '#f0fdfa',
            borderRadius: 999,
            paddingVertical: 5,
            paddingLeft: 14,
            paddingRight: 10,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              lineHeight: 22,
              fontWeight: '600',
              color: '#111827',
              flexShrink: 1,
              marginRight: 8,
            }}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Ionicons name="create-outline" size={16} color="#0f766e" />
        </TouchableOpacity>
      ),
      headerRight: undefined,
    });
  }, [navigation, title]);

  const saveTitle = async (next: string) => {
    if (!id) return;
    await updateThreadTitle(id, next);
    setTitle(next);
    setRenameVisible(false);
  };

  const suggestCurrentTitle = useCallback(async (): Promise<string> => {
    if (!modelId || isThinking) return '';
    return suggestChatTitle(messages, modelId);
  }, [modelId, isThinking, messages]);

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
    async (history: MessageRow[], query: string, attachedImage: string | null) => {
      let accumulated = '';
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await streamChatMessage({
          messages: [
            { role: 'system', content: AGRI_SYSTEM_PROMPT },
            ...history.slice(-10).map((m) => ({
              role: m.role as ChatRole,
              content: m.content,
              imageUri: m.role === 'user' ? (m.imageUri ?? null) : null,
            })),
            { role: 'user', content: query, imageUri: attachedImage },
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
              imageUri: null,
              created_at: Date.now(),
            },
          ]);

          // Untitled threads get a short, precise on-device AI name once the
          // first reply lands.
          if (title === 'New chat' && !attachedImage) {
            suggestChatTitle(
              [
                { role: 'system', content: AGRI_SYSTEM_PROMPT },
                ...history.slice(-6).map((m) => ({
                  role: m.role as ChatRole,
                  content: m.content,
                  imageUri: m.imageUri ?? null,
                })),
                { role: 'user', content: query, imageUri: attachedImage },
              ],
              modelId,
            ).then((suggested) => {
              if (!suggested.trim() || !id) return;
              setTitle(suggested);
              updateThreadTitle(id, suggested);
            });
          }
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
            const errorMsg = (
              error instanceof Error && error.message.includes('vision')
                ? '❌ To send photos, download the Qwen 2.5-VL 3B vision model from Profile → AI Models.'
                : '❌ The AI model is not available yet. Open Profile → AI Models and make sure a model is downloaded.'
            ) as string;
            await addMessage(id, 'assistant', errorMsg);
            setMessages((prev) => [
              ...prev,
              {
                id: -3,
                thread_id: id,
                role: 'assistant',
                content: errorMsg,
                imageUri: null,
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
    [id, modelId, title],
  );

  const sendMessage = async (raw: string, attachedImage: string | null = null) => {
    const query = raw.trim();
    if ((!query && !attachedImage) || isThinking || streaming || !modelId || !id) return;

    setText('');
    setImageUri(null);
    setStreaming('');
    setIsThinking(true);
    scrollToEnd();

    const userMsg: MessageRow = {
      id: -1,
      thread_id: id,
      role: 'user',
      content: query,
      imageUri: attachedImage,
      created_at: Date.now(),
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    await addMessage(id, 'user', query, attachedImage);

    await streamReply(nextHistory.slice(0, -1), query, attachedImage);
    scrollToEnd();
  };

  const handleDisabledImagePress = () => {
    Alert.alert(
      'Photos need the vision model',
      'Your current model is text-only. Download Qwen 2.5-VL 3B from Profile → AI Models to attach and understand photos.',
      [{ text: 'Open Profile', onPress: () => router.push('/(drawer)/profile') }, { text: 'OK' }],
    );
  };

  // While a reply is in flight we always append a placeholder assistant bubble:
  // it shows a typing indicator while the model loads, then fills with the
  // streamed tokens once generation actually starts.
  const displayMessages: MessageRow[] = isThinking
    ? [
        ...messages,
        {
          id: STREAMING_PLACEHOLDER_ID,
          thread_id: id ?? '',
          role: 'assistant',
          content: streaming,
          imageUri: null,
          created_at: Date.now(),
        },
      ]
    : messages;
  const generatingId = isThinking ? STREAMING_PLACEHOLDER_ID : null;

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
        <MessageBubble
          role={item.role}
          content={item.content}
          imageUri={item.imageUri}
          isGenerating={isGenerating}
        />
      </View>
    );
  };

  const showModelBanner = loaded && !modelId && !isThinking;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight + (showModelBanner ? 40 : 0)}
    >
      {showModelBanner && (
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
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
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

      {isThinking && (
        <View style={{ flexDirection: 'row', paddingLeft: 15, paddingBottom: 4 }}>
          <Text style={{ color: '#20C997', fontSize: 13 }}>
            {streaming.length > 0 ? 'Streaming…' : 'Thinking…'}
          </Text>
        </View>
      )}

      <ChatInput
        value={text}
        onChangeText={setText}
        imageUri={imageUri}
        onChangeImage={setImageUri}
        onSend={() => sendMessage(text, imageUri)}
        canSend={!!modelId}
        busy={isThinking}
        canUseImages={canUseImages}
        onDisabledImagePress={handleDisabledImagePress}
      />

      <RenameThreadModal
        visible={renameVisible}
        initialTitle={title}
        onCancel={() => setRenameVisible(false)}
        onSave={saveTitle}
        onSuggest={suggestCurrentTitle}
        canSuggest={!isThinking}
      />
    </KeyboardAvoidingView>
  );
}
