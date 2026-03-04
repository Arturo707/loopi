import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, KeyboardAvoidingView, Platform,
  useWindowDimensions, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { C } from '../constants/colors';
import { F } from '../constants/fonts';

// ─── Config ──────────────────────────────────────────────────────────────────

const FMP_STABLE     = 'https://financialmodelingprep.com/stable';
const FMP_BASE       = 'https://financialmodelingprep.com/api/v3';
const FMP_KEY        = process.env.EXPO_PUBLIC_FMP_API_KEY;
const ANTHROPIC_KEY  = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
const CLAUDE_MODEL   = 'claude-sonnet-4-20250514';
const REFRESH_MS     = 60_000;
const SEARCH_DEBOUNCE_MS = 500;

// ─── FMP API ─────────────────────────────────────────────────────────────────

async function fmpGet(path, { stable = false } = {}) {
  const base = stable ? FMP_STABLE : FMP_BASE;
  const sep  = path.includes('?') ? '&' : '?';
  const res  = await fetch(`${base}${path}${sep}apikey=${FMP_KEY}`);
  if (!res.ok) throw new Error(`FMP HTTP ${res.status}`);
  const data = await res.json();
  if (data?.['Error Message']) throw new Error(data['Error Message']);
  return data;
}

// ─── Anthropic API ───────────────────────────────────────────────────────────

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

const TIP_API = typeof window !== 'undefined' && window.location
  ? `${window.location.origin}/api/generate-tip`
  : '/api/generate-tip';

async function generateTip(symbol, name, price, changePct) {
  const res = await fetch(TIP_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ symbol, name, price: Number(price), changePct: Number(changePct) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Tip API failed');
  return data; // { indicator, tip }
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

const toArray = (d) => {
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') { const v = Object.values(d).find(Array.isArray); if (v) return v; }
  return [];
};

const normalizeStock = (item) => ({
  symbol:        item.symbol ?? '',
  name:          item.name ?? item.companyName ?? '',
  price:         Number(item.price ?? 0),
  changePercent: Number(item.changesPercentage ?? item.changePercentage ?? item.change ?? 0),
  exchange:      item.exchange ?? item.exchangeShortName ?? '',
});

const isValidStock = (s) => s.price > 1 && /^[A-Z]{1,5}$/.test(s.symbol) && s.name.length > 0;

const buildFeed = (actives, gainers) => {
  const seen = new Set();
  return [...toArray(actives), ...toArray(gainers)]
    .map(normalizeStock)
    .filter((s) => { if (seen.has(s.symbol) || !isValidStock(s)) return false; seen.add(s.symbol); return true; });
};

const fmtPrice  = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtChange = (n) => { const v = Number(n); return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; };

const INDICATOR_STYLES = {
  '🟢': { bg: '#F0FDF4', border: '#86EFAC', text: '#16A34A' },
  '🟡': { bg: '#FEFCE8', border: '#FDE047', text: '#CA8A04' },
  '🔴': { bg: '#FFF1F2', border: '#FECDD3', text: '#DC2626' },
};
const INDICATOR_LABELS = { '🟢': 'Interesante', '🟡': 'Neutral', '🔴': 'Evitar' };

// ─── Chat Modal ───────────────────────────────────────────────────────────────

function ChatModal({ visible, stock, onClose }) {
  const [msgs, setMsgs]   = useState([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (visible && stock) {
      setMsgs([{
        id: 0, role: 'assistant',
        text: `Hola 👋 Estoy viendo ${stock.symbol} contigo. ${stock.changePercent >= 0 ? 'Sube' : 'Baja'} un ${Math.abs(stock.changePercent).toFixed(1)}% hoy. ¿Qué quieres saber?`,
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
      const system = `Eres loopi IA, asesor financiero cercano. El usuario ve ${stock.name} (${stock.symbol}), precio ${fmtPrice(stock.price)}, cambio ${fmtChange(stock.changePercent)} hoy. Responde en español casual, máximo 80 palabras, sin jerga.`;
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
  const up = stock.changePercent >= 0;
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
              <Text style={[im.pillTxt, { color: up ? C.green : C.red }]}>{up ? '▲' : '▼'} {fmtChange(stock.changePercent)}</Text>
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

// ─── Stock Card (full-screen swipe card) ─────────────────────────────────────

function StockCard({ stock, height, tip, tipLoading, onSaberMas, onInvertir }) {
  const up = stock.changePercent >= 0;
  const indStyle = tip ? (INDICATOR_STYLES[tip.indicator] ?? INDICATOR_STYLES['🟡']) : null;
  const indLabel = tip ? (INDICATOR_LABELS[tip.indicator] ?? 'Neutral') : null;
  return (
    <View style={{ height }}>
      <LinearGradient
        colors={up ? ['#FFFBF6', '#F0FDF4'] : ['#FFFBF6', '#FFF1F2']}
        style={card.container}
      >
        {/* Ticker + name */}
        <View style={card.top}>
          <Text style={card.ticker}>{stock.symbol}</Text>
          <Text style={card.name} numberOfLines={2}>{stock.name}</Text>
          {stock.exchange ? (
            <View style={card.badge}><Text style={card.badgeTxt}>{stock.exchange}</Text></View>
          ) : null}
        </View>

        {/* Price + change */}
        <View style={card.priceRow}>
          <Text style={card.price}>{fmtPrice(stock.price)}</Text>
          <View style={[card.changePill, { backgroundColor: up ? C.greenBg : C.redBg }]}>
            <Text style={[card.changeTxt, { color: up ? C.green : C.red }]}>
              {up ? '▲' : '▼'} {fmtChange(stock.changePercent)}
            </Text>
          </View>
        </View>

        {/* AI tip */}
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

        {/* Buttons */}
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

// ─── Search result row ────────────────────────────────────────────────────────

function SearchRow({ item }) {
  const up = Number(item.changesPercentage ?? 0) >= 0;
  return (
    <View style={s.resultRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.resultTicker}>{item.symbol}</Text>
        <Text style={s.resultName} numberOfLines={1}>{item.name}</Text>
        {item.stockExchange ? <Text style={s.resultExchange}>{item.stockExchange}</Text> : null}
      </View>
      {item.price != null && (
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.resultPrice}>{fmtPrice(item.price)}</Text>
          {item.changesPercentage != null && (
            <Text style={[s.resultChange, { color: up ? C.green : C.red }]}>{fmtChange(item.changesPercentage)}</Text>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DiscoverScreen() {
  const { balance, investedAmount, addToPortfolio } = useApp();
  const { height: windowHeight } = useWindowDimensions();
  const freeBalance = balance - investedAmount;

  // Feed
  const [stocks, setStocks]           = useState([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError]     = useState(null);
  const stocksRef = useRef([]);

  // AI tips — use refs as guards, state for display
  const [tips, setTips]               = useState({});
  const [tipLoading, setTipLoading]   = useState({});
  const generatingRef = useRef(new Set());

  // Card height
  const [cardHeight, setCardHeight] = useState(windowHeight - 160);

  // Search
  const [query, setQuery]                 = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef(null);

  // Modals & toasts
  const [chatStock, setChatStock]       = useState(null);
  const [investStock, setInvestStock]   = useState(null);
  const [toast, setToast]               = useState(null);

  // ── Fetch feed ──────────────────────────────────────────────────────────────
  const fetchFeed = useCallback(async () => {
    try {
      const [a, g] = await Promise.all([
        fmpGet('/most-actives',    { stable: true }),
        fmpGet('/biggest-gainers', { stable: true }),
      ]);
      const combined = buildFeed(a, g);
      setStocks(combined);
      stocksRef.current = combined;
      setFeedError(null);
    } catch (err) {
      console.error('[FMP] feed failed:', err.message);
      setFeedError('No se pudo cargar el mercado.');
    } finally {
      setFeedLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
    const t = setInterval(fetchFeed, REFRESH_MS);
    return () => clearInterval(t);
  }, [fetchFeed]);

  // ── Generate AI tip ─────────────────────────────────────────────────────────
  const ensureTip = useCallback(async (stock) => {
    const { symbol, name, price, changePercent } = stock;
    if (generatingRef.current.has(symbol)) return;
    generatingRef.current.add(symbol);
    setTipLoading((p) => ({ ...p, [symbol]: true }));
    try {
      const { indicator, tip: text } = await generateTip(symbol, name, price, changePercent);
      setTips((p) => ({ ...p, [symbol]: { indicator, text } }));
    } catch (err) {
      console.error('[Claude] tip failed for', symbol, ':', err.message);
      generatingRef.current.delete(symbol); // allow retry
    } finally {
      setTipLoading((p) => ({ ...p, [symbol]: false }));
    }
  }, []);

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    viewableItems.forEach(({ item, index }) => {
      ensureTip(item);
      const next = stocksRef.current[index + 1];
      if (next) ensureTip(next); // pre-fetch next card
    });
  }, [ensureTip]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 });

  // ── Debounced search ────────────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fmpGet(`/search?query=${encodeURIComponent(q)}`);
        setSearchResults(Array.isArray(res) ? res.slice(0, 25) : []);
      } catch (err) {
        console.error('[FMP] search failed:', err.message);
      } finally {
        setSearchLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // ── Invest ──────────────────────────────────────────────────────────────────
  const handleInvest = (amount) => {
    addToPortfolio({ ...investStock, recommended: amount });
    const sym = investStock.symbol;
    setInvestStock(null);
    setToast(`✅ ${amount}€ invertidos en ${sym}`);
    setTimeout(() => setToast(null), 3000);
  };

  const isSearching = query.trim().length > 0;

  return (
    <View style={s.container}>
      <SafeAreaView style={{ flex: 1 }}>

        {/* Search bar */}
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

        {/* Toast */}
        {toast && <View style={s.toast}><Text style={s.toastTxt}>{toast}</Text></View>}

        {/* Body */}
        {isSearching ? (
          /* ── Search results ── */
          <View style={{ flex: 1 }}>
            {searchLoading
              ? <ActivityIndicator style={{ marginTop: 40 }} color={C.orange} />
              : <FlatList
                  data={searchResults}
                  keyExtractor={(item, i) => `${item.symbol}-${i}`}
                  contentContainerStyle={s.searchList}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => <SearchRow item={item} />}
                  ItemSeparatorComponent={() => <View style={s.separator} />}
                  ListEmptyComponent={<Text style={s.emptyTxt}>Sin resultados para "{query}"</Text>}
                />
            }
          </View>

        ) : feedLoading ? (
          /* ── Loading ── */
          <View style={s.center}>
            <ActivityIndicator color={C.orange} size="large" />
            <Text style={s.loadingTxt}>Cargando mercado…</Text>
          </View>

        ) : feedError ? (
          /* ── Error ── */
          <View style={s.center}>
            <Text style={s.errorTxt}>{feedError}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={fetchFeed} activeOpacity={0.8}>
              <Text style={s.retryTxt}>Reintentar</Text>
            </TouchableOpacity>
          </View>

        ) : (
          /* ── TikTok feed ── */
          <View
            style={{ flex: 1 }}
            onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
          >
            {cardHeight > 0 && (
              <FlatList
                data={stocks}
                keyExtractor={(item) => item.symbol}
                pagingEnabled
                showsVerticalScrollIndicator={false}
                decelerationRate="fast"
                snapToInterval={cardHeight}
                snapToAlignment="start"
                getItemLayout={(_, index) => ({ length: cardHeight, offset: cardHeight * index, index })}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig.current}
                renderItem={({ item }) => (
                  <StockCard
                    stock={item}
                    height={cardHeight}
                    tip={tips[item.symbol]}
                    tipLoading={tipLoading[item.symbol]}
                    onSaberMas={() => setChatStock(item)}
                    onInvertir={() => setInvestStock(item)}
                  />
                )}
              />
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

// Stock card
const card = StyleSheet.create({
  container: {
    flex: 1, paddingHorizontal: 28, paddingTop: 32, paddingBottom: 28,
    justifyContent: 'space-between',
  },
  top: { gap: 6 },
  ticker: { fontSize: 60, fontFamily: F.xbold, color: C.text, letterSpacing: -3, lineHeight: 64 },
  name:   { fontSize: 17, fontFamily: F.medium, color: C.sub },
  badge:  { alignSelf: 'flex-start', backgroundColor: C.border, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8 },
  badgeTxt: { fontSize: 11, fontFamily: F.semibold, color: C.muted, letterSpacing: 0.5 },
  priceRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  price:     { fontSize: 34, fontFamily: F.bold, color: C.text, letterSpacing: -1 },
  changePill: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20 },
  changeTxt:  { fontSize: 15, fontFamily: F.bold },
  tipCard: {
    backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: C.border,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    minHeight: 80, justifyContent: 'center',
  },
  tipRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tipLoading: { fontSize: 13, fontFamily: F.regular, color: C.muted },
  tipHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  tipLabel:   { fontSize: 11, fontFamily: F.semibold, color: C.orange, letterSpacing: 0.5 },
  indicatorPill: { borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1 },
  indicatorTxt:  { fontSize: 12, fontFamily: F.semibold },
  tipText:    { fontSize: 15, fontFamily: F.regular, color: C.text, lineHeight: 23 },
  tipEmpty:   { fontSize: 14, fontFamily: F.regular, color: C.muted, textAlign: 'center', lineHeight: 22 },
  swipeHint:  { fontSize: 12, fontFamily: F.regular, color: C.muted, textAlign: 'center' },
  buttons:    { flexDirection: 'row', gap: 12 },
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

// Chat modal
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
  bubbleBot: { alignSelf: 'flex-start', backgroundColor: C.bgAlt, borderRadius: 16, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: C.border, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 8, maxWidth: '82%' },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: C.orange, borderRadius: 16, borderBottomRightRadius: 4, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 8, maxWidth: '82%' },
  bubbleTxt: { fontSize: 14, lineHeight: 21, fontFamily: F.regular },
  bubbleTxtBot:  { color: C.text },
  bubbleTxtUser: { color: '#FFF' },
  typing:    { fontSize: 10, color: C.muted, fontFamily: F.medium, letterSpacing: 4 },
  inputRow:  {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: C.border, gap: 10,
  },
  input: {
    flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, fontFamily: F.regular, color: C.text,
  },
  sendBtn:  { backgroundColor: C.orange, width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sendTxt:  { fontSize: 18, color: '#FFF', fontFamily: F.bold },
});

// Invest modal
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

// Screen
const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.bg },
  searchWrapper: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginTop: 12, marginBottom: 8,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  searchIcon:  { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: F.regular, color: C.text },
  clearBtn:    { fontSize: 13, color: C.muted, paddingLeft: 8 },
  toast: {
    marginHorizontal: 20, marginBottom: 8, backgroundColor: C.text,
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center',
  },
  toastTxt:    { fontSize: 13, fontFamily: F.semibold, color: '#FFF' },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  loadingTxt:  { fontSize: 14, fontFamily: F.regular, color: C.muted, marginTop: 16 },
  errorTxt:    { fontSize: 15, fontFamily: F.medium, color: C.sub, textAlign: 'center', marginBottom: 20 },
  retryBtn:    { backgroundColor: C.orange, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 32 },
  retryTxt:    { fontSize: 14, fontFamily: F.semibold, color: '#FFF' },
  searchList:  { paddingHorizontal: 20, paddingTop: 4 },
  resultRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  resultTicker:  { fontSize: 15, fontFamily: F.bold, color: C.text },
  resultName:    { fontSize: 13, fontFamily: F.regular, color: C.sub, marginTop: 1 },
  resultExchange:{ fontSize: 11, fontFamily: F.regular, color: C.muted, marginTop: 2 },
  resultPrice:   { fontSize: 14, fontFamily: F.semibold, color: C.text },
  resultChange:  { fontSize: 12, fontFamily: F.medium, marginTop: 2 },
  separator:     { height: 1, backgroundColor: C.border },
  emptyTxt:      { textAlign: 'center', marginTop: 48, fontSize: 14, fontFamily: F.regular, color: C.muted, paddingHorizontal: 32 },
});
