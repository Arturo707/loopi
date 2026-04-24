import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
  RefreshControl, Image, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useWatchlist } from '../context/WatchlistContext';
import { authFetch } from '../utils/authFetch';
import { C } from '../constants/colors';
import { F } from '../constants/fonts';

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '');
const SCORE_API = `${API_BASE}/api/loopi-score`;
const QUOTE_API = `${API_BASE}/api/market-feed`;

const BAND_COLORS = { fafo: '#F26A28', watching: '#E9A84B', mid: '#9A8878', cooked: '#1C1612' };
const BAND_EMOJIS = { fafo: '🔥', watching: '👀', mid: '😐', cooked: '💀' };

const fmtPrice  = (n) => n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtChange = (n) => { const v = Number(n); return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; };

const ICON_PALETTE = ['#E74C3C','#E67E22','#27AE60','#2980B9','#8E44AD','#16A085','#D35400','#C0392B','#2471A3','#1E8449'];
function getIconColor(symbol) {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = ((h << 5) - h) + symbol.charCodeAt(i) | 0;
  return ICON_PALETTE[Math.abs(h) % ICON_PALETTE.length];
}

function CompanyLogo({ symbol }) {
  const [failed, setFailed] = useState(false);
  const color   = getIconColor(symbol);
  const letters = symbol.slice(0, 2);
  if (failed) {
    return (
      <View style={[s.icon, { backgroundColor: color }]}>
        <Text style={s.iconTxt}>{letters}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: `https://financialmodelingprep.com/image-stock/${symbol}.png` }}
      style={s.logoImg}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
}

export default function WatchlistScreen({ navigation }) {
  const { tickers, loading, removeTicker } = useWatchlist();
  const [liveData, setLiveData] = useState({});   // symbol → {price, changesPercentage, score, band, vibe, delta}
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (tickers.length === 0) return;
    setRefreshing(true);
    try {
      // 1. Fetch market-feed once to grab current prices + scores in one shot
      let feed = {};
      try {
        const fr   = await authFetch(QUOTE_API);
        const data = await fr.json();
        if (fr.ok) {
          const items  = data.items ?? [];
          const scores = data.scores ?? {};
          items.forEach((it) => { feed[it.symbol] = { item: it, score: scores[it.symbol] }; });
        }
      } catch { /* fall through to per-ticker */ }

      // 2. For any watchlisted ticker missing from the feed, fetch its score individually
      const missing = tickers.filter((t) => !feed[t.ticker]);
      await Promise.all(missing.map(async (t) => {
        try {
          const res  = await authFetch(`${SCORE_API}?ticker=${t.ticker}`);
          const data = await res.json();
          if (res.ok) feed[t.ticker] = { item: null, score: data };
        } catch { /* ignore */ }
      }));

      // 3. Merge with watchlist metadata to compute delta
      const next = {};
      tickers.forEach((t) => {
        const f = feed[t.ticker] || {};
        const sc = f.score;
        const currentScore = sc?.score ?? t.last_score ?? null;
        const currentBand  = sc?.band  ?? t.last_band  ?? null;
        const delta = (currentScore != null && t.last_score != null) ? (currentScore - t.last_score) : null;
        const bandChanged = !!(currentBand && t.initial_band && currentBand !== t.initial_band);
        next[t.ticker] = {
          price:              f.item?.price ?? null,
          changesPercentage:  f.item?.changesPercentage ?? null,
          score:              currentScore,
          band:               currentBand,
          vibe:               sc?.vibeCheck ?? null,
          delta,
          bandChanged,
          previousBand:       t.initial_band,
        };
      });
      setLiveData(next);
    } finally {
      setRefreshing(false);
    }
  }, [tickers]);

  // Refresh whenever the watchlist symbols change
  useEffect(() => {
    refresh();
  }, [tickers.length]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Sort: biggest absolute delta first (most interesting)
  const sortedTickers = React.useMemo(() => {
    return [...tickers].sort((a, b) => {
      const da = Math.abs(liveData[a.ticker]?.delta ?? 0);
      const db = Math.abs(liveData[b.ticker]?.delta ?? 0);
      return db - da;
    });
  }, [tickers, liveData]);

  if (loading) {
    return (
      <View style={s.container}>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={C.orange} />
        </SafeAreaView>
      </View>
    );
  }

  if (tickers.length === 0) {
    return (
      <View style={s.container}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={s.header}><Text style={s.headerTitle}>Saved</Text></View>
          <View style={s.emptyBox}>
            <Text style={s.emptyArt}>🔖</Text>
            <Text style={s.emptyTitle}>nothing saved yet</Text>
            <Text style={s.emptySub}>
              tap the bookmark on any stock to track its vibe.
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Saved</Text>
          <Text style={s.headerSub}>{tickers.length} {tickers.length === 1 ? 'stock' : 'stocks'} on watch</Text>
        </View>
        <FlatList
          data={sortedTickers}
          keyExtractor={(t) => t.ticker}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.orange} />}
          renderItem={({ item }) => {
            const live = liveData[item.ticker] || {};
            const band = live.band || item.last_band;
            const score = live.score ?? item.last_score;
            const price = live.price;
            const pct   = live.changesPercentage;
            const vibe  = live.vibe;
            const delta = live.delta;
            const up    = (pct ?? 0) >= 0;
            const bandColor = band ? (BAND_COLORS[band] ?? C.muted) : C.muted;
            const bandEmoji = band ? (BAND_EMOJIS[band] ?? '') : '';
            const deltaColor = delta > 0 ? BAND_COLORS.fafo : delta < 0 ? C.changeNeg : C.muted;
            const alerted = live.bandChanged;
            return (
              <TouchableOpacity
                style={[s.card, alerted && s.cardAlerted]}
                activeOpacity={0.85}
                onPress={() => navigation?.navigate('Discover')}
              >
                {/* Header: logo, ticker, name, price, change, unbookmark */}
                <View style={s.headerRow}>
                  <View style={s.headerLeft}>
                    <CompanyLogo symbol={item.ticker} />
                    <View style={s.headerMeta}>
                      <Text style={s.ticker}>{item.ticker}</Text>
                      <Text style={s.company} numberOfLines={1}>{item.company_name}</Text>
                    </View>
                  </View>
                  <View style={s.headerRight}>
                    {price != null && <Text style={s.price}>{fmtPrice(price)}</Text>}
                    {pct   != null && (
                      <Text style={[s.changePct, { color: up ? C.changePos : C.changeNeg }]}>
                        {fmtChange(pct)}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => removeTicker(item.ticker)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={s.unbookmark}
                  >
                    <Ionicons name="bookmark" size={18} color={C.orange} />
                  </TouchableOpacity>
                </View>

                {/* Score row + delta badge */}
                <View style={s.scoreRow}>
                  <View style={s.scoreLeft}>
                    <Text style={[s.scoreNum, { color: bandColor }]}>{score ?? '—'}</Text>
                    <Text style={s.scoreOf}> /100</Text>
                    {delta != null && delta !== 0 && (
                      <View style={[s.deltaBadge, { backgroundColor: deltaColor }]}>
                        <Text style={s.deltaTxt}>{delta > 0 ? '+' : ''}{delta}</Text>
                      </View>
                    )}
                  </View>
                  {band && (
                    <View style={[s.bandPill, { backgroundColor: bandColor }]}>
                      <Text style={s.bandPillTxt}>{bandEmoji} {band}</Text>
                    </View>
                  )}
                </View>

                {/* Band change indicator (if changed since save) */}
                {alerted && live.previousBand && (
                  <View style={s.transitionRow}>
                    <Text style={s.transitionPrev}>{live.previousBand}</Text>
                    <Text style={s.transitionArrow}>→</Text>
                    <Text style={[s.transitionNew, { color: bandColor }]}>
                      {bandEmoji} {band}
                    </Text>
                  </View>
                )}

                {/* Vibe text */}
                {vibe ? (
                  <View style={s.vibeBox}>
                    <Text style={s.vibeText}>{vibe}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          }}
        />
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header:      { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 },
  headerTitle: { fontSize: 26, fontFamily: F.xbold, color: C.text, letterSpacing: -0.8 },
  headerSub:   { fontSize: 12, fontFamily: F.regular, color: C.muted, marginTop: 2 },

  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyArt: { fontSize: 64, marginBottom: 20, opacity: 0.5 },
  emptyTitle: { fontSize: 20, fontFamily: F.xbold, color: C.text, marginBottom: 10 },
  emptySub: { fontSize: 14, fontFamily: F.regular, color: C.muted, textAlign: 'center', lineHeight: 21 },

  card: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: C.card,
    borderRadius: 18, borderWidth: 1.5, borderColor: C.border,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14,
    gap: 10,
  },
  cardAlerted: { borderLeftWidth: 3, borderLeftColor: C.orange },

  headerRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerLeft:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerMeta:  { flex: 1 },
  headerRight: { alignItems: 'flex-end' },

  icon: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  iconTxt: { fontSize: 13, fontFamily: F.bold, color: '#FFF', letterSpacing: 0.5 },
  logoImg: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#FFFFFF', flexShrink: 0,
  },
  ticker:  { fontSize: 15, fontFamily: F.bold,    color: C.text },
  company: { fontSize: 12, fontFamily: F.regular, color: C.muted, marginTop: 1 },

  price:     { fontSize: 19, fontFamily: F.xbold, color: C.text, letterSpacing: -0.3 },
  changePct: { fontSize: 13, fontFamily: F.bold, marginTop: 3 },

  unbookmark: {
    width: 30, height: 30, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
    flexShrink: 0,
  },

  scoreRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scoreLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  scoreNum:  { fontSize: 36, fontFamily: F.xbold, letterSpacing: -1.5, lineHeight: 40 },
  scoreOf:   { fontSize: 14, fontFamily: F.medium, color: C.muted },

  deltaBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginLeft: 8 },
  deltaTxt:   { fontSize: 11, fontFamily: F.bold, color: '#FFF', letterSpacing: 0.3 },

  bandPill:    { borderRadius: 30, paddingVertical: 6, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  bandPillTxt: { fontSize: 13, fontFamily: F.bold, color: '#FFF' },

  transitionRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingHorizontal: 2 },
  transitionPrev: { fontSize: 12, fontFamily: F.medium, color: C.muted, textDecorationLine: 'line-through' },
  transitionArrow: { fontSize: 12, color: C.muted },
  transitionNew:   { fontSize: 13, fontFamily: F.bold },

  vibeBox: {
    backgroundColor: C.bg, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  vibeText: { fontSize: 13, fontFamily: F.regular, color: C.sub, lineHeight: 19, fontStyle: 'italic' },
});
