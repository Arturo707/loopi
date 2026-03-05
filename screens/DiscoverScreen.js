import React, { useState, useRef, useCallback, useEffect } from 'react';
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

// ─── Static stock data ────────────────────────────────────────────────────────

const STOCKS = [
  // ETFs
  { symbol: 'SPY',  name: 'S&P 500 ETF',          price: 523,   changePercent:  0.5, exchange: 'ETF',    type: 'ETF' },
  { symbol: 'QQQ',  name: 'Nasdaq 100 ETF',        price: 448,   changePercent:  0.7, exchange: 'ETF',    type: 'ETF' },
  { symbol: 'VTI',  name: 'Total Market ETF',      price: 247,   changePercent:  0.4, exchange: 'ETF',    type: 'ETF' },
  { symbol: 'IWDA', name: 'iShares World ETF',     price: 98,    changePercent:  0.3, exchange: 'ETF',    type: 'ETF' },
  { symbol: 'EIMI', name: 'iShares EM IMI ETF',    price: 34,    changePercent:  0.6, exchange: 'ETF',    type: 'ETF' },
  { symbol: 'VWCE', name: 'Vanguard All-World ETF',price: 118,   changePercent:  0.4, exchange: 'ETF',    type: 'ETF' },
  { symbol: 'CSPX', name: 'iShares S&P 500 ETF',  price: 534,   changePercent:  0.5, exchange: 'ETF',    type: 'ETF' },
  { symbol: 'EXS1', name: 'DAX ETF',              price: 158,   changePercent:  0.8, exchange: 'ETF',    type: 'ETF' },
  { symbol: 'GLD',  name: 'Gold ETF',              price: 225,   changePercent:  0.6, exchange: 'ETF',    type: 'ETF' },
  { symbol: 'AGGH', name: 'Global Bonds ETF',      price: 52,    changePercent:  0.1, exchange: 'ETF',    type: 'ETF' },
  // Stocks
  { symbol: 'NVDA', name: 'NVIDIA',               price: 881,   changePercent:  2.1, exchange: 'NASDAQ', type: 'STOCK' },
  { symbol: 'AAPL', name: 'Apple',                price: 228,   changePercent:  0.8, exchange: 'NASDAQ', type: 'STOCK' },
  { symbol: 'TSLA', name: 'Tesla',                price: 175,   changePercent: -1.2, exchange: 'NASDAQ', type: 'STOCK' },
  { symbol: 'MSFT', name: 'Microsoft',            price: 415,   changePercent:  0.5, exchange: 'NASDAQ', type: 'STOCK' },
  { symbol: 'AMZN', name: 'Amazon',               price: 198,   changePercent:  1.3, exchange: 'NASDAQ', type: 'STOCK' },
  { symbol: 'META', name: 'Meta',                 price: 589,   changePercent:  3.2, exchange: 'NASDAQ', type: 'STOCK' },
  { symbol: 'GOOG', name: 'Alphabet',             price: 175,   changePercent:  0.9, exchange: 'NASDAQ', type: 'STOCK' },
  { symbol: 'IAG',  name: 'Iberia',               price: 2.41,  changePercent:  1.8, exchange: 'BME',    type: 'STOCK' },
  { symbol: 'SAN',  name: 'Santander',            price: 4.82,  changePercent:  0.4, exchange: 'BME',    type: 'STOCK' },
  { symbol: 'ITX',  name: 'Inditex',              price: 52.30, changePercent:  1.1, exchange: 'BME',    type: 'STOCK' },
  { symbol: 'GOLD', name: 'Oro',                  price: 2340,  changePercent:  0.6, exchange: 'CMDTY',  type: 'COMMODITY' },
  { symbol: 'BTC',  name: 'Bitcoin',              price: 87500, changePercent:  2.4, exchange: 'CRYPTO', type: 'CRYPTO' },
];

const RISK_FILTERS = {
  Conservador: (s) => s.type === 'ETF',
  Moderado:    (s) => s.type === 'ETF' || (s.type !== 'CRYPTO' && Math.abs(s.changePercent) <= 3),
  Atrevido:    () => true,
};

// ─── Anthropic chat ───────────────────────────────────────────────────────────

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

// EXPO_PUBLIC_API_URL must be set to the absolute Vercel URL when running on native
// (e.g. https://your-project.vercel.app). On web it falls back to the current origin.
const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  (typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : '');
const TIP_API = `${API_BASE}/api/generate-tip`;

async function generateTip(symbol, name, price, changePct, userProfile) {
  const res = await fetch(TIP_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      symbol, name, price: Number(price), changePct: Number(changePct),
      ...(userProfile || {}),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Tip API failed');
  return data;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

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
  const [msgs, setMsgs]     = useState([]);
  const [input, setInput]   = useState('');
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

// ─── Stock Card ───────────────────────────────────────────────────────────────

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
        <View style={card.top}>
          <Text style={card.ticker}>{stock.symbol}</Text>
          <Text style={card.name} numberOfLines={2}>{stock.name}</Text>
          {stock.exchange ? (
            <View style={card.badge}><Text style={card.badgeTxt}>{stock.exchange}</Text></View>
          ) : null}
        </View>

        <View style={card.priceRow}>
          <Text style={card.price}>{fmtPrice(stock.price)}</Text>
          <View style={[card.changePill, { backgroundColor: up ? C.greenBg : C.redBg }]}>
            <Text style={[card.changeTxt, { color: up ? C.green : C.red }]}>
              {up ? '▲' : '▼'} {fmtChange(stock.changePercent)}
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
  const freeBalance = balance - investedAmount;

  // Filter static feed by risk profile
  const filterFn = RISK_FILTERS[riskProfile] ?? RISK_FILTERS.Moderado;
  const feed = STOCKS.filter(filterFn);

  const stocksRef = useRef(feed);
  useEffect(() => { stocksRef.current = feed; }, [riskProfile]);

  // Card height
  const [cardHeight, setCardHeight] = useState(windowHeight - 160);

  // Local search — filters STOCKS array, no API calls
  const [query, setQuery] = useState('');
  const searchResults = query.trim()
    ? STOCKS.filter((s) => {
        const q = query.trim().toLowerCase();
        return s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
      })
    : [];

  // AI tips
  const [tips, setTips]             = useState({});
  const [tipLoading, setTipLoading] = useState({});
  const generatingRef = useRef(new Set());

  const userProfileRef = useRef({});
  useEffect(() => {
    userProfileRef.current = { age, incomeRange, experience };
  }, [age, incomeRange, experience]);

  const ensureTip = useCallback(async (stock) => {
    const { symbol, name, price, changePercent } = stock;
    if (generatingRef.current.has(symbol)) return;
    generatingRef.current.add(symbol);
    setTipLoading((p) => ({ ...p, [symbol]: true }));
    try {
      const { indicator, tip: text } = await generateTip(symbol, name, price, changePercent, userProfileRef.current);
      setTips((p) => ({ ...p, [symbol]: { indicator, text } }));
    } catch (err) {
      console.error('[Claude] tip failed for', symbol, ':', err.message);
      generatingRef.current.delete(symbol);
    } finally {
      setTipLoading((p) => ({ ...p, [symbol]: false }));
    }
  }, []);

  // Seed tips for the first two cards on mount — onViewableItemsChanged doesn't fire on initial render
  useEffect(() => {
    if (feed.length > 0) ensureTip(feed[0]);
    if (feed.length > 1) ensureTip(feed[1]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    viewableItems.forEach(({ item, index }) => {
      ensureTip(item);
      const next = stocksRef.current[index + 1];
      if (next) ensureTip(next);
    });
  }, [ensureTip]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 });

  // Modals & toasts
  const [chatStock, setChatStock]     = useState(null);
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

        {isSearching ? (
          /* ── Local search results ── */
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.symbol}
            contentContainerStyle={s.searchList}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const up = item.changePercent >= 0;
              return (
                <View style={s.resultRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.resultTicker}>{item.symbol}</Text>
                    <Text style={s.resultName} numberOfLines={1}>{item.name}</Text>
                    {item.exchange ? <Text style={s.resultExchange}>{item.exchange}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.resultPrice}>{fmtPrice(item.price)}</Text>
                    <Text style={[s.resultChange, { color: up ? C.green : C.red }]}>{fmtChange(item.changePercent)}</Text>
                  </View>
                </View>
              );
            }}
            ItemSeparatorComponent={() => <View style={s.separator} />}
            ListEmptyComponent={<Text style={s.emptyTxt}>Sin resultados para "{query}"</Text>}
          />
        ) : (
          /* ── Stock card feed ── */
          <View
            style={{ flex: 1 }}
            onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
          >
            {cardHeight > 0 && (
              <FlatList
                data={feed}
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
  toastTxt:      { fontSize: 13, fontFamily: F.semibold, color: '#FFF' },
  searchList:    { paddingHorizontal: 20, paddingTop: 4 },
  resultRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  resultTicker:  { fontSize: 15, fontFamily: F.bold, color: C.text },
  resultName:    { fontSize: 13, fontFamily: F.regular, color: C.sub, marginTop: 1 },
  resultExchange:{ fontSize: 11, fontFamily: F.regular, color: C.muted, marginTop: 2 },
  resultPrice:   { fontSize: 14, fontFamily: F.semibold, color: C.text },
  resultChange:  { fontSize: 12, fontFamily: F.medium, marginTop: 2 },
  separator:     { height: 1, backgroundColor: C.border },
  emptyTxt:      { textAlign: 'center', marginTop: 48, fontSize: 14, fontFamily: F.regular, color: C.muted, paddingHorizontal: 32 },
});
