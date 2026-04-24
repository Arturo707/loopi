import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { C } from '../constants/colors';
import { F } from '../constants/fonts';
import { authFetch } from '../utils/authFetch';

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '');

const STARTER_ID = 'starter';
const STARTER_TEXT =
  "Hey 👋 I'm Loopi. Ask me anything about the market, your portfolio, or a specific stock. I'll give you the real picture — no jargon, no fluff.";

const SUGGESTED = [
  "What's moving today? 🔥",
  "I have $100, what should I do?",
  "Explain my risk profile",
  "Is now a good time to invest?",
];

export default function ChatScreen() {
  const { riskProfile, alpacaPortfolioValue, alpacaPositions } = useApp();

  const [msgs, setMsgs] = useState([{ id: STARTER_ID, role: 'assistant', text: STARTER_TEXT }]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const flatRef = useRef(null);

  // Market data for system prompt
  const [marketVibe,   setMarketVibe]   = useState('');
  const [topMovers,    setTopMovers]    = useState('');
  const [marketLoaded, setMarketLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      authFetch(`${API_BASE}/api/market-vibe`).then((r) => r.json()).catch(() => ({})),
      authFetch(`${API_BASE}/api/market-feed`).then((r) => r.json()).catch(() => ({})),
    ]).then(([vibeData, feedData]) => {
      if (vibeData.vibe) setMarketVibe(vibeData.vibe);
      const items = feedData.items ?? (Array.isArray(feedData) ? feedData : []);
      if (items.length > 0) {
        const movers = items.slice(0, 12).map((s) => {
          const chg = Number(s.changesPercentage);
          return `${s.symbol} ${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%`;
        }).join(', ');
        setTopMovers(movers);
      }
    }).finally(() => setMarketLoaded(true));
  }, []);

  // Animated dots for typing indicator
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (!typing) return;
    const pulse = (dot, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 380, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 380, useNativeDriver: true }),
          Animated.delay(760 - delay),
        ])
      );
    const a1 = pulse(dot1, 0);
    const a2 = pulse(dot2, 253);
    const a3 = pulse(dot3, 507);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [typing]);

  const buildSystem = () => {
    const positions =
      alpacaPositions.length > 0
        ? alpacaPositions.map((p) => `${p.symbol} ($${Number(p.market_value).toFixed(2)})`).join(', ')
        : 'none';
    const portfolioValue = Number(alpacaPortfolioValue).toFixed(2);
    return (
      `You are Loopi, a personal wealth manager for Gen Z. You have access to real-time market data.\n\n` +
      `TODAY'S MARKET: ${marketVibe || 'Market data loading.'}\n\n` +
      `TODAY'S TOP MOVERS: ${topMovers || 'Data loading.'}\n\n` +
      `USER CONTEXT: Risk profile: ${riskProfile}. Portfolio value: $${portfolioValue}. Positions: ${positions}.\n\n` +
      `Your personality: sharp, warm, direct. You're the brilliant friend who actually knows finance. ` +
      `Give specific, actionable takes based on the real data above. Never say you don't have market data — ` +
      `you do, it's injected above. Never give generic advice. Max 3 sentences unless asked for more. ` +
      `No disclaimers. No bullet points unless asked. Occasional dry humor is fine.`
    );
  };

  const send = async (overrideText) => {
    const text = (overrideText ?? input).trim();
    if (!text || typing || !marketLoaded) return;
    setInput('');
    setShowSuggestions(false);

    const userMsg = { id: Date.now(), role: 'user', text };
    const nextMsgs = [...msgs, userMsg];
    setMsgs(nextMsgs);
    setTyping(true);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      // Build history — skip the static starter message (id === STARTER_ID)
      const history = nextMsgs
        .filter((m) => m.id !== STARTER_ID)
        .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));

      const res = await authFetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        body: JSON.stringify({ messages: history, systemPrompt: buildSystem() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chat failed');
      const reply = data.text;
      setMsgs((prev) => [...prev, { id: Date.now(), role: 'assistant', text: reply }]);
    } catch {
      setMsgs((prev) => [
        ...prev,
        { id: Date.now(), role: 'error', text: 'Something went wrong, try again.' },
      ]);
    } finally {
      setTyping(false);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const renderItem = ({ item, index }) => {
    const isUser  = item.role === 'user';
    const isError = item.role === 'error';
    return (
      <>
        <View style={isUser ? s.bubbleUser : isError ? s.bubbleError : s.bubbleBot}>
          <Text style={isUser ? s.txtUser : isError ? s.txtError : s.txtBot}>{item.text}</Text>
        </View>
        {index === 0 && showSuggestions && (
          <View style={s.suggestions}>
            {SUGGESTED.map((p) => (
              <TouchableOpacity key={p} style={s.chip} onPress={() => send(p)} activeOpacity={0.75}>
                <Text style={s.chipTxt}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </>
    );
  };

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.logo}>Loopi</Text>
        <Text style={s.subtitle}>Your personal wealth manager</Text>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatRef}
        data={msgs}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={s.msgList}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
        renderItem={renderItem}
        ListFooterComponent={
          typing ? (
            <View style={s.bubbleBot}>
              <View style={s.dotsRow}>
                <Animated.Text style={[s.dot, { opacity: dot1 }]}>●</Animated.Text>
                <Animated.Text style={[s.dot, { opacity: dot2 }]}>●</Animated.Text>
                <Animated.Text style={[s.dot, { opacity: dot3 }]}>●</Animated.Text>
              </View>
            </View>
          ) : null
        }
      />

      {/* Input */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder={marketLoaded ? 'Ask anything…' : 'Loading market data…'}
            placeholderTextColor={C.muted}
            onSubmitEditing={() => send()}
            returnKeyType="send"
            editable={!typing && marketLoaded}
            multiline
          />
          <TouchableOpacity
            style={[s.sendBtn, (typing || !input.trim() || !marketLoaded) && { opacity: 0.4 }]}
            onPress={() => send()}
            disabled={typing || !input.trim() || !marketLoaded}
          >
            <Text style={s.sendTxt}>→</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  logo:     { fontSize: 28, fontFamily: 'Pacifico_400Regular', color: C.orange },
  subtitle: { fontSize: 13, fontFamily: F.regular, color: C.muted, marginTop: 3 },

  msgList: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },

  bubbleBot: {
    alignSelf: 'flex-start', backgroundColor: '#F3F3F3',
    borderRadius: 18, borderBottomLeftRadius: 4,
    paddingVertical: 12, paddingHorizontal: 16,
    marginBottom: 10, maxWidth: '82%',
  },
  bubbleUser: {
    alignSelf: 'flex-end', backgroundColor: C.orange,
    borderRadius: 18, borderBottomRightRadius: 4,
    paddingVertical: 12, paddingHorizontal: 16,
    marginBottom: 10, maxWidth: '82%',
  },
  bubbleError: {
    alignSelf: 'flex-start', backgroundColor: '#FFF1F2',
    borderRadius: 18, borderBottomLeftRadius: 4,
    paddingVertical: 12, paddingHorizontal: 16,
    marginBottom: 10, maxWidth: '82%',
    borderWidth: 1, borderColor: '#FECDD3',
  },
  txtBot:   { fontSize: 15, fontFamily: F.regular, color: C.text,  lineHeight: 23 },
  txtUser:  { fontSize: 15, fontFamily: F.regular, color: '#FFF',  lineHeight: 23 },
  txtError: { fontSize: 15, fontFamily: F.regular, color: C.red,   lineHeight: 23 },

  dotsRow: { flexDirection: 'row', gap: 5 },
  dot:     { fontSize: 9, color: C.muted },

  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    borderWidth: 1, borderColor: C.border, borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 14, backgroundColor: C.card,
  },
  chipTxt: { fontSize: 13, fontFamily: F.medium, color: C.text },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: C.border, gap: 10,
    backgroundColor: '#FFF',
  },
  input: {
    flex: 1, backgroundColor: '#F3F3F3', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 11,
    fontSize: 15, fontFamily: F.regular, color: C.text, maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: C.orange, width: 44, height: 44,
    borderRadius: 22, alignItems: 'center', justifyContent: 'center',
  },
  sendTxt: { fontSize: 18, color: '#FFF', fontFamily: F.bold },
});
