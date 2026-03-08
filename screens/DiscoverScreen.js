import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, KeyboardAvoidingView, Platform,
  useWindowDimensions, ScrollView, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { C } from '../constants/colors';
import { F } from '../constants/fonts';

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
  if (secs < 60)  return `Actualizado hace ${secs}s`;
  if (secs < 3600) return `Actualizado hace ${Math.floor(secs / 60)}min`;
  return `Actualizado hace ${Math.floor(secs / 3600)}h`;
};

const INDICATOR_STYLES = {
  '🟢': { bg: '#F0FDF4', border: '#86EFAC', text: '#16A34A' },
  '🟡': { bg: '#FEFCE8', border: '#FDE047', text: '#CA8A04' },
  '🔴': { bg: '#FFF1F2', border: '#FECDD3', text: '#DC2626' },
};
const INDICATOR_LABELS = { '🟢': 'Interesante', '🟡': 'Neutral', '🔴': 'Evitar' };

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

// ─── Chat Modal ───────────────────────────────────────────────────────────────

function ChatModal({ visible, stock, onClose }) {
  const [msgs, setMsgs]     = useState([]);
  const [input, setInput]   = useState('');
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (visible && stock) {
      setMsgs([{
        id: 0, role: 'assistant',
        text: `Hola 👋 Estoy viendo ${stock.symbol} contigo. ${stock.changesPercentage >= 0 ? 'Sube' : 'Baja'} un ${Math.abs(stock.changesPercentage).toFixed(1)}% hoy. ¿Qué quieres saber?`,
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
      const system = `Eres loopi IA, asesor financiero cercano. El usuario ve ${stock.name} (${stock.symbol}), precio ${fmtPrice(stock.price)}, cambio ${fmtChange(stock.changesPercentage)} hoy. Responde en español casual, máximo 80 palabras, sin jerga.`;
      const reply = await callClaude(system, history, 200);
      setMsgs((p) => [...p, { id: Date.now(), role: 'assistant', text: reply }]);
    } catch {
      setMsgs((p) => [...p, { id: Date.now(), role: 'assistant', text: 'Error al conectar. Inténtalo de nuevo.' }]);
    } finally {
      setTyping(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  if (!stock) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={cm.container}>
        <View style={cm.header}>
          <View style={{ flex: 1 }}>
            <Text style={cm.symbol}>{stock.symbol}</Text>
            <Text style={cm.stockName} numberOfLines={1}>{stock.name}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={cm.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={cm.closeTxt}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView ref={scrollRef} style={cm.msgs} contentContainerStyle={{ paddingVertical: 16 }} showsVerticalScrollIndicator={false}>
          {msgs.map((m) => (
            <View key={m.id} style={[cm.bubble, m.role === 'user' ? cm.bubbleUser : cm.bubbleBot]}>
              <Text style={[cm.bubbleTxt, m.role === 'user' ? cm.bubbleTxtUser : cm.bubbleTxtBot]}>{m.text}</Text>
            </View>
          ))}
          {typing && <View style={cm.bubbleBot}><Text style={cm.typing}>● ● ●</Text></View>}
        </ScrollView>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={cm.inputRow}>
            <TextInput style={cm.input} value={input} onChangeText={setInput}
              placeholder="Pregunta algo…" placeholderTextColor={C.muted}
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

// ─── Invest Modal ─────────────────────────────────────────────────────────────

const AMOUNTS = [25, 50, 100, 200, 500];

function InvestModal({ visible, stock, onClose, onConfirm }) {
  const [amount, setAmount] = useState(100);
  if (!stock) return null;
  const up = stock.changesPercentage >= 0;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={im.overlay}>
        <View style={im.sheet}>
          <View style={im.handle} />
          <Text style={im.ticker}>{stock.symbol}</Text>
          <Text style={im.stockName} numberOfLines={1}>{stock.name}</Text>
          <View style={im.priceRow}>
            <Text style={im.price}>{fmtPrice(stock.price)}</Text>
            <View style={[im.pill, { backgroundColor: up ? C.greenBg : C.redBg }]}>
              <Text style={[im.pillTxt, { color: up ? C.green : C.red }]}>{up ? '▲' : '▼'} {fmtChange(stock.changesPercentage)}</Text>
            </View>
          </View>
          <Text style={im.label}>¿Cuánto quieres invertir?</Text>
          <View style={im.amounts}>
            {AMOUNTS.map((a) => (
              <TouchableOpacity key={a} style={[im.amountBtn, amount === a && im.amountBtnActive]} onPress={() => setAmount(a)} activeOpacity={0.7}>
                <Text style={[im.amountTxt, amount === a && im.amountTxtActive]}>{a}€</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={im.confirmBtn} onPress={() => onConfirm(amount)} activeOpacity={0.85}>
            <Text style={im.confirmTxt}>⚡ Invertir {amount}€ en {stock.symbol}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={im.cancelBtn} onPress={onClose}>
            <Text style={im.cancelTxt}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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
            <View style={card.tipRow}>
              <ActivityIndicator color={C.orange} size="small" />
              <Text style={card.tipLoading}>loopi IA analizando…</Text>
            </View>
          ) : tip ? (
            <>
              <View style={card.tipHeader}>
                <Text style={card.tipLabel}>💡 loopi IA</Text>
                <View style={[card.indicatorPill, { backgroundColor: indStyle.bg, borderColor: indStyle.border }]}>
                  <Text style={[card.indicatorTxt, { color: indStyle.text }]}>{tip.indicator} {indLabel}</Text>
                </View>
              </View>
              <Text style={card.tipText}>{tip.text}</Text>
            </>
          ) : (
            <Text style={card.tipEmpty}>Toca "Saber más" para chatear con loopi IA sobre este activo.</Text>
          )}
        </View>

        <Text style={card.swipeHint}>↕ desliza para ver más</Text>

        <View style={card.buttons}>
          <TouchableOpacity style={card.btnSecondary} onPress={onSaberMas} activeOpacity={0.8}>
            <Text style={card.btnSecondaryTxt}>💬 Saber más</Text>
          </TouchableOpacity>
          <TouchableOpacity style={card.btnPrimary} onPress={onInvertir} activeOpacity={0.8}>
            <Text style={card.btnPrimaryTxt}>⚡ Invertir</Text>
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
  const [allStocks,   setAllStocks]   = useState([]);
  const [marketOpen,  setMarketOpen]  = useState(true);
  const [feedStatus,  setFeedStatus]  = useState('loading'); // 'loading' | 'ready' | 'error'
  const [lastUpdated, setLastUpdated] = useState(null);
  const [elapsed,     setElapsed]     = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const seenSymbols = useRef(new Set());

  const fetchFeed = useCallback(async () => {
    try {
      const res  = await fetch(FEED_API);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const items = data.items ?? data;
      setMarketOpen(data.marketOpen ?? true);

      // Rank items and get embedded tips via Claude
      try {
        console.log('[RankFeed] sending profile:', { riskProfile, age, incomeRange, experience });
        const rankRes = await fetch(RANK_API, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ items, riskProfile, age, incomeRange, experience }),
        });
        if (rankRes.ok) {
          const rankData = await rankRes.json();
          console.log('[RankFeed] top:', rankData.top?.map(i => i.symbol).join(','));
          console.log('[RankFeed] rest:', rankData.rest?.join(','));

          const symbolMap = Object.fromEntries(items.map((s) => [s.symbol, s]));

          // top: merge raw stock data with Claude's indicator + tip
          const topItems = (rankData.top ?? [])
            .map((t) => symbolMap[t.symbol])
            .filter(Boolean);

          // Pre-populate tips from top items
          const newTips = {};
          (rankData.top ?? []).forEach((t) => {
            if (t.indicator && t.tip) newTips[t.symbol] = { indicator: t.indicator, text: t.tip };
          });
          setTips(newTips);

          // rest: map symbols back to raw stock objects, exclude anything already in top
          const topSymbols = new Set(topItems.map((s) => s.symbol));
          const restItems = (rankData.rest ?? [])
            .map((sym) => symbolMap[sym])
            .filter((s) => s && !topSymbols.has(s.symbol));

          console.log('[Feed] topItems:', topItems.length, 'restItems:', restItems.length, 'total:', topItems.length + restItems.length);
          const merged = [...topItems, ...restItems];
          seenSymbols.current = new Set(merged.map((s) => s.symbol));
          setAllStocks(merged);
        } else {
          seenSymbols.current = new Set(items.map((s) => s.symbol));
          setAllStocks(items);
        }
      } catch {
        seenSymbols.current = new Set(items.map((s) => s.symbol));
        setAllStocks(items);
      }

      setLastUpdated(new Date());
      setFeedStatus('ready');
    } catch (err) {
      console.error('[Feed] Error:', err.message);
      // Don't flip back to 'error' if we already have data — keep showing stale
      setFeedStatus((prev) => (prev === 'loading' ? 'error' : prev));
    }
  }, [riskProfile, age, incomeRange, experience]);

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

  // ── Modals & toasts ──
  const [chatStock,   setChatStock]   = useState(null);
  const [investStock, setInvestStock] = useState(null);
  const [toast, setToast]             = useState(null);

  const handleInvest = (amount) => {
    addToPortfolio({ ...investStock, recommended: amount });
    const sym = investStock.symbol;
    setInvestStock(null);
    setToast(`✅ ${amount}€ invertidos en ${sym}`);
    setTimeout(() => setToast(null), 3000);
  };

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
              placeholder="Buscar ticker o empresa…"
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
            <Text style={s.closedBannerTxt}>🔒 Mercado cerrado — precios de cierre</Text>
          </View>
        )}

        {/* Toast */}
        {toast && <View style={s.toast}><Text style={s.toastTxt}>{toast}</Text></View>}

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
            ListEmptyComponent={<Text style={s.emptyTxt}>Sin resultados para "{query}"</Text>}
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
            <Text style={s.errorTitle}>No se pudo cargar el mercado</Text>
            <Text style={s.errorSub}>Comprueba tu conexión e inténtalo de nuevo.</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => { setFeedStatus('loading'); fetchFeed(); }} activeOpacity={0.8}>
              <Text style={s.retryTxt}>Reintentar</Text>
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
                getItemLayout={(_, index) => ({ length: cardHeight, offset: cardHeight * index, index })}
                onEndReached={() => { if (!loadingMore) fetchMore(); }}
                onEndReachedThreshold={0.3}
                ListFooterComponent={loadingMore ? (
                  <View style={s.loadingMoreRow}>
                    <ActivityIndicator size="small" color={C.orange} />
                    <Text style={s.loadingMoreTxt}>loopi IA buscando más...</Text>
                  </View>
                ) : null}
                renderItem={({ item }) => (
                  <StockCard
                    stock={item}
                    height={cardHeight}
                    tip={tips[item.symbol]}
                    tipLoading={false}
                    onSaberMas={() => setChatStock(item)}
                    onInvertir={() => setInvestStock(item)}
                  />
                )}
              />
            )}
            {cardHeight > 0 && feed.length === 0 && feedStatus === 'ready' && (
              <View style={s.errorContainer}>
                <Text style={s.errorEmoji}>📭</Text>
                <Text style={s.errorTitle}>Sin resultados para este perfil</Text>
                <Text style={s.errorSub}>Cambia tu perfil de riesgo para ver más activos.</Text>
              </View>
            )}
          </View>
        )}

      </SafeAreaView>

      <ChatModal visible={!!chatStock} stock={chatStock} onClose={() => setChatStock(null)} />
      <InvestModal visible={!!investStock} stock={investStock} onClose={() => setInvestStock(null)} onConfirm={handleInvest} />
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
  symbol:    { fontSize: 22, fontFamily: F.xbold, color: C.text },
  stockName: { fontSize: 13, fontFamily: F.regular, color: C.muted, marginTop: 2 },
  closeBtn:  { padding: 8, marginLeft: 12 },
  closeTxt:  { fontSize: 16, color: C.muted },
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

const im = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 28, paddingBottom: 40,
  },
  handle:    { width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: 24 },
  ticker:    { fontSize: 36, fontFamily: F.xbold, color: C.text, letterSpacing: -1 },
  stockName: { fontSize: 15, fontFamily: F.regular, color: C.muted, marginTop: 4, marginBottom: 16 },
  priceRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 28 },
  price:     { fontSize: 26, fontFamily: F.bold, color: C.text },
  pill:      { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 20 },
  pillTxt:   { fontSize: 14, fontFamily: F.bold },
  label:     { fontSize: 13, fontFamily: F.semibold, color: C.muted, marginBottom: 12, letterSpacing: 0.3 },
  amounts:   { flexDirection: 'row', gap: 8, marginBottom: 24, flexWrap: 'wrap' },
  amountBtn: {
    paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12,
    borderWidth: 1.5, borderColor: C.border, backgroundColor: C.bg,
  },
  amountBtnActive: { borderColor: C.orange, backgroundColor: C.orangeLight },
  amountTxt:       { fontSize: 15, fontFamily: F.semibold, color: C.sub },
  amountTxtActive: { color: C.orange },
  confirmBtn: {
    backgroundColor: C.orange, borderRadius: 16, paddingVertical: 17, alignItems: 'center',
    shadowColor: C.orange, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 5,
    marginBottom: 12,
  },
  confirmTxt: { fontSize: 16, fontFamily: F.semibold, color: '#FFF' },
  cancelBtn:  { alignItems: 'center', paddingVertical: 10 },
  cancelTxt:  { fontSize: 14, fontFamily: F.medium, color: C.muted },
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
