import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  useWindowDimensions, ScrollView, Animated, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { C } from '../constants/colors';
import { F } from '../constants/fonts';
import InvestScreen from './InvestScreen';

// ─── API endpoints ────────────────────────────────────────────────────────────

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  (typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : '');
const FEED_API = `${API_BASE}/api/market-feed`;
const RANK_API = `${API_BASE}/api/rank-feed`;

// ─── Anthropic chat (in-app) ──────────────────────────────────────────────────

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
const CLAUDE_MODEL  = 'claude-sonnet-4-20250514';

async function callClaude(system, messages, maxTokens = 150) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-allow-browser': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, system, messages }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content[0].text.trim();
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtPrice  = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtChange = (n) => { const v = Number(n); return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; };

const fmtElapsed = (secs) => {
  if (secs < 60)   return `Updated ${secs}s ago`;
  if (secs < 3600) return `Updated ${Math.floor(secs / 60)}m ago`;
  return `Updated ${Math.floor(secs / 3600)}h ago`;
};

const INDICATOR_STYLES = {
  '🟢': { bg: '#F0FDF4', border: '#86EFAC', text: '#16A34A' },
  '🟡': { bg: '#FEFCE8', border: '#FDE047', text: '#CA8A04' },
  '🔴': { bg: '#FFF1F2', border: '#FECDD3', text: '#DC2626' },
};
const INDICATOR_LABELS = { '🟢': 'Interesting', '🟡': 'Neutral', '🔴': 'Avoid' };

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard({ height }) {
  const anim = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.9, duration: 850, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.35, duration: 850, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={[sk.card, { height, opacity: anim }]}>
      <View style={sk.tickerBar} />
      <View style={sk.nameBar} />
      <View style={sk.priceRow}>
        <View style={sk.priceBar} />
        <View style={sk.pillBar} />
      </View>
      <View style={sk.tipBox} />
      <View style={sk.btnRow}>
        <View style={sk.btn} />
        <View style={sk.btn} />
      </View>
    </Animated.View>
  );
}

// ─── Tip skeleton (phase 1 placeholder inside a card) ────────────────────────

function TipSkeleton() {
  const anim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.75, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3,  duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={{ opacity: anim }}>
      <View style={{ height: 10, width: 80,  backgroundColor: C.border, borderRadius: 5, marginBottom: 10 }} />
      <View style={{ height: 12, width: '100%', backgroundColor: C.border, borderRadius: 5, marginBottom: 6 }} />
      <View style={{ height: 12, width: '85%',  backgroundColor: C.border, borderRadius: 5 }} />
    </Animated.View>
  );
}

// ─── Learn More Modal ─────────────────────────────────────────────────────────

function ChatModal({ visible, stock, tip, onClose }) {
  const [msgs, setMsgs]     = useState([]);
  const [input, setInput]   = useState('');
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (visible && stock) {
      setMsgs([{
        id: 0, role: 'assistant',
        text: `Hey 👋 Ask me anything about ${stock.symbol}. It's ${stock.changesPercentage >= 0 ? 'up' : 'down'} ${Math.abs(stock.changesPercentage).toFixed(1)}% today.`,
      }]);
      setInput('');
    }
  }, [visible, stock?.symbol]);

  const send = async () => {
    const text = input.trim();
    if (!text || typing) return;
    const userMsg = { id: Date.now(), role: 'user', text };
    const nextMsgs = [...msgs, userMsg];
    setMsgs(nextMsgs);
    setInput('');
    setTyping(true);
    try {
      const history = nextMsgs.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }));
      const system = `You are loopi AI, a friendly finance assistant. The user is looking at ${stock.name} (${stock.symbol}), price ${fmtPrice(stock.price)}, change ${fmtChange(stock.changesPercentage)} today. Reply in casual English, max 80 words, no jargon.`;
      const reply = await callClaude(system, history, 200);
      setMsgs((p) => [...p, { id: Date.now(), role: 'assistant', text: reply }]);
    } catch {
      setMsgs((p) => [...p, { id: Date.now(), role: 'assistant', text: 'Connection failed. Try again.' }]);
    } finally {
      setTyping(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  if (!stock) return null;

  const up = stock.changesPercentage >= 0;
  const indStyle = tip ? (INDICATOR_STYLES[tip.indicator] ?? INDICATOR_STYLES['🟡']) : null;
  const indLabel = tip ? (INDICATOR_LABELS[tip.indicator] ?? 'Neutral') : null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={cm.container}>

        {/* Header */}
        <View style={cm.header}>
          <TouchableOpacity onPress={onClose} style={cm.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={cm.backTxt}>←</Text>
          </TouchableOpacity>
          <View style={cm.headerInfo}>
            <Text style={cm.symbol}>{stock.symbol}</Text>
            <Text style={cm.stockName} numberOfLines={1}>{stock.name}</Text>
          </View>
        </View>

        {/* Price row */}
        <View style={cm.priceRow}>
          <Text style={cm.price}>{fmtPrice(stock.price)}</Text>
          <View style={[cm.changePill, { backgroundColor: up ? C.greenBg : C.redBg }]}>
            <Text style={[cm.changeTxt, { color: up ? C.green : C.red }]}>
              {up ? '▲' : '▼'} {fmtChange(stock.changesPercentage)}
            </Text>
          </View>
          <View style={cm.typeBadge}>
            <Text style={cm.typeBadgeTxt}>{stock.type === 'etf' ? 'ETF' : 'STOCK'}</Text>
          </View>
        </View>

        {/* Vibe check tip card */}
        {tip && (
          <View style={cm.tipCard}>
            <View style={cm.tipHeader}>
              <Text style={cm.tipLabel}>💡 Vibe check</Text>
              <View style={[cm.indicatorPill, { backgroundColor: indStyle.bg, borderColor: indStyle.border }]}>
                <Text style={[cm.indicatorTxt, { color: indStyle.text }]}>{tip.indicator} {indLabel}</Text>
              </View>
            </View>
            <Text style={cm.tipText}>{tip.text}</Text>
          </View>
        )}

        {/* Chat messages */}
        <ScrollView ref={scrollRef} style={cm.msgs} contentContainerStyle={{ paddingVertical: 16, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
          {msgs.map((m) => (
            <View key={m.id} style={m.role === 'user' ? cm.bubbleUser : cm.bubbleBot}>
              <Text style={[cm.bubbleTxt, m.role === 'user' ? cm.bubbleTxtUser : cm.bubbleTxtBot]}>{m.text}</Text>
            </View>
          ))}
          {typing && <View style={cm.bubbleBot}><Text style={cm.typing}>● ● ●</Text></View>}
        </ScrollView>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={cm.inputRow}>
            <TextInput style={cm.input} value={input} onChangeText={setInput}
              placeholder="Ask something…" placeholderTextColor={C.muted}
              onSubmitEditing={send} returnKeyType="send" editable={!typing} />
            <TouchableOpacity style={[cm.sendBtn, typing && { opacity: 0.5 }]} onPress={send} disabled={typing}>
              <Text style={cm.sendTxt}>→</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>

      </SafeAreaView>
    </Modal>
  );
}

// ─── Market Pulse Card ────────────────────────────────────────────────────────

function MarketPulseCard({ vibe, loading }) {
  const anim = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    if (!loading) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.9, duration: 850, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.35, duration: 850, useNativeDriver: true }),
      ])
    ).start();
  }, [loading]);

  const todayStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (loading) {
    return (
      <Animated.View style={[pulse.card, { opacity: anim }]}>
        <View style={pulse.skRow}>
          <View style={pulse.skLabel} />
          <View style={pulse.skDate} />
        </View>
        <View style={pulse.skLine1} />
        <View style={pulse.skLine2} />
      </Animated.View>
    );
  }

  if (!vibe) return null;

  return (
    <View style={pulse.card}>
      <View style={pulse.accent} />
      <View style={pulse.content}>
        <View style={pulse.labelRow}>
          <Text style={pulse.label}>MARKET PULSE</Text>
          <Text style={pulse.date}>{todayStr}</Text>
        </View>
        <Text style={pulse.text}>{vibe}</Text>
      </View>
    </View>
  );
}

// ─── Stock Card ───────────────────────────────────────────────────────────────

function StockCard({ stock, height, tip, tipLoading, onSaberMas, onInvertir }) {
  const up = stock.changesPercentage >= 0;
  const indStyle = tip ? (INDICATOR_STYLES[tip.indicator] ?? INDICATOR_STYLES['🟡']) : null;
  const indLabel = tip ? (INDICATOR_LABELS[tip.indicator] ?? 'Neutral') : null;
  return (
    <View style={{ height }}>
      <LinearGradient
        colors={up ? ['#FFFBF6', '#F0FDF4'] : ['#FFFBF6', '#FFF1F2']}
        style={card.container}
      >
        <View style={card.top}>
          <Text style={card.ticker}>{stock.symbol}</Text>
          <Text style={card.name} numberOfLines={2}>{stock.name}</Text>
          <View style={card.badge}>
            <Text style={card.badgeTxt}>{stock.type === 'etf' ? 'ETF' : 'STOCK'}</Text>
          </View>
        </View>

        <View style={card.priceRow}>
          <Text style={card.price}>{fmtPrice(stock.price)}</Text>
          <View style={[card.changePill, { backgroundColor: up ? C.greenBg : C.redBg }]}>
            <Text style={[card.changeTxt, { color: up ? C.green : C.red }]}>
              {up ? '▲' : '▼'} {fmtChange(stock.changesPercentage)}
            </Text>
          </View>
        </View>

        <View style={card.tipCard}>
          {tipLoading ? (
            <TipSkeleton />
          ) : tip ? (
            <>
              <View style={card.tipHeader}>
                <Text style={card.tipLabel}>💡 Vibe check</Text>
                <View style={[card.indicatorPill, { backgroundColor: indStyle.bg, borderColor: indStyle.border }]}>
                  <Text style={[card.indicatorTxt, { color: indStyle.text }]}>{tip.indicator} {indLabel}</Text>
                </View>
              </View>
              <Text style={card.tipText} numberOfLines={3}>{tip.text}</Text>
            </>
          ) : null}
        </View>

        <Text style={card.swipeHint}>↕ swipe for more</Text>

        <View style={card.buttons}>
          <TouchableOpacity style={card.btnSecondary} onPress={onSaberMas} activeOpacity={0.8}>
            <Text style={card.btnSecondaryTxt}>💬 Learn more</Text>
          </TouchableOpacity>
          <TouchableOpacity style={card.btnPrimary} onPress={onInvertir} activeOpacity={0.8}>
            <Text style={card.btnPrimaryTxt}>⚡ Invest</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DiscoverScreen() {
  const { balance, investedAmount, addToPortfolio, riskProfile, age, incomeRange, experience } = useApp();
  const { height: windowHeight } = useWindowDimensions();

  // ── Live feed state ──
  const [allStocks,    setAllStocks]    = useState([]);
  const [marketOpen,   setMarketOpen]   = useState(true);
  const [feedStatus,   setFeedStatus]   = useState('loading'); // 'loading' | 'ready' | 'error'
  const [rankingStatus, setRankingStatus] = useState('idle'); // 'idle' | 'ranking' | 'done'
  const [lastUpdated,  setLastUpdated]  = useState(null);
  const [elapsed,      setElapsed]      = useState(0);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const seenSymbols = useRef(new Set());

  // Phase 2: rank raw items in background, swap in ranked results when ready
  const rankItems = useCallback(async (items) => {
    setRankingStatus('ranking');
    try {
      const rankRes = await fetch(RANK_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items, riskProfile, age, incomeRange, experience }),
      });
      if (!rankRes.ok) { setRankingStatus('done'); return; }

      const rankData = await rankRes.json();
      const symbolMap = Object.fromEntries(items.map((s) => [s.symbol, s]));

      const topItems = (rankData.top ?? []).map((t) => symbolMap[t.symbol]).filter(Boolean);
      const newTips  = {};
      (rankData.top ?? []).forEach((t) => {
        if (t.indicator && t.tip) newTips[t.symbol] = { indicator: t.indicator, text: t.tip };
      });

      const topSymbols = new Set(topItems.map((s) => s.symbol));
      const restItems  = (rankData.rest ?? [])
        .map((sym) => symbolMap[sym])
        .filter((s) => s && !topSymbols.has(s.symbol));

      const merged = [...topItems, ...restItems];
      seenSymbols.current = new Set(merged.map((s) => s.symbol));
      setTips((prev) => ({ ...prev, ...newTips }));
      setAllStocks(merged);
    } catch {
      // ranking failed — keep raw order that's already showing
    } finally {
      setRankingStatus('done');
    }
  }, [riskProfile, age, incomeRange, experience]);

  const fetchFeed = useCallback(async () => {
    try {
      const res  = await fetch(FEED_API);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const items = data.items ?? data;
      setMarketOpen(data.marketOpen ?? true);

      // Phase 1: show raw stocks immediately
      seenSymbols.current = new Set(items.map((s) => s.symbol));
      setAllStocks(items);
      setLastUpdated(new Date());
      setFeedStatus('ready');

      // Phase 2: rank in background (non-blocking)
      rankItems(items);
    } catch (err) {
      console.error('[Feed] Error:', err.message);
      setFeedStatus((prev) => (prev === 'loading' ? 'error' : prev));
    }
  }, [rankItems]);

  // Initial fetch + 60s refresh interval; re-run when risk profile changes
  useEffect(() => {
    fetchFeed();
    const interval = setInterval(fetchFeed, 60_000);
    return () => clearInterval(interval);
  }, [fetchFeed]);

  // ── Load more (append fresh Claude-ranked batch, no duplicates) ──
  const fetchMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res  = await fetch(FEED_API);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      // Only pass items Claude hasn't shown yet this session
      const allItems   = data.items ?? data;
      const freshItems = allItems.filter((s) => !seenSymbols.current.has(s.symbol));
      if (freshItems.length === 0) return;

      const rankRes = await fetch(RANK_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: freshItems, riskProfile, age, incomeRange, experience }),
      });
      if (!rankRes.ok) return;

      const rankData = await rankRes.json();
      const symbolMap = Object.fromEntries(freshItems.map((s) => [s.symbol, s]));

      const topItems = (rankData.top ?? [])
        .map((t) => symbolMap[t.symbol])
        .filter((s) => s && !seenSymbols.current.has(s.symbol));

      const newTips = {};
      (rankData.top ?? []).forEach((t) => {
        if (t.indicator && t.tip) newTips[t.symbol] = { indicator: t.indicator, text: t.tip };
      });

      const topSymbols = new Set(topItems.map((s) => s.symbol));
      const restItems  = (rankData.rest ?? [])
        .map((sym) => symbolMap[sym])
        .filter((s) => s && !seenSymbols.current.has(s.symbol) && !topSymbols.has(s.symbol));

      const newItems = [...topItems, ...restItems];
      newItems.forEach((s) => seenSymbols.current.add(s.symbol));

      setTips((prev) => ({ ...prev, ...newTips }));
      setAllStocks((prev) => [...prev, ...newItems]);
    } catch (err) {
      console.error('[FetchMore] Error:', err.message);
    } finally {
      setLoadingMore(false);
    }
  }, [riskProfile, age, incomeRange, experience]);

  // Elapsed-seconds ticker
  useEffect(() => {
    if (!lastUpdated) return;
    setElapsed(0);
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  // ── Feed (ordered by Claude ranking) ──
  const feed = allStocks;

  // ── Card height ──
  const [cardHeight, setCardHeight] = useState(windowHeight - 160);

  // ── Search ──
  const [query, setQuery] = useState('');
  const searchResults = query.trim()
    ? allStocks.filter((s) => {
        const q = query.trim().toLowerCase();
        return s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
      })
    : [];

  // ── AI tips (pre-populated from rank-feed for top items) ──
  const [tips, setTips] = useState({});

  // ── Market Pulse ──
  const [marketVibe,  setMarketVibe]  = useState(null);
  const [vibeLoading, setVibeLoading] = useState(true);

  useEffect(() => {
    const url = `${API_BASE}/api/market-vibe`;
    console.log('[MarketPulse] fetching from:', url);
    fetch(url)
      .then((r) => {
        console.log('[MarketPulse] response status:', r.status);
        return r.json();
      })
      .then((data) => {
        console.log('[MarketPulse] data:', JSON.stringify(data).slice(0, 120));
        setMarketVibe(data.vibe || "Markets are open. Check the feed for today's biggest movers.");
      })
      .catch((err) => {
        console.warn('[MarketPulse] fetch failed:', err.message);
        setMarketVibe("Markets are open. Check the feed for today's biggest movers.");
      })
      .finally(() => setVibeLoading(false));
  }, []);

  // ── Modals & toasts ──
  const [chatStock,   setChatStock]  = useState(null);
  const [investStock, setInvestStock] = useState(null);
  const [toast,       setToast]      = useState(null);

  const isSearching = query.trim().length > 0;

  // ── Render ──
  return (
    <View style={s.container}>
      <SafeAreaView style={{ flex: 1 }}>

        {/* ── Search bar + timestamp ── */}
        <View style={s.topRow}>
          <View style={s.searchWrapper}>
            <Text style={s.searchIcon}>🔍</Text>
            <TextInput
              style={s.searchInput}
              placeholder="Search ticker or company…"
              placeholderTextColor={C.muted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.clearBtn}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          {feedStatus === 'ready' && !isSearching && (
            <Text style={s.timestamp}>{fmtElapsed(elapsed)}</Text>
          )}
        </View>

        {/* Closed-market banner */}
        {feedStatus === 'ready' && !marketOpen && (
          <View style={s.closedBanner}>
            <Text style={s.closedBannerTxt}>🔒 Market closed — closing prices</Text>
          </View>
        )}

        {/* Personalizing banner — shown while rank-feed is running in background */}
        {feedStatus === 'ready' && rankingStatus === 'ranking' && !isSearching && (
          <View style={s.personalizingBanner}>
            <ActivityIndicator size="small" color={C.orange} style={{ marginRight: 8 }} />
            <Text style={s.personalizingTxt}>Personalizing your feed…</Text>
          </View>
        )}

        {/* Toast */}
        {toast && <View style={s.toast}><Text style={s.toastTxt}>{toast}</Text></View>}

        {!isSearching && <MarketPulseCard vibe={marketVibe} loading={vibeLoading} />}

        {isSearching ? (
          /* ── Search results ── */
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.symbol}
            contentContainerStyle={s.searchList}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const up = item.changesPercentage >= 0;
              return (
                <View style={s.resultRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.resultTicker}>{item.symbol}</Text>
                    <Text style={s.resultName} numberOfLines={1}>{item.name}</Text>
                    <Text style={s.resultExchange}>{item.type === 'etf' ? 'ETF' : 'STOCK'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.resultPrice}>{fmtPrice(item.price)}</Text>
                    <Text style={[s.resultChange, { color: up ? C.green : C.red }]}>{fmtChange(item.changesPercentage)}</Text>
                  </View>
                </View>
              );
            }}
            ItemSeparatorComponent={() => <View style={s.separator} />}
            ListEmptyComponent={<Text style={s.emptyTxt}>No results for "{query}"</Text>}
          />
        ) : feedStatus === 'loading' ? (
          /* ── Skeleton ── */
          <View style={{ flex: 1 }} onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}>
            {[0, 1, 2].map((i) => (
              <SkeletonCard key={i} height={cardHeight} />
            ))}
          </View>
        ) : feedStatus === 'error' ? (
          /* ── Error state ── */
          <View style={s.errorContainer}>
            <Text style={s.errorEmoji}>⚠️</Text>
            <Text style={s.errorTitle}>Could not load market data</Text>
            <Text style={s.errorSub}>Check your connection and try again.</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => { setFeedStatus('loading'); fetchFeed(); }} activeOpacity={0.8}>
              <Text style={s.retryTxt}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* ── Live card feed ── */
          <View
            style={{ flex: 1 }}
            onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
          >
            {cardHeight > 0 && feed.length > 0 && (
              <FlatList
                data={feed}
                keyExtractor={(item) => item.symbol}
                pagingEnabled
                showsVerticalScrollIndicator={false}
                decelerationRate="fast"
                snapToInterval={cardHeight}
                snapToAlignment="start"
                extraData={tips}
                getItemLayout={(_, index) => ({ length: cardHeight, offset: cardHeight * index, index })}
                onEndReached={() => { if (!loadingMore) fetchMore(); }}
                onEndReachedThreshold={0.3}
                ListFooterComponent={loadingMore ? (
                  <View style={s.loadingMoreRow}>
                    <ActivityIndicator size="small" color={C.orange} />
                    <Text style={s.loadingMoreTxt}>Vibe check... loading more</Text>
                  </View>
                ) : null}
                renderItem={({ item }) => (
                  <StockCard
                    stock={item}
                    height={cardHeight}
                    tip={tips[item.symbol]}
                    tipLoading={rankingStatus === 'ranking' && !tips[item.symbol]}
                    onSaberMas={() => setChatStock(item)}
                    onInvertir={() => setInvestStock(item)}
                  />
                )}
              />
            )}
            {cardHeight > 0 && feed.length === 0 && feedStatus === 'ready' && (
              <View style={s.errorContainer}>
                <Text style={s.errorEmoji}>📭</Text>
                <Text style={s.errorTitle}>No results for your profile</Text>
                <Text style={s.errorSub}>Change your risk profile to see more.</Text>
              </View>
            )}
          </View>
        )}

      </SafeAreaView>

      <ChatModal visible={!!chatStock} stock={chatStock} tip={chatStock ? tips[chatStock.symbol] : null} onClose={() => setChatStock(null)} />
      <InvestScreen
        visible={!!investStock}
        stock={investStock}
        onClose={() => setInvestStock(null)}
        onSuccess={(msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sk = StyleSheet.create({
  card: {
    marginHorizontal: 16, marginTop: 12, borderRadius: 24,
    backgroundColor: C.card, padding: 28,
    justifyContent: 'space-between',
    borderWidth: 1, borderColor: C.border,
  },
  tickerBar: { height: 52, width: 160, backgroundColor: C.border, borderRadius: 10, marginBottom: 10 },
  nameBar:   { height: 16, width: 120, backgroundColor: C.border, borderRadius: 6,  marginBottom: 24 },
  priceRow:  { flexDirection: 'row', gap: 12, marginBottom: 24 },
  priceBar:  { height: 28, width: 100, backgroundColor: C.border, borderRadius: 8 },
  pillBar:   { height: 28, width: 72,  backgroundColor: C.border, borderRadius: 20 },
  tipBox:    { height: 80, backgroundColor: C.border, borderRadius: 16, marginBottom: 24 },
  btnRow:    { flexDirection: 'row', gap: 12 },
  btn:       { flex: 1, height: 50, backgroundColor: C.border, borderRadius: 16 },
});

const card = StyleSheet.create({
  container: {
    flex: 1, paddingHorizontal: 28, paddingTop: 32, paddingBottom: 28,
    justifyContent: 'space-between',
  },
  top: { gap: 6 },
  ticker:   { fontSize: 60, fontFamily: F.xbold, color: C.text, letterSpacing: -3, lineHeight: 64 },
  name:     { fontSize: 17, fontFamily: F.medium, color: C.sub },
  badge:    { alignSelf: 'flex-start', backgroundColor: C.border, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8 },
  badgeTxt: { fontSize: 11, fontFamily: F.semibold, color: C.muted, letterSpacing: 0.5 },
  priceRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  price:      { fontSize: 34, fontFamily: F.bold, color: C.text, letterSpacing: -1 },
  changePill: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20 },
  changeTxt:  { fontSize: 15, fontFamily: F.bold },
  tipCard: {
    backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: C.border,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    minHeight: 80, justifyContent: 'center',
  },
  tipRow:        { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tipLoading:    { fontSize: 13, fontFamily: F.regular, color: C.muted },
  tipHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  tipLabel:      { fontSize: 11, fontFamily: F.semibold, color: C.orange, letterSpacing: 0.5 },
  indicatorPill: { borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1 },
  indicatorTxt:  { fontSize: 12, fontFamily: F.semibold },
  tipText:       { fontSize: 15, fontFamily: F.regular, color: C.text, lineHeight: 23 },
  tipEmpty:      { fontSize: 14, fontFamily: F.regular, color: C.muted, textAlign: 'center', lineHeight: 22 },
  swipeHint:     { fontSize: 12, fontFamily: F.regular, color: C.muted, textAlign: 'center' },
  buttons:       { flexDirection: 'row', gap: 12 },
  btnSecondary: {
    flex: 1, paddingVertical: 16, borderRadius: 16, borderWidth: 1.5,
    borderColor: C.orange, alignItems: 'center', backgroundColor: 'rgba(249,115,22,0.05)',
  },
  btnSecondaryTxt: { fontSize: 15, fontFamily: F.semibold, color: C.orange },
  btnPrimary: {
    flex: 1, paddingVertical: 16, borderRadius: 16, backgroundColor: C.orange, alignItems: 'center',
    shadowColor: C.orange, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  btnPrimaryTxt: { fontSize: 15, fontFamily: F.semibold, color: '#FFF' },
});

const cm = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24,
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn:    { paddingRight: 16, paddingVertical: 4 },
  backTxt:    { fontSize: 22, color: C.text, fontFamily: F.bold },
  headerInfo: { flex: 1 },
  symbol:    { fontSize: 22, fontFamily: F.xbold, color: C.text },
  stockName: { fontSize: 13, fontFamily: F.regular, color: C.muted, marginTop: 2 },
  closeBtn:  { padding: 8, marginLeft: 12 },
  closeTxt:  { fontSize: 16, color: C.muted },
  priceRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  price:     { fontSize: 26, fontFamily: F.bold, color: C.text, letterSpacing: -0.5 },
  changePill: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 20 },
  changeTxt:  { fontSize: 14, fontFamily: F.bold },
  typeBadge:  { marginLeft: 'auto', backgroundColor: C.border, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8 },
  typeBadgeTxt: { fontSize: 11, fontFamily: F.semibold, color: C.muted, letterSpacing: 0.5 },
  tipCard: {
    marginHorizontal: 20, marginBottom: 4, marginTop: 12,
    backgroundColor: C.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: C.border,
  },
  tipHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  tipLabel:      { fontSize: 11, fontFamily: F.semibold, color: C.orange, letterSpacing: 0.5 },
  indicatorPill: { borderRadius: 20, paddingVertical: 3, paddingHorizontal: 10, borderWidth: 1 },
  indicatorTxt:  { fontSize: 12, fontFamily: F.semibold },
  tipText:       { fontSize: 14, fontFamily: F.regular, color: C.text, lineHeight: 22 },
  msgs:      { flex: 1, paddingHorizontal: 20 },
  bubble:    { borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 8, maxWidth: '82%' },
  bubbleBot: { alignSelf: 'flex-start', backgroundColor: C.bgAlt ?? C.card, borderRadius: 16, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: C.border, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 8, maxWidth: '82%' },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: C.orange, borderRadius: 16, borderBottomRightRadius: 4, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 8, maxWidth: '82%' },
  bubbleTxt:     { fontSize: 14, lineHeight: 21, fontFamily: F.regular },
  bubbleTxtBot:  { color: C.text },
  bubbleTxtUser: { color: '#FFF' },
  typing:  { fontSize: 10, color: C.muted, fontFamily: F.medium, letterSpacing: 4 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: C.border, gap: 10,
  },
  input: {
    flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, fontFamily: F.regular, color: C.text,
  },
  sendBtn: { backgroundColor: C.orange, width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sendTxt: { fontSize: 18, color: '#FFF', fontFamily: F.bold },
});


const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  topRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginTop: 12, marginBottom: 8, gap: 10,
  },
  searchWrapper: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  searchIcon:  { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: F.regular, color: C.text },
  clearBtn:    { fontSize: 13, color: C.muted, paddingLeft: 8 },
  timestamp:   { fontSize: 11, fontFamily: F.regular, color: C.muted, flexShrink: 0 },

  closedBanner: {
    marginHorizontal: 20, marginBottom: 8,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14,
    alignItems: 'center',
  },
  closedBannerTxt: { fontSize: 12, fontFamily: F.medium, color: C.muted },

  personalizingBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 20, marginBottom: 8,
    backgroundColor: C.orangeGlow, borderWidth: 1, borderColor: C.orangeBorder,
    borderRadius: 12, paddingVertical: 7, paddingHorizontal: 14,
  },
  personalizingTxt: { fontSize: 12, fontFamily: F.medium, color: C.orange },

  toast: {
    marginHorizontal: 20, marginBottom: 8, backgroundColor: C.text,
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center',
  },
  toastTxt: { fontSize: 13, fontFamily: F.semibold, color: '#FFF' },

  // Search results
  searchList:     { paddingHorizontal: 20, paddingTop: 4 },
  resultRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  resultTicker:   { fontSize: 15, fontFamily: F.bold, color: C.text },
  resultName:     { fontSize: 13, fontFamily: F.regular, color: C.sub, marginTop: 1 },
  resultExchange: { fontSize: 11, fontFamily: F.regular, color: C.muted, marginTop: 2 },
  resultPrice:    { fontSize: 14, fontFamily: F.semibold, color: C.text },
  resultChange:   { fontSize: 12, fontFamily: F.medium, marginTop: 2 },
  separator:      { height: 1, backgroundColor: C.border },
  emptyTxt:       { textAlign: 'center', marginTop: 48, fontSize: 14, fontFamily: F.regular, color: C.muted, paddingHorizontal: 32 },

  // Load more footer
  loadingMoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 20 },
  loadingMoreTxt: { fontSize: 13, fontFamily: F.regular, color: C.muted },

  // Error / empty state
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  errorEmoji:     { fontSize: 48, marginBottom: 16 },
  errorTitle:     { fontSize: 18, fontFamily: F.xbold, color: C.text, textAlign: 'center', marginBottom: 8 },
  errorSub:       { fontSize: 14, fontFamily: F.regular, color: C.muted, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  retryBtn: {
    backgroundColor: C.orange, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32,
    shadowColor: C.orange, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  retryTxt: { fontSize: 15, fontFamily: F.bold, color: '#FFF' },
});

const pulse = StyleSheet.create({
  card: {
    flexDirection: 'row',
    marginHorizontal: 20, marginBottom: 8,
    backgroundColor: C.card, borderRadius: 16,
    borderWidth: 1, borderColor: C.border,
    overflow: 'hidden',
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  accent: { width: 4, backgroundColor: C.orange },
  content: { flex: 1, paddingHorizontal: 14, paddingVertical: 12 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: 10, fontFamily: F.semibold, color: C.orange, letterSpacing: 1.5 },
  date: { fontSize: 10, fontFamily: F.regular, color: C.muted },
  text: { fontSize: 13, fontFamily: F.regular, color: C.sub, lineHeight: 20 },
  // skeleton
  skRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  skLabel: { height: 10, width: 90, backgroundColor: C.border, borderRadius: 4 },
  skDate:  { height: 10, width: 40, backgroundColor: C.border, borderRadius: 4 },
  skLine1: { height: 12, backgroundColor: C.border, borderRadius: 4, marginBottom: 6 },
  skLine2: { height: 12, width: '70%', backgroundColor: C.border, borderRadius: 4 },
});
