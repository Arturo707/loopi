import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Image,
  ScrollView, Animated, Modal, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useWatchlist } from '../context/WatchlistContext';
import { C } from '../constants/colors';
import { F } from '../constants/fonts';
import InvestScreen from './InvestScreen';
import { authFetch } from '../utils/authFetch';
import { ViewShot, captureCard } from '../utils/viewShot';
import { shareFile } from '../utils/shareFile';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { isUsMarketOpen } from '../lib/market-hours';

// ─── API endpoints ────────────────────────────────────────────────────────────

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  (typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : '');
const FEED_API  = `${API_BASE}/api/market-feed`;
const RANK_API  = `${API_BASE}/api/rank-feed`;
const SCORE_API = `${API_BASE}/api/loopi-score`;

// ─── Hardcoded fallback (last resort if API + Firestore both fail) ────────────

const FALLBACK_STOCKS = [
  { symbol: 'NVDA',  name: 'NVIDIA Corporation', price: 881,   changesPercentage:  2.1, type: 'stock' },
  { symbol: 'AAPL',  name: 'Apple Inc.',          price: 228,   changesPercentage:  0.8, type: 'stock' },
  { symbol: 'TSLA',  name: 'Tesla Inc.',           price: 175,   changesPercentage: -1.2, type: 'stock' },
  { symbol: 'MSFT',  name: 'Microsoft Corp.',      price: 415,   changesPercentage:  0.5, type: 'stock' },
  { symbol: 'AMZN',  name: 'Amazon.com Inc.',      price: 198,   changesPercentage:  1.3, type: 'stock' },
  { symbol: 'META',  name: 'Meta Platforms Inc.',  price: 589,   changesPercentage:  3.2, type: 'stock' },
  { symbol: 'GOOG',  name: 'Alphabet Inc.',        price: 175,   changesPercentage:  0.9, type: 'stock' },
  { symbol: 'PLTR',  name: 'Palantir Technologies',price: 22,    changesPercentage:  1.5, type: 'stock' },
  { symbol: 'IBIT',  name: 'iShares Bitcoin ETF',  price: 38,    changesPercentage:  2.4, type: 'etf'   },
  { symbol: 'SPY',   name: 'SPDR S&P 500 ETF',     price: 540,   changesPercentage:  0.3, type: 'etf'   },
];

// ─── Brand / band constants ───────────────────────────────────────────────────

const BAND_COLORS = {
  fafo:     '#F26A28',  // orange
  watching: '#E9A84B',  // honey/amber
  mid:      '#9A8878',  // muted gray
  cooked:   '#1C1612',  // near-black
};

const BAND_EMOJIS = {
  fafo: '🔥', watching: '👀', mid: '😐', cooked: '💀',
};

// Client-side familiarity — mirror of server FAMILIARITY table. Used as a
// last-resort so cards never render an empty score even when /api/market-feed
// is unreachable and we fall through to FALLBACK_STOCKS.
const CLIENT_FAMILIARITY = {
  AAPL: 95, TSLA: 90, NVDA: 90, AMZN: 88, META: 85, GOOGL: 85, GOOG: 85, MSFT: 85,
  GME: 85, NFLX: 80, AMD: 80, COIN: 75, PLTR: 70, SPY: 70, RIVN: 65,
  SOFI: 60, QQQ: 65, IBIT: 60, GLD: 55, JPM: 55, V: 55, WMT: 55,
};

function getBandClient(score) {
  if (score >= 85) return 'fafo';
  if (score >= 65) return 'watching';
  if (score >= 40) return 'mid';
  return 'cooked';
}

function computeClientSyntheticScore(stock) {
  const pct = Number(stock.changesPercentage ?? 0);
  const priceScore = Math.round(Math.min(Math.max((pct + 10) / 20 * 100, 0), 100));
  const familiarity = CLIENT_FAMILIARITY[stock.symbol] ?? 40;
  const score = Math.round(priceScore * 0.6 + familiarity * 0.4);
  const band = getBandClient(score);
  const absPct = Math.abs(pct);
  const fmtPct = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  const vibeByBand = {
    fafo:     `${stock.symbol} is ripping — ${fmtPct} today. Momentum is real.`,
    watching: `${stock.symbol} moving ${fmtPct} with real interest behind it. Worth a look.`,
    mid:      absPct < 1
      ? `${stock.symbol} is basically flat at ${fmtPct}. Quiet day for it.`
      : `${stock.symbol} is ${fmtPct} today. Nothing dramatic — just another session.`,
    cooked:   `${stock.symbol} down ${absPct.toFixed(1)}% today. Bag holders, hang in there.`,
  };
  return {
    ticker: stock.symbol,
    score,
    band,
    momentum: priceScore,
    familiarity,
    vibeCheck: vibeByBand[band],
    synthetic: true,
  };
}

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

// ─── Share caption generator ──────────────────────────────────────────────────

function getCaption(stock, scoreData) {
  if (!scoreData) return `Check out ${stock.symbol} on @loopi — loopi.company`;
  const { band, score } = scoreData;
  const t = stock.symbol;
  switch (band) {
    case 'fafo':     return `this stock is fafo territory rn 🔥 ${t} scored ${score}/100 on @loopi — check the vibe before you invest loopi.company`;
    case 'watching': return `keeping an eye on ${t} 👀 scored ${score}/100 on @loopi vibecheck loopi.company`;
    case 'mid':      return `mid behavior from ${t} 😐 ${score}/100 on @loopi loopi.company`;
    case 'cooked':   return `${t} is cooked 💀 ${score}/100 on @loopi don't say we didn't warn you loopi.company`;
    default:         return `${t} scored ${score}/100 on @loopi — loopi.company`;
  }
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
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
    <Animated.View style={[sk.card, { opacity: anim }]}>
      <View style={sk.headerRow}>
        <View style={sk.iconBar} />
        <View style={sk.titleCol}>
          <View style={sk.tickerBar} />
          <View style={sk.nameBar} />
        </View>
        <View style={sk.priceCol}>
          <View style={sk.priceBar} />
          <View style={sk.changeBar} />
        </View>
      </View>
      <View style={sk.scoreRow}>
        <View style={sk.scoreBar} />
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

// ─── Tip skeleton ─────────────────────────────────────────────────────────────

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
      <View style={{ height: 12, width: '100%', backgroundColor: C.border, borderRadius: 5, marginBottom: 6 }} />
      <View style={{ height: 12, width: '75%',  backgroundColor: C.border, borderRadius: 5 }} />
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

        <View style={cm.header}>
          <TouchableOpacity onPress={onClose} style={cm.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={cm.backTxt}>←</Text>
          </TouchableOpacity>
          <View style={cm.headerInfo}>
            <Text style={cm.symbol}>{stock.symbol}</Text>
            <Text style={cm.stockName} numberOfLines={1}>{stock.name}</Text>
          </View>
        </View>

        <View style={cm.priceRow}>
          <Text style={cm.price}>{fmtPrice(stock.price)}</Text>
          <View style={[cm.changePill, { backgroundColor: up ? '#F0FDF4' : '#FFF1F2' }]}>
            <Text style={[cm.changeTxt, { color: up ? C.changePos : C.changeNeg }]}>
              {up ? '▲' : '▼'} {fmtChange(stock.changesPercentage)}
            </Text>
          </View>
          <View style={cm.typeBadge}>
            <Text style={cm.typeBadgeTxt}>{stock.type === 'etf' ? 'ETF' : 'STOCK'}</Text>
          </View>
        </View>

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

// ─── Off-screen Share Card (captured by ViewShot) ─────────────────────────────

const ShareCard = React.forwardRef(function ShareCard({ stock, scoreData, tip }, ref) {
  if (!stock) return null;
  const band       = scoreData?.band;
  const scoreColor = BAND_COLORS[band] ?? '#9A8878';
  const bandEmoji  = BAND_EMOJIS[band] ?? '';
  const up         = stock.changesPercentage >= 0;
  const vibeText   = scoreData?.vibeCheck || tip?.text || '';

  return (
    <ViewShot ref={ref} options={{ format: 'png', quality: 1 }} style={sh.card}>
      {/* Pencil-stroke border (rendered as inset shadow via borderWidth) */}

      {/* Wordmark */}
      <Text style={sh.wordmark}>Loopi</Text>

      {/* Ticker + company */}
      <View style={sh.stockInfo}>
        <Text style={sh.ticker}>{stock.symbol}</Text>
        <Text style={sh.company} numberOfLines={1}>{stock.name}</Text>
      </View>

      {/* Score */}
      {scoreData && (
        <View style={sh.scoreBlock}>
          <Text style={[sh.score, { color: scoreColor }]}>{scoreData.score}</Text>
          <View style={[sh.bandPill, { backgroundColor: scoreColor }]}>
            <Text style={sh.bandPillTxt}>{bandEmoji} {band}</Text>
          </View>
        </View>
      )}

      {/* Vibe check */}
      {!!vibeText && (
        <Text style={sh.vibe} numberOfLines={2}>"{vibeText}"</Text>
      )}

      {/* Price */}
      <View style={sh.priceRow}>
        <Text style={sh.price}>{fmtPrice(stock.price)}</Text>
        <Text style={[sh.change, { color: up ? '#B45309' : '#B91C1C' }]}>
          {fmtChange(stock.changesPercentage)}
        </Text>
      </View>

      {/* Domain */}
      <Text style={sh.domain}>loopi.company</Text>
    </ViewShot>
  );
});

// ─── Icon colour — deterministic from ticker ──────────────────────────────────

const ICON_PALETTE = ['#E74C3C','#E67E22','#27AE60','#2980B9','#8E44AD','#16A085','#D35400','#C0392B','#2471A3','#1E8449'];
function getIconColor(symbol) {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = ((h << 5) - h) + symbol.charCodeAt(i) | 0;
  return ICON_PALETTE[Math.abs(h) % ICON_PALETTE.length];
}

// ─── Company Logo — real logo with letter fallback ────────────────────────────

function CompanyLogo({ symbol }) {
  const [failed, setFailed] = useState(false);
  const color   = getIconColor(symbol);
  const letters = symbol.slice(0, 2);
  const url     = `https://financialmodelingprep.com/image-stock/${symbol}.png`;

  if (failed) {
    return (
      <View style={[card.icon, { backgroundColor: color }]}>
        <Text style={card.iconTxt}>{letters}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: url }}
      style={card.logoImg}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
}

// ─── Live data pulse — green dot when market open, grey when closed ──────────

// status: 'live' (green pulse) | 'delayed' (amber pulse) | 'closed' (grey)
function LivePulse({ status }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const animated = status === 'live' || status === 'delayed';
  useEffect(() => {
    if (!animated) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [animated]);

  const color =
    status === 'live'    ? '#10B981' :
    status === 'delayed' ? '#E9A84B' :
                           C.muted;
  const label =
    status === 'live'    ? 'LIVE'    :
    status === 'delayed' ? 'DELAYED' :
                           'CLOSED';
  return (
    <View style={live.row}>
      <Animated.View style={[live.dot, { backgroundColor: color, opacity: animated ? pulse : 0.5 }]} />
      <Text style={[live.txt, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Animated score — counts up to target on first reveal ────────────────────

function AnimatedScore({ value, color }) {
  const anim = useRef(new Animated.Value(0)).current;
  const lastValue = useRef(null);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (typeof value !== 'number') return;
    const prev = lastValue.current;
    if (prev === value) return;
    // First reveal → count up from 0. Subsequent upgrade (synthetic → full) → tween from prev.
    const from = prev == null ? 0 : prev;
    lastValue.current = value;
    anim.setValue(0);
    const listener = anim.addListener(({ value: t }) => {
      setDisplay(Math.round(from + (value - from) * t));
    });
    Animated.timing(anim, {
      toValue: 1,
      duration: prev == null ? 600 : 400,
      useNativeDriver: false,
    }).start();
    return () => { anim.removeListener(listener); };
  }, [value]);

  return <Text style={[card.scoreNum, { color }]}>{display}</Text>;
}

// ─── Bookmark button — scale-pop animation on toggle ─────────────────────────

function BookmarkButton({ saved, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.4, duration: 140, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }),
    ]).start();
    onPress?.();
  };
  return (
    <TouchableOpacity
      style={card.bookmarkBtn}
      onPress={handlePress}
      activeOpacity={0.7}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons
          name={saved ? 'bookmark' : 'bookmark-outline'}
          size={18}
          color={saved ? C.orange : C.muted}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Stock Card ───────────────────────────────────────────────────────────────

function StockCard({ stock, tip, tipLoading, onSaberMas, onInvertir, loopiScore, onShare, saved, onToggleSave }) {
  const up           = stock.changesPercentage >= 0;
  const scoreData    = loopiScore && loopiScore !== 'loading' ? loopiScore : null;
  const band         = scoreData?.band;
  const scoreColor   = band ? (BAND_COLORS[band] ?? C.muted) : C.muted;
  const bandEmoji    = band ? (BAND_EMOJIS[band] ?? '') : '';
  const vibeText     = scoreData?.vibeCheck || tip?.text || '';
  const scoreLoading = loopiScore === 'loading' || loopiScore === undefined;
  const showVibeLoading = (scoreLoading || tipLoading) && !vibeText;

  return (
    <View style={card.container}>

      {/* Header row — bookmark at the far left (top-left of card content) */}
      <View style={card.headerRow}>
        <View style={card.headerLeft}>
          <BookmarkButton saved={saved} onPress={onToggleSave} />
          <CompanyLogo symbol={stock.symbol} />
          <View style={card.headerMeta}>
            <Text style={card.ticker}>{stock.symbol}</Text>
            <Text style={card.company} numberOfLines={1}>{stock.name}</Text>
          </View>
        </View>
        <View style={card.headerRight}>
          <Text style={card.price}>{fmtPrice(stock.price)}</Text>
          <Text style={[card.changePct, { color: up ? C.changePos : C.changeNeg }]}>
            {fmtChange(stock.changesPercentage)}
          </Text>
        </View>
        <TouchableOpacity style={card.shareBtn} onPress={onShare} activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={card.shareBtnTxt}>📤</Text>
        </TouchableOpacity>
      </View>

      {/* Score row — always shows something */}
      <View style={card.scoreRow}>
        <View style={card.scoreLeft}>
          {scoreData ? (
            <View style={card.scoreNumRow}>
              <AnimatedScore value={scoreData.score} color={scoreColor} />
              <Text style={card.scoreOf}> /100</Text>
            </View>
          ) : scoreLoading ? (
            <View style={card.scoreNumRow}>
              <Text style={[card.scoreNum, { color: C.border }]}>··</Text>
              <Text style={card.scoreOf}> /100</Text>
            </View>
          ) : (
            <View style={card.scoreNumRow}>
              <Text style={[card.scoreNum, { color: C.muted }]}>—</Text>
              <Text style={card.scoreOf}> /100</Text>
            </View>
          )}
        </View>
        {scoreData ? (
          <View style={[card.bandPill, { backgroundColor: scoreColor }]}>
            <Text style={card.bandPillTxt}>{bandEmoji} {band}</Text>
          </View>
        ) : (
          <View style={[card.bandPill, card.bandPillLoading]}>
            <ActivityIndicator size="small" color={C.muted} />
            <Text style={card.bandPillLoadingTxt}>vibes…</Text>
          </View>
        )}
      </View>

      {/* Vibe check — always visible */}
      <View style={card.vibeBox}>
        {vibeText ? (
          <Text style={card.vibeText}>{vibeText}</Text>
        ) : showVibeLoading ? (
          <TipSkeleton />
        ) : (
          <Text style={[card.vibeText, { color: C.muted }]}>
            Tap "Learn more" for the loopi take on {stock.symbol}.
          </Text>
        )}
      </View>

      {/* Action buttons */}
      <View style={card.buttons}>
        <TouchableOpacity style={card.btnSecondary} onPress={onSaberMas} activeOpacity={0.8}>
          <Text style={card.btnSecondaryTxt}>💬 Learn more</Text>
        </TouchableOpacity>
        <TouchableOpacity style={card.btnPrimary} onPress={onInvertir} activeOpacity={0.8}>
          <Text style={card.btnPrimaryTxt}>⚡ Invest</Text>
        </TouchableOpacity>
      </View>

    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DiscoverScreen() {
  const { balance, investedAmount, addToPortfolio, riskProfile, age, incomeRange, experience } = useApp();
  const { isSaved, toggleTicker } = useWatchlist();

  // ── Live feed state ──
  const [allStocks,     setAllStocks]     = useState([]);
  const [marketOpen,    setMarketOpen]    = useState(true);
  const [feedStatus,    setFeedStatus]    = useState('loading');
  const [rankingStatus, setRankingStatus] = useState('idle');
  const [lastUpdated,   setLastUpdated]   = useState(null);
  const [elapsed,       setElapsed]       = useState(0);
  const [loadingMore,   setLoadingMore]   = useState(false);
  const [showingCache,  setShowingCache]  = useState(false); // true when showing Firestore fallback
  const seenSymbols = useRef(new Set());

  // ── AI tips ──
  const [tips, setTips] = useState({});

  // ── Loopi Scores ──
  const loopiScoresRef = useRef({});
  const [loopiScores, setLoopiScores] = useState({});

  const seedScores = useCallback((incoming) => {
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return;
    const patch = {};
    Object.entries(incoming).forEach(([sym, val]) => {
      if (!val || typeof val !== 'object') return;
      const existing = loopiScoresRef.current[sym];
      // Seed if nothing exists, OR upgrade synthetic → full (AI-generated).
      const isUpgrade = existing
        && typeof existing === 'object'
        && existing.synthetic
        && !val.synthetic;
      if (existing === undefined || existing === 'loading' || isUpgrade) {
        loopiScoresRef.current[sym] = val;
        patch[sym] = val;
      }
    });
    if (Object.keys(patch).length > 0) setLoopiScores((prev) => ({ ...prev, ...patch }));
  }, []);

  const fetchLoopiScore = useCallback(async (symbol) => {
    const existing = loopiScoresRef.current[symbol];
    // Skip only if we already have a full (non-synthetic) score, or a fetch is in flight.
    // Synthetic scores should be upgraded to full AI-generated ones.
    if (existing === 'loading') return;
    if (existing && typeof existing === 'object' && !existing.synthetic) return;

    // Keep the synthetic score visible while we fetch — don't blank the UI.
    if (!existing) {
      loopiScoresRef.current[symbol] = 'loading';
      setLoopiScores((prev) => ({ ...prev, [symbol]: 'loading' }));
    }
    try {
      const res  = await authFetch(`${SCORE_API}?ticker=${symbol}`);
      const data = await res.json();
      const result = res.ok ? data : (existing && existing !== 'loading' ? existing : null);
      loopiScoresRef.current[symbol] = result;
      setLoopiScores((prev) => ({ ...prev, [symbol]: result }));
    } catch {
      // Fall back to whatever we had (synthetic) rather than blanking
      const fallback = existing && existing !== 'loading' ? existing : null;
      loopiScoresRef.current[symbol] = fallback;
      setLoopiScores((prev) => ({ ...prev, [symbol]: fallback }));
    }
  }, []);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 });
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }) => { viewableItems.forEach(({ item }) => fetchLoopiScore(item.symbol)); },
    [fetchLoopiScore]
  );

  const rankItems = useCallback(async (items) => {
    setRankingStatus('ranking');
    try {
      const rankRes = await authFetch(RANK_API, {
        method: 'POST',
        body: JSON.stringify({ items, riskProfile, age, incomeRange, experience }),
      });
      if (!rankRes.ok) { setRankingStatus('done'); return; }

      const rankData  = await rankRes.json();
      const symbolMap = Object.fromEntries(items.map((s) => [s.symbol, s]));
      const topItems  = (rankData.top ?? []).map((t) => symbolMap[t.symbol]).filter(Boolean);
      const newTips   = {};
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
      seedScores(rankData.scores);
    } catch {
      // ranking failed — keep raw order
    } finally {
      setRankingStatus('done');
    }
  }, [riskProfile, age, incomeRange, experience, seedScores]);

  // Reads cached feed from Firestore (written by MarketContext) and normalizes it
  const loadFirestoreCache = useCallback(async () => {
    const snap = await Promise.race([
      getDoc(doc(db, 'market', 'feed')),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
    ]);
    if (!snap.exists()) return null;
    const { stocks: saved, updatedAt } = snap.data();
    if (!saved?.length) return null;
    // MarketContext normalizes to changePercent; DiscoverScreen uses changesPercentage
    const items = saved.map((s) => ({
      symbol:            s.symbol,
      name:              s.name,
      price:             Number(s.price ?? 0),
      changesPercentage: Number(s.changesPercentage ?? s.changePercent ?? 0),
      type:              s.type ?? 'stock',
    }));
    const cacheAge = updatedAt?.toMillis ? Date.now() - updatedAt.toMillis() : null;
    return { items, cacheAge };
  }, []);

  const preloadTopScores = useCallback((items) => {
    items.slice(0, 6).forEach((s) => fetchLoopiScore(s.symbol));
  }, [fetchLoopiScore]);

  // Bulletproof: compute and seed client-side synthetic scores for every item.
  // Guarantees each card has a score + band + vibeCheck even if the API
  // returned no scores or we fell through to FALLBACK_STOCKS.
  const seedClientSynthetic = useCallback((items) => {
    const patch = {};
    items.forEach((s) => {
      if (loopiScoresRef.current[s.symbol] !== undefined) return;
      const synth = computeClientSyntheticScore(s);
      loopiScoresRef.current[s.symbol] = synth;
      patch[s.symbol] = synth;
    });
    if (Object.keys(patch).length > 0) {
      setLoopiScores((prev) => ({ ...prev, ...patch }));
    }
  }, []);

  const fetchFeed = useCallback(async () => {
    try {
      const res  = await authFetch(FEED_API);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const items = data.items ?? data;
      setMarketOpen(data.marketOpen ?? true);
      setShowingCache(false);
      seenSymbols.current = new Set(items.map((s) => s.symbol));
      setAllStocks(items);
      setLastUpdated(new Date());
      setFeedStatus('ready');
      seedClientSynthetic(items);  // bulletproof baseline
      seedScores(data.scores);     // upgrade to server synthetic/full
      preloadTopScores(items);
      rankItems(items);
    } catch (err) {
      console.error('[Feed] API failed:', err.message, '— trying Firestore cache');
      // Before showing an error, try the Firestore cache written by MarketContext
      try {
        const cached = await loadFirestoreCache();
        if (cached?.items?.length) {
          setMarketOpen(false);
          setShowingCache(true);
          seenSymbols.current = new Set(cached.items.map((s) => s.symbol));
          setAllStocks(cached.items);
          setLastUpdated(new Date());
          setFeedStatus('ready');
          seedClientSynthetic(cached.items);
          preloadTopScores(cached.items);
          rankItems(cached.items);
          return;
        }
      } catch (cacheErr) {
        console.warn('[Feed] Firestore cache also failed:', cacheErr.message);
      }
      // Last resort: built-in fallback data so users always see something
      console.warn('[Feed] Using built-in fallback stocks');
      setMarketOpen(false);
      setShowingCache(true);
      seenSymbols.current = new Set(FALLBACK_STOCKS.map((s) => s.symbol));
      setAllStocks(FALLBACK_STOCKS);
      setLastUpdated(new Date());
      setFeedStatus('ready');
      seedClientSynthetic(FALLBACK_STOCKS);
      preloadTopScores(FALLBACK_STOCKS);
    }
  }, [rankItems, seedScores, loadFirestoreCache, preloadTopScores, seedClientSynthetic]);

  useEffect(() => {
    fetchFeed();
    const interval = setInterval(fetchFeed, 60_000);
    return () => clearInterval(interval);
  }, [fetchFeed]);

  const fetchMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res      = await authFetch(FEED_API);
      const data     = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const allItems   = data.items ?? data;
      const freshItems = allItems.filter((s) => !seenSymbols.current.has(s.symbol));
      if (freshItems.length === 0) return;

      const rankRes = await authFetch(RANK_API, {
        method: 'POST',
        body: JSON.stringify({ items: freshItems, riskProfile, age, incomeRange, experience }),
      });
      if (!rankRes.ok) return;

      const rankData  = await rankRes.json();
      const symbolMap = Object.fromEntries(freshItems.map((s) => [s.symbol, s]));
      const topItems  = (rankData.top ?? [])
        .map((t) => symbolMap[t.symbol])
        .filter((s) => s && !seenSymbols.current.has(s.symbol));
      const newTips   = {};
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
      seedScores(rankData.scores);
    } catch (err) {
      console.error('[FetchMore] Error:', err.message);
    } finally {
      setLoadingMore(false);
    }
  }, [riskProfile, age, incomeRange, experience, seedScores]);

  useEffect(() => {
    if (!lastUpdated) return;
    setElapsed(0);
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  // ── Share state ──
  const [shareTarget, setShareTarget] = useState(null); // { stock, scoreData, tip }
  const shareCardRef = useRef(null);

  const handleShare = useCallback((stock) => {
    const scoreData = loopiScoresRef.current[stock.symbol];
    const tip       = tips[stock.symbol];
    setShareTarget({
      stock,
      scoreData: scoreData && scoreData !== 'loading' ? scoreData : null,
      tip: tip ?? null,
    });
  }, [tips]);

  useEffect(() => {
    if (!shareTarget) return;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      if (cancelled) return;
      try {
        const caption = getCaption(shareTarget.stock, shareTarget.scoreData);
        const uri     = await captureCard(shareCardRef);
        const shared  = uri ? await shareFile(uri, caption) : false;
        if (!shared) await Share.share({ message: caption });
      } catch {
        try {
          await Share.share({ message: getCaption(shareTarget.stock, shareTarget.scoreData) });
        } catch { /* silent */ }
      } finally {
        if (!cancelled) setShareTarget(null);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [shareTarget]);

  const feed = allStocks;

  // ── Search ──
  const [query, setQuery] = useState('');
  const searchResults = query.trim()
    ? allStocks.filter((s) => {
        const q = query.trim().toLowerCase();
        return s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
      })
    : [];

  // ── Modals & toasts ──
  const [chatStock,    setChatStock]   = useState(null);
  const [investStock,  setInvestStock] = useState(null);
  const [toast,        setToast]       = useState(null);

  const isSearching = query.trim().length > 0;

  return (
    <View style={s.container}>
      {/* Off-screen share card — captured by ViewShot */}
      <View style={s.offscreen} pointerEvents="none">
        <ShareCard ref={shareCardRef} stock={shareTarget?.stock ?? null} scoreData={shareTarget?.scoreData ?? null} tip={shareTarget?.tip ?? null} />
      </View>

      <SafeAreaView style={{ flex: 1 }}>

        {/* Search bar + timestamp */}
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
            <LivePulse
              status={
                !isUsMarketOpen()         ? 'closed'  :
                showingCache              ? 'delayed' :
                                            'live'
              }
            />
          )}
        </View>

        {/* Closed-market banner — only when the clock says closed */}
        {feedStatus === 'ready' && !isUsMarketOpen() && !showingCache && (
          <View style={s.closedBanner}>
            <Text style={s.closedBannerTxt}>🔒 Market closed — showing closing prices</Text>
          </View>
        )}

        {/* Stale-data banner — when market is open but we're on fallback data */}
        {feedStatus === 'ready' && showingCache && isUsMarketOpen() && (
          <View style={s.cacheBanner}>
            <Text style={s.cacheBannerTxt}>⏳ Live feed reconnecting — showing recent snapshot</Text>
          </View>
        )}
        {feedStatus === 'ready' && showingCache && !isUsMarketOpen() && (
          <View style={s.cacheBanner}>
            <Text style={s.cacheBannerTxt}>📦 Showing last session's data — refresh when market opens</Text>
          </View>
        )}

        {/* Personalizing banner */}
        {feedStatus === 'ready' && rankingStatus === 'ranking' && !isSearching && (
          <View style={s.personalizingBanner}>
            <ActivityIndicator size="small" color={C.orange} style={{ marginRight: 8 }} />
            <Text style={s.personalizingTxt}>Personalizing your feed…</Text>
          </View>
        )}

        {/* Toast */}
        {toast && <View style={s.toast}><Text style={s.toastTxt}>{toast}</Text></View>}

        {isSearching ? (
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
                    <Text style={[s.resultChange, { color: up ? C.changePos : C.changeNeg }]}>{fmtChange(item.changesPercentage)}</Text>
                  </View>
                </View>
              );
            }}
            ItemSeparatorComponent={() => <View style={s.separator} />}
            ListEmptyComponent={<Text style={s.emptyTxt}>No results for "{query}"</Text>}
          />
        ) : feedStatus === 'loading' ? (
          <View style={{ flex: 1 }}>
            {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
          </View>
        ) : feedStatus === 'error' ? (
          <View style={s.errorContainer}>
            <Text style={s.errorEmoji}>⚠️</Text>
            <Text style={s.errorTitle}>Could not load market data</Text>
            <Text style={s.errorSub}>Check your connection and try again.</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => { setFeedStatus('loading'); fetchFeed(); }} activeOpacity={0.8}>
              <Text style={s.retryTxt}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            {feed.length > 0 ? (
              <FlatList
                data={feed}
                keyExtractor={(item) => item.symbol}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={s.feedList}
                extraData={{ tips, loopiScores }}
                onEndReached={() => { if (!loadingMore) fetchMore(); }}
                onEndReachedThreshold={0.4}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig.current}
                ListFooterComponent={loadingMore ? (
                  <View style={s.loadingMoreRow}>
                    <ActivityIndicator size="small" color={C.orange} />
                    <Text style={s.loadingMoreTxt}>Vibe check... loading more</Text>
                  </View>
                ) : null}
                renderItem={({ item }) => (
                  <StockCard
                    stock={item}
                    tip={tips[item.symbol]}
                    tipLoading={rankingStatus === 'ranking' && !tips[item.symbol]}
                    onSaberMas={() => setChatStock(item)}
                    onInvertir={() => setInvestStock(item)}
                    loopiScore={loopiScores[item.symbol]}
                    onShare={() => handleShare(item)}
                    saved={isSaved(item.symbol)}
                    onToggleSave={() => toggleTicker(item, loopiScores[item.symbol])}
                  />
                )}
              />
            ) : feedStatus === 'ready' ? (
              <View style={s.errorContainer}>
                <Text style={s.errorEmoji}>📭</Text>
                <Text style={s.errorTitle}>No results for your profile</Text>
                <Text style={s.errorSub}>Change your risk profile to see more.</Text>
              </View>
            ) : null}
          </View>
        )}

        <Text style={s.disclaimer}>Not investment advice. For informational purposes only.</Text>

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

// Pencil-card shadow shared style
const inkShadow = {
  shadowColor: '#1C1612',
  shadowOffset: { width: 2, height: 2 },
  shadowOpacity: 1,
  shadowRadius: 0,
  elevation: 4,
};

const sk = StyleSheet.create({
  card: {
    marginHorizontal: 16, marginBottom: 12, borderRadius: 18,
    backgroundColor: C.card, padding: 16, gap: 10,
    borderWidth: 1.5, borderColor: C.border,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBar:   { width: 38, height: 38, borderRadius: 10, backgroundColor: C.border },
  titleCol:  { flex: 1, gap: 5 },
  tickerBar: { height: 14, width: 60,  backgroundColor: C.border, borderRadius: 5 },
  nameBar:   { height: 11, width: 110, backgroundColor: C.border, borderRadius: 4 },
  priceCol:  { alignItems: 'flex-end', gap: 5 },
  priceBar:  { height: 14, width: 50,  backgroundColor: C.border, borderRadius: 5 },
  changeBar: { height: 11, width: 36,  backgroundColor: C.border, borderRadius: 4 },
  scoreRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scoreBar:  { height: 44, width: 100, backgroundColor: C.border, borderRadius: 10 },
  pillBar:   { height: 30, width: 80,  backgroundColor: C.border, borderRadius: 20 },
  tipBox:    { height: 52, backgroundColor: C.border, borderRadius: 12 },
  btnRow:    { flexDirection: 'row', gap: 8 },
  btn:       { flex: 1, height: 38, backgroundColor: C.border, borderRadius: 12 },
});

const card = StyleSheet.create({
  // Card container — clean cream with subtle border
  container: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: C.card,
    borderRadius: 18, borderWidth: 1.5, borderColor: C.border,
    shadowColor: '#1C1612', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14,
    gap: 10,
  },

  // Bookmark — leading item in the header row (card's top-left corner)
  bookmarkBtn: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginRight: 2,
  },

  // Highlight border when the stock has changed band since adding
  containerAlerted: { borderLeftWidth: 3, borderLeftColor: C.orange },

  // Header row
  headerRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerLeft:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerMeta:  { flex: 1 },
  headerRight: { alignItems: 'flex-end' },

  // Company icon square (fallback when logo image fails)
  icon: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  iconTxt: { fontSize: 13, fontFamily: F.bold, color: '#FFF', letterSpacing: 0.5 },
  // Real logo image
  logoImg: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#FFFFFF', flexShrink: 0,
  },

  // Ticker + company name
  ticker:  { fontSize: 15, fontFamily: F.bold,    color: C.text },
  company: { fontSize: 12, fontFamily: F.regular, color: C.muted, marginTop: 1 },

  // Price + change — price is the visual anchor on the right, larger weight
  price:     { fontSize: 19, fontFamily: F.xbold, color: C.text, letterSpacing: -0.3 },
  changePct: { fontSize: 13, fontFamily: F.bold, marginTop: 3 },

  // Share button (small, top-right of header)
  shareBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  shareBtnTxt: { fontSize: 13 },

  // Score row: "XX /100" left, band pill right
  scoreRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scoreLeft:   { flexDirection: 'row', alignItems: 'baseline' },
  scoreNumRow: { flexDirection: 'row', alignItems: 'baseline' },
  scoreNum:    { fontSize: 44, fontFamily: F.xbold, letterSpacing: -2, lineHeight: 48 },
  scoreOf:     { fontSize: 15, fontFamily: F.medium, color: C.muted },
  scoreSkeleton: { width: 90, height: 44, backgroundColor: C.border, borderRadius: 10 },
  scorePlaceholder: { width: 90, height: 44 },

  // Band pill — filled, white text
  bandPill: {
    borderRadius: 30, paddingVertical: 6, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  bandPillTxt: { fontSize: 13, fontFamily: F.bold, color: '#FFF' },
  bandPillLoading: {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
  },
  bandPillLoadingTxt: { fontSize: 12, fontFamily: F.medium, color: C.muted },

  // Vibe check box — tinted, italic
  vibeBox: {
    backgroundColor: C.bg, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  vibeText: {
    fontSize: 13, fontFamily: F.regular, color: C.sub,
    fontStyle: 'italic', lineHeight: 19,
  },

  // Action buttons — compact row
  buttons:   { flexDirection: 'row', gap: 8, marginTop: 2 },
  btnSecondary: {
    flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5,
    borderColor: C.orange, alignItems: 'center',
  },
  btnSecondaryTxt: { fontSize: 13, fontFamily: F.semibold, color: C.orange },
  btnPrimary: {
    flex: 1, paddingVertical: 10, borderRadius: 12,
    backgroundColor: C.orange, alignItems: 'center',
  },
  btnPrimaryTxt: { fontSize: 13, fontFamily: F.semibold, color: '#FFF' },
});

// Share card (off-screen, 360×360 logical px → 1080×1080 @3x)
const sh = StyleSheet.create({
  card: {
    width: 360, height: 360, backgroundColor: '#F4EADA',
    borderWidth: 3, borderColor: '#1C1612',
    padding: 28, justifyContent: 'space-between',
  },
  wordmark:  { fontSize: 22, color: '#F26A28', fontFamily: 'Pacifico_400Regular' },
  stockInfo: { gap: 2 },
  ticker:    { fontSize: 64, fontFamily: F.xbold, color: '#1C1612', letterSpacing: -3, lineHeight: 68 },
  company:   { fontSize: 14, fontFamily: F.regular, color: '#9A8878' },
  scoreBlock:{ alignItems: 'center' },
  score:     { fontSize: 80, fontFamily: F.xbold, letterSpacing: -4, lineHeight: 84 },
  bandPill:  { borderRadius: 24, paddingVertical: 5, paddingHorizontal: 14, marginTop: 4 },
  bandPillTxt: { fontSize: 14, fontFamily: F.bold, color: '#FFF' },
  vibe:      { fontSize: 13, fontFamily: F.regular, color: '#5C4A3A', fontStyle: 'italic', textAlign: 'center', lineHeight: 19 },
  priceRow:  { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'baseline', gap: 8 },
  price:     { fontSize: 18, fontFamily: F.bold, color: '#1C1612' },
  change:    { fontSize: 14, fontFamily: F.bold },
  domain:    { fontSize: 10, fontFamily: F.regular, color: '#9A8878' },
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
  priceRow:  {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 24, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  price:     { fontSize: 26, fontFamily: F.bold, color: C.text, letterSpacing: -0.5 },
  changePill: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 20 },
  changeTxt:  { fontSize: 14, fontFamily: F.bold },
  typeBadge:  { marginLeft: 'auto', backgroundColor: C.border, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8 },
  typeBadgeTxt: { fontSize: 11, fontFamily: F.semibold, color: C.muted, letterSpacing: 0.5 },
  tipCard: {
    marginHorizontal: 20, marginBottom: 4, marginTop: 12,
    backgroundColor: C.card, borderRadius: 16, padding: 16,
    borderWidth: 2, borderColor: C.ink, ...inkShadow,
  },
  tipHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  tipLabel:      { fontSize: 11, fontFamily: F.semibold, color: C.orange, letterSpacing: 0.5 },
  indicatorPill: { borderRadius: 20, paddingVertical: 3, paddingHorizontal: 10, borderWidth: 1 },
  indicatorTxt:  { fontSize: 12, fontFamily: F.semibold },
  tipText:       { fontSize: 14, fontFamily: F.regular, color: C.text, lineHeight: 22, fontStyle: 'italic' },
  msgs:      { flex: 1 },
  bubbleBot: {
    alignSelf: 'flex-start', backgroundColor: C.card, borderRadius: 16,
    borderBottomLeftRadius: 4, borderWidth: 1.5, borderColor: C.border,
    paddingVertical: 10, paddingHorizontal: 14, marginBottom: 8, maxWidth: '82%',
  },
  bubbleUser: {
    alignSelf: 'flex-end', backgroundColor: C.orange, borderRadius: 16,
    borderBottomRightRadius: 4, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 8, maxWidth: '82%',
  },
  bubbleTxt:     { fontSize: 14, lineHeight: 21, fontFamily: F.regular },
  bubbleTxtBot:  { color: C.text },
  bubbleTxtUser: { color: '#FFF' },
  typing:  { fontSize: 10, color: C.muted, fontFamily: F.medium, letterSpacing: 4 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: C.border, gap: 10,
  },
  input: {
    flex: 1, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, fontFamily: F.regular, color: C.text,
  },
  sendBtn: { backgroundColor: C.orange, width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sendTxt: { fontSize: 18, color: '#FFF', fontFamily: F.bold },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  // Off-screen share card
  offscreen: {
    position: 'absolute', left: -2000, top: -2000, opacity: 0,
  },

  topRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginTop: 12, marginBottom: 8, gap: 10,
  },
  searchWrapper: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F3F3F3', borderWidth: 0,
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
  },
  searchIcon:  { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: F.regular, color: C.text },
  clearBtn:    { fontSize: 13, color: C.muted, paddingLeft: 8 },
  timestamp:   { fontSize: 11, fontFamily: F.regular, color: C.muted, flexShrink: 0 },

  closedBanner: {
    marginHorizontal: 20, marginBottom: 8,
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border,
    borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center',
  },
  closedBannerTxt: { fontSize: 12, fontFamily: F.medium, color: C.muted },

  cacheBanner: {
    marginHorizontal: 20, marginBottom: 8,
    backgroundColor: C.orangeGlow, borderWidth: 1.5, borderColor: C.orangeBorder,
    borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center',
  },
  cacheBannerTxt: { fontSize: 12, fontFamily: F.medium, color: C.orange },

  personalizingBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 20, marginBottom: 8,
    backgroundColor: C.orangeGlow, borderWidth: 1, borderColor: C.orangeBorder,
    borderRadius: 12, paddingVertical: 7, paddingHorizontal: 14,
  },
  personalizingTxt: { fontSize: 12, fontFamily: F.medium, color: C.orange },

  toast: {
    marginHorizontal: 20, marginBottom: 8, backgroundColor: C.ink,
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center',
  },
  toastTxt: { fontSize: 13, fontFamily: F.semibold, color: '#FFF' },

  searchList:     { paddingHorizontal: 20, paddingTop: 4 },
  resultRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  resultTicker:   { fontSize: 15, fontFamily: F.bold, color: C.text },
  resultName:     { fontSize: 13, fontFamily: F.regular, color: C.sub, marginTop: 1 },
  resultExchange: { fontSize: 11, fontFamily: F.regular, color: C.muted, marginTop: 2 },
  resultPrice:    { fontSize: 14, fontFamily: F.semibold, color: C.text },
  resultChange:   { fontSize: 12, fontFamily: F.medium, marginTop: 2 },
  separator:      { height: 1, backgroundColor: C.border },
  emptyTxt:       { textAlign: 'center', marginTop: 48, fontSize: 14, fontFamily: F.regular, color: C.muted, paddingHorizontal: 32 },

  feedList: { paddingTop: 8, paddingBottom: 24 },
  loadingMoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 20 },
  loadingMoreTxt: { fontSize: 13, fontFamily: F.regular, color: C.muted },

  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  errorEmoji:     { fontSize: 48, marginBottom: 16 },
  errorTitle:     { fontSize: 18, fontFamily: F.xbold, color: C.text, textAlign: 'center', marginBottom: 8 },
  errorSub:       { fontSize: 14, fontFamily: F.regular, color: C.muted, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  retryBtn: {
    backgroundColor: C.orange, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32,
    ...inkShadow,
  },
  retryTxt: { fontSize: 15, fontFamily: F.bold, color: '#FFF' },
  disclaimer: { fontSize: 10, fontFamily: F.regular, color: C.muted, textAlign: 'center', paddingHorizontal: 20, paddingBottom: 4 },
});

const live = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  txt: { fontSize: 10, fontFamily: F.bold, letterSpacing: 1.2 },
});
