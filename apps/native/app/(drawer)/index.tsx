import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FlatList, KeyboardAvoidingView, Text, TouchableOpacity, View, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import {
  AGRI_SYSTEM_PROMPT,
  getChatLanguage,
  setChatLanguage,
  getModelInfo,
  getReadyModelId,
  modelSupportsVision,
  setSelectedModelId,
  streamChatMessage,
  suggestChatTitle,
  type LlmModelId,
  type ChatRole,
  type ChatMessage,
  type ChatLanguage,
} from '@/lib/llm';
import { createThread, addMessage, getThread, updateThreadTitle } from '@/lib/db';
import { RenameThreadModal } from '@/components/rename-thread-modal';
import { ChatInput } from '@/components/chat-input';
import { MessageBubble } from '@/components/message-bubble';
import { LanguageSelector } from '@/components/language-selector';
import { ModelSelector } from '@/components/model-selector';
import { onNewChat } from '@/lib/chat-session';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUri?: string | null;
};

const welcomeContent = {
  title: 'Welcome to Crop AI 🌱',
  subtitle: 'Fully offline. Try asking one of these:',
  questions: [
    {
      text: '🌾 Which crop should I plant this season?',
      query: 'Which crop should I plant this season?',
    },
    {
      text: '🔄 Explain a good crop rotation plan',
      query: 'Explain a good crop rotation plan for my farm',
    },
    {
      text: '🦠 How do I treat leaf spots on tomato?',
      query: 'How do I treat leaf spots on my tomato plants?',
    },
    { text: '💧 How much should I water my crops?', query: 'How much should I water my crops?' },
  ],
};

export default function ChatScreen() {
  const flatListRef = useRef<FlatList>(null);
  const abortRef = useRef<AbortController | null>(null);
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation();

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [replyStats, setReplyStats] = useState<{
    seconds: number;
    tokensPerSec: number;
    tokenCount: number;
  } | null>(null);
  const [modelId, setModelId] = useState<LlmModelId | null>(null);
  const [modelChecked, setModelChecked] = useState(false);
  const [language, setLanguage] = useState<ChatLanguage>('english');
  const threadIdRef = useRef<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [title, setTitle] = useState('New Chat');
  const [renameVisible, setRenameVisible] = useState(false);

  const canUseImages = modelId ? modelSupportsVision(modelId) : false;

  useEffect(() => {
    navigation.setOptions({
      headerTitle: () =>
        threadId ? (
          <TouchableOpacity
            onPress={() => setRenameVisible(true)}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              maxWidth: 250,
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
        ) : (
          <Text style={{ fontSize: 20, fontWeight: '600', color: '#111827' }} numberOfLines={1}>
            {title}
          </Text>
        ),
      headerRight: undefined,
    });
  }, [navigation, title, threadId]);

  const saveTitle = async (next: string) => {
    if (!threadId) return;
    await updateThreadTitle(threadId, next);
    setTitle(next);
    setRenameVisible(false);
  };

  const suggestCurrentTitle = useCallback(async (): Promise<string> => {
    if (!modelId || isThinking) return '';
    return suggestChatTitle(messages, modelId);
  }, [modelId, isThinking, messages]);

  // Opening a new chat starts a fresh, unsaved session. Nothing is written to
  // the database until the AI actually replies (see persistSession).
  const resetSession = useCallback(() => {
    abortRef.current?.abort();
    threadIdRef.current = null;
    setThreadId(null);
    setTitle('Chat');
    setMessages([]);
    setStreaming('');
    setIsThinking(false);
    setReplyStats(null);
    setText('');
    setImageUri(null);
  }, []);

  useEffect(() => {
    let mounted = true;
    getReadyModelId().then((id) => {
      if (!mounted) return;
      setModelId(id);
      setModelChecked(true);
    });
    getChatLanguage().then((lang) => {
      if (mounted) setLanguage(lang);
    });
    return () => {
      mounted = false;
      abortRef.current?.abort();
    };
  }, []);

  // Opening the Chat screen always starts a fresh, unsaved session. It is only
  // written to the database once the AI actually replies (see persistSession).
  useFocusEffect(resetSession);

  // "Chat" tapped in the drawer also starts a fresh session, even when the
  // Chat screen is already focused (focus alone wouldn't fire then).
  useEffect(() => onNewChat(resetSession), [resetSession]);

  const scrollToEnd = () =>
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 60);

  const persistSession = useCallback(
    async (history: Message[], query: string, reply: string, attachedImage: string | null) => {
      if (!reply.trim()) return;
      // A session is only saved once an AI interaction happens. Until then the
      // thread lives purely in memory, so abandoned chats never clutter History.
      let tid = threadIdRef.current;
      if (!tid) {
        tid = await createThread('New chat');
        threadIdRef.current = tid;
        setThreadId(tid);
        setTitle(query.slice(0, 40) || 'New chat');
        getThread(tid).then((t) => {
          if (t && t.title !== 'New chat') setTitle(t.title);
        });

        // Ask the on-device model for a short, precise name. This is
        // fire-and-forget — the user sees the fallback title instantly and the
        // smart name arrives a moment later.
        suggestChatTitle(
          [
            ...history.slice(-6).map((m) => ({ role: m.role as ChatRole, content: m.content })),
            { role: 'user', content: query, imageUri: attachedImage },
          ],
          modelId,
        ).then((suggested) => {
          if (!suggested.trim()) return;
          setTitle(suggested);
          updateThreadTitle(tid as string, suggested);
        });
      }
      await addMessage(tid, 'user', query, attachedImage);
      await addMessage(tid, 'assistant', reply);
    },
    [modelId],
  );

  const streamReply = useCallback(
    async (history: Message[], query: string, attachedImage: string | null) => {
      let accumulated = '';
      const startedAt = Date.now();
      let tokenCount = 0;
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const llmMessages: ChatMessage[] = [
          { role: 'system', content: AGRI_SYSTEM_PROMPT },
          ...history.slice(-10).map((m) => ({
            role: (m.role === 'user' ? 'user' : 'assistant') as ChatRole,
            content: m.content,
            imageUri: m.role === 'user' ? (m.imageUri ?? null) : null,
          })),
          { role: 'user', content: query, imageUri: attachedImage },
        ];
        await streamChatMessage({
          messages: llmMessages,
          modelId,
          language,
          signal: controller.signal,
          onToken: (_tok, acc) => {
            tokenCount += 1;
            accumulated = acc;
            setStreaming(acc);
          },
        });
        await persistSession(history, query, accumulated, attachedImage);
        const elapsed = (Date.now() - startedAt) / 1000;
        setReplyStats({
          seconds: elapsed,
          tokenCount,
          tokensPerSec: elapsed > 0 ? tokenCount / elapsed : 0,
        });
        setStreaming('');
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: 'assistant', content: accumulated },
        ]);
        setIsThinking(false);
      } catch (error) {
        const aborted =
          error instanceof Error && (error.message === 'aborted' || error.name === 'AbortError');
        if (!aborted) {
          console.error('Offline chat error:', error);
          setStreaming('');
          setIsThinking(false);
          const errorMsg =
            error instanceof Error && error.message.includes('vision')
              ? '❌ To send photos, download the Qwen 2.5-VL 3B vision model from Profile → AI Models.'
              : '❌ The AI model is not available yet. Open Profile → AI Models and make sure a model is downloaded.';
          setMessages((prev) => [
            ...prev,
            { id: `a-${Date.now()}`, role: 'assistant', content: errorMsg },
          ]);
        }
      } finally {
        abortRef.current = null;
        setIsThinking(false);
      }
    },
    [modelId, persistSession, language],
  );

  const changeLanguage = (next: ChatLanguage) => {
    setLanguage(next);
    setChatLanguage(next);
  };

  const changeModel = (next: LlmModelId) => {
    if (next === modelId) return;
    setModelId(next);
    setSelectedModelId(next);
  };

  const sendMessage = async (raw: string, attachedImage: string | null = null) => {
    const query = raw.trim();
    if ((!query && !attachedImage) || isThinking || streaming || !modelId) return;

    setText('');
    setImageUri(null);
    setStreaming('');
    setReplyStats(null);
    setIsThinking(true);
    scrollToEnd();

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: query,
      imageUri: attachedImage,
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);

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
  const displayMessages: Message[] = isThinking
    ? [...messages, { id: 'streaming', role: 'assistant', content: streaming }]
    : messages;
  const generatingId = isThinking ? 'streaming' : null;

  const renderItem = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    const isGenerating = isThinking && !isUser && item.id === generatingId;
    return (
      <View style={{ marginVertical: 6 }}>
        <MessageBubble
          role={item.role}
          content={item.content}
          imageUri={item.imageUri}
          isGenerating={isGenerating}
        />
      </View>
    );
  };

  const showModelBanner = modelChecked && !modelId && !isThinking;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior="padding"
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

      <FlatList
        ref={flatListRef}
        data={displayMessages}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: 15,
          flexGrow: 1,
          justifyContent: messages.length ? 'flex-start' : 'center',
        }}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={scrollToEnd}
        onLayout={scrollToEnd}
        ListHeaderComponent={
          messages.length === 0 && !isThinking ? (
            <View style={{ alignItems: 'center' }}>
              <Ionicons name="leaf-outline" size={40} color="#20C997" />
              <Text style={{ fontSize: 20, fontWeight: 'bold', marginTop: 8 }}>
                {welcomeContent.title}
              </Text>
              <Text style={{ color: '#666', marginTop: 4, marginBottom: 16 }}>
                {welcomeContent.subtitle}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
                {welcomeContent.questions.map((q, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => sendMessage(q.query)}
                    style={{ backgroundColor: '#E6F7F5', padding: 8, borderRadius: 12, margin: 4 }}
                  >
                    <Text style={{ color: '#004D40' }}>{q.text}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null
        }
      />

      {(isThinking || replyStats) && (
        <View style={{ flexDirection: 'row', paddingLeft: 15, paddingBottom: 4 }}>
          <Text style={{ color: '#20C997', fontSize: 13 }}>
            {isThinking
              ? streaming.length > 0
                ? modelId
                  ? `Streaming from ${getModelInfo(modelId).label}`
                  : 'Streaming…'
                : 'Thinking…'
              : replyStats
                ? `✓ ${replyStats.seconds.toFixed(1)}s · ${replyStats.tokensPerSec.toFixed(1)} tok/s · ${replyStats.tokenCount} tokens`
                : null}
          </Text>
        </View>
      )}

      <LanguageSelector value={language} onChange={changeLanguage} disabled={isThinking} />

      <ModelSelector value={modelId} onChange={changeModel} disabled={isThinking} />

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
