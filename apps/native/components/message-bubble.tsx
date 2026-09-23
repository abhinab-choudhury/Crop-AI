import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';

const AI_TEXT = '#004D40';
const AI_BG = '#E6F7F5';

export interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  imageUri?: string | null;
  /** True while this is the assistant reply currently being generated. Shows an
   *  animated typing indicator until the first token arrives. */
  isGenerating?: boolean;
}

const markdownStyles = {
  body: { color: AI_TEXT, fontSize: 16, lineHeight: 23 },
  paragraph: { marginTop: 0, marginBottom: 4 },
  heading1: {
    color: AI_TEXT,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 4,
  },
  heading2: {
    color: AI_TEXT,
    fontSize: 19,
    lineHeight: 25,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 3,
  },
  heading3: {
    color: AI_TEXT,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: 'bold',
    marginTop: 6,
    marginBottom: 2,
  },
  heading4: {
    color: AI_TEXT,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 'bold',
    marginTop: 4,
    marginBottom: 2,
  },
  heading5: {
    color: AI_TEXT,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: 'bold',
    marginTop: 4,
    marginBottom: 2,
  },
  heading6: {
    color: AI_TEXT,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 'bold',
    marginTop: 4,
    marginBottom: 2,
  },
  strong: { color: AI_TEXT, fontWeight: 'bold' },
  em: { fontStyle: 'italic' },
  s: { textDecorationLine: 'line-through' },
  link: { color: '#0369a1', textDecorationLine: 'underline' },
  hr: { backgroundColor: 'rgba(0,77,64,0.15)', height: 1, marginVertical: 8 },
  code_inline: {
    backgroundColor: '#d9ece8',
    color: '#0f3d35',
    fontFamily: 'monospace',
    fontSize: 14,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  pre: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    marginTop: 4,
    marginBottom: 6,
    overflow: 'hidden',
  },
  code_block: {
    color: '#e2e8f0',
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 19,
    padding: 12,
  },
  fence: {
    color: '#e2e8f0',
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 19,
    padding: 12,
  },
  blockquote: {
    backgroundColor: 'rgba(0,77,64,0.06)',
    borderLeftColor: '#20C997',
    borderLeftWidth: 3,
    borderRadius: 4,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 2,
    marginTop: 4,
    marginBottom: 6,
  },
  bullet_list: { marginTop: 2, marginBottom: 4 },
  bullet_list_item: { marginBottom: 4 },
  ordered_list: { marginTop: 2, marginBottom: 4 },
  ordered_list_item: { marginBottom: 4 },
  table: {
    marginTop: 6,
    marginBottom: 8,
    borderColor: 'rgba(0,77,64,0.3)',
    borderWidth: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
  tableHeaderCell: {
    backgroundColor: '#d9ece8',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderColor: 'rgba(0,77,64,0.3)',
    borderWidth: 1,
  },
  tableCell: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderColor: 'rgba(0,77,64,0.3)',
    borderWidth: 1,
  },
};

function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0.25)).current;
  const dot2 = useRef(new Animated.Value(0.25)).current;
  const dot3 = useRef(new Animated.Value(0.25)).current;

  useEffect(() => {
    const pulse = (v: Animated.Value) =>
      Animated.sequence([
        Animated.timing(v, {
          toValue: 1,
          duration: 320,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0.25,
          duration: 320,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]);
    const loop = Animated.loop(Animated.stagger(160, [pulse(dot1), pulse(dot2), pulse(dot3)]));
    loop.start();
    return () => loop.stop();
  }, [dot1, dot2, dot3]);

  const dot = (v: Animated.Value) => (
    <Animated.View
      style={{
        width: 7,
        height: 7,
        borderRadius: 3.5,
        backgroundColor: '#0f766e',
        opacity: v,
        marginRight: 5,
      }}
    />
  );

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 2,
      }}
    >
      {dot(dot1)}
      {dot(dot2)}
      {dot(dot3)}
    </View>
  );
}

export function MessageBubble({ role, content, imageUri, isGenerating }: MessageBubbleProps) {
  const isUser = role === 'user';
  const showTyping = isGenerating && !content.trim();
  const showContent = content.trim().length > 0;

  return (
    <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
      {imageUri && (
        <Image
          source={{ uri: imageUri }}
          style={[styles.image, content.trim() ? styles.imageWithText : undefined]}
          resizeMode="cover"
        />
      )}
      {showTyping && <TypingIndicator />}
      {showContent && isUser && <Text style={styles.userText}>{content}</Text>}
      {showContent && !isUser && (
        <Markdown style={markdownStyles as StyleSheet.NamedStyles<any>}>{content}</Markdown>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    padding: 12,
    borderRadius: 16,
    maxWidth: '82%',
  },
  userBubble: { backgroundColor: '#20C997' },
  aiBubble: { backgroundColor: AI_BG },
  userText: { color: '#fff', fontSize: 16, lineHeight: 23 },
  image: {
    width: 200,
    height: 200,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  imageWithText: { marginBottom: 8 },
});
