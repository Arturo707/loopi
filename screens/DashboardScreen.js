import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { C } from '../constants/colors';
import { F } from '../constants/fonts';

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '');

const fmtPrice = (n) =>
  `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtChange = (n) => { const v = Number(n); return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; };

function getEmojiTag(stock) {
  if (stock.type === 'etf') return '📊';
  return stock.changesPercentage >= 0 ? '🔥' : '📉';
}

// ─── Market Pulse Card ────────────────────────────────────────────────────────

const renderBoldText = (text) => {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <Text key={i} style={pulse.bold}>{part}</Text>
      : <Text key={i}>{part}</Text>
  );
};

const parseVibe = (vibe) => {
  const bullets = vibe
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('---') && (l.startsWith('•') || l.startsWith('- ') || l.startsWith('-\t')))
    .map(l => l.replace(/^[•\-]\s*/, ''));
  return { bullets };
};

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
        <View style={pulse.skLine3} />
      </Animated.View>
    );
  }

  if (!vibe) return null;

  const { bullets } = parseVibe(vibe);

  return (
    <View style={pulse.card}>
      <View style={pulse.labelRow}>
        <Text style={pulse.label}>MARKET PULSE</Text>
        <Text style={pulse.date}>{todayStr}</Text>
      </View>
      {bullets.map((b, i) => (
        <View key={i} style={[pulse.bulletRow, i > 0 && { marginTop: 10 }]}>
          <Text style={pulse.bulletDot}>•</Text>
          <Text style={pulse.bulletText}>{renderBoldText(b)}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function DashboardScreen({ navigation }) {
  const { balance, bankAccount, investedAmount, riskProfile, setRiskProfile, firstName, alpacaPortfolioValue, alpacaPositions } = useApp();
  const { user } = useAuth();

  const freeBalance = balance - investedAmount;
  const displayName = firstName || 'there';
  const ibanDisplay = bankAccount?.iban ? `···· ${bankAccount.iban.slice(-4)}` : null;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const [marketVibe,    setMarketVibe]    = useState(null);
  const [vibeLoading,   setVibeLoading]   = useState(true);
  const [forYouItems,   setForYouItems]   = useState([]);
  const [feedLoaded,    setFeedLoaded]    = useState(false);
  useEffect(() => {
    // Market Pulse
    fetch(`${API_BASE}/api/market-vibe`)
      .then((r) => r.json())
      .then((data) => { if (data.vibe) setMarketVibe(data.vibe); })
      .catch(() => {})
      .finally(() => setVibeLoading(false));

    // For You Today — live top 5
    fetch(`${API_BASE}/api/market-feed`)
      .then((r) => r.json())
      .then((data) => {
        const items = data.items ?? data;
        if (Array.isArray(items)) setForYouItems(items.slice(0, 5));
      })
      .catch(() => {})
      .finally(() => setFeedLoaded(true));
  }, []);

  return (
    <View style={s.container}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.greeting}>{greeting}, {displayName} ☀️</Text>
          </View>
          <TouchableOpacity style={s.avatar} onPress={() => navigation.navigate('Profile')} activeOpacity={0.8}>
            <Text style={s.avatarText}>{(user?.displayName?.[0] || 'L').toUpperCase()}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Balance card */}
          <View style={s.balanceCard}>
            <LinearGradient
              colors={['#FFF7ED', '#FFFBF6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.balanceGradient}
            >
              <View style={s.balanceTitleRow}>
                <Text style={s.balanceLabel}>AVAILABLE BALANCE</Text>
              </View>
              <Text style={s.balanceAmount}>
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: bankAccount?.currency || 'USD' }).format(freeBalance)}
              </Text>
              <View style={s.balanceRow}>
                <View style={s.balancePill}>
                  <Text style={s.balancePillText}>↑ Invested: ${investedAmount}</Text>
                </View>
                {ibanDisplay
                  ? <Text style={s.balanceHint}>IBAN {ibanDisplay}</Text>
                  : <Text style={s.balanceHint}>Your money sitting idle 😴</Text>
                }
              </View>
            </LinearGradient>
          </View>

          {/* AI Insight */}
          <View style={s.insightCard}>
            <View style={s.insightHeader}>
              <View style={s.insightDot} />
              <Text style={s.insightLabel}>Vibe check</Text>
            </View>
            {alpacaPortfolioValue > 0 && alpacaPositions.length > 0 ? (() => {
              const biggest = alpacaPositions.reduce((a, b) =>
                Number(a.market_value) >= Number(b.market_value) ? a : b
              );
              const plPct = Number(biggest.unrealized_plpc) * 100;
              const sign = plPct >= 0 ? '+' : '';
              return (
                <Text style={s.insightText}>
                  Your money's working.{' '}
                  <Text style={s.insightHighlight}>{biggest.symbol}</Text>
                  {` is your biggest position (${sign}${plPct.toFixed(1)}% unrealized).`}
                </Text>
              );
            })() : (
              <Text style={s.insightText}>
                Hey <Text style={s.insightHighlight}>{displayName}</Text>
                , inflation eats 3% a year. Your move.
              </Text>
            )}
          </View>

          {/* Market Pulse */}
          <View style={s.section}>
            <MarketPulseCard vibe={marketVibe} loading={vibeLoading} />
          </View>

          {/* For You Today */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>FOR YOU TODAY</Text>
            {forYouItems.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.hScroll}>
                {forYouItems.map((stock) => {
                  const up = stock.changesPercentage >= 0;
                  return (
                    <TouchableOpacity
                      key={stock.symbol}
                      style={s.miniCard}
                      onPress={() => navigation.navigate('Discover')}
                      activeOpacity={0.75}
                    >
                      <Text style={s.miniTag}>{getEmojiTag(stock)}</Text>
                      <Text style={s.miniTicker}>{stock.symbol}</Text>
                      <Text style={s.miniPrice}>{fmtPrice(stock.price)}</Text>
                      <Text style={[s.miniChange, { color: up ? C.green : C.red }]}>
                        {fmtChange(stock.changesPercentage)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : feedLoaded ? (
              <Text style={s.feedUnavailable}>Market data unavailable</Text>
            ) : null}
          </View>

          {/* Risk profile */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>YOUR RISK PROFILE</Text>
            <View style={s.riskCard}>
              {['Conservative', 'Moderate', 'Aggressive'].map((label) => {
                const active = label === riskProfile;
                return (
                  <TouchableOpacity
                    key={label}
                    style={s.riskRow}
                    activeOpacity={0.7}
                    onPress={() => setRiskProfile(label)}
                  >
                    <View style={[s.radio, active ? s.radioActive : s.radioInactive]} />
                    <Text style={[s.riskLabel, active ? s.riskLabelActive : s.riskLabelFaded]}>
                      {label}
                    </Text>
                    {active && (
                      <View style={s.riskBadge}>
                        <Text style={s.riskBadgeText}>Selected</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const cardShadow = {
  shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16,
  },
  greeting: { fontSize: 20, color: C.text, fontFamily: F.xbold, letterSpacing: -0.5 },
  avatar: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center',
    shadowColor: C.orange, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  avatarText: { fontSize: 18, color: '#FFF', fontFamily: F.bold },

  balanceCard: {
    marginHorizontal: 24, marginBottom: 16, borderRadius: 24,
    overflow: 'hidden', borderWidth: 1, borderColor: C.orangeBorder,
    ...cardShadow,
  },
  balanceGradient: { padding: 24 },
  balanceTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  balanceLabel: { fontSize: 11, color: C.muted, fontFamily: F.semibold, letterSpacing: 2 },
  balanceAmount: { fontSize: 42, color: C.text, fontFamily: F.xbold, letterSpacing: -1.5, marginBottom: 14 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balancePill: {
    backgroundColor: C.orangeGlow, borderWidth: 1, borderColor: C.orangeBorder,
    borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10,
  },
  balancePillText: { fontSize: 12, color: C.orange, fontFamily: F.semibold },
  balanceHint: { fontSize: 12, color: C.muted, fontFamily: F.regular },

  insightCard: {
    marginHorizontal: 24, marginBottom: 16,
    backgroundColor: C.card, borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: C.border, ...cardShadow,
  },
  insightHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  insightDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.orange },
  insightLabel: { fontSize: 12, color: C.orange, fontFamily: F.bold, letterSpacing: 0.5 },
  insightText: { fontSize: 14, color: C.sub, lineHeight: 22, fontFamily: F.regular },
  insightHighlight: { color: C.orange, fontFamily: F.bold },

  section: { marginBottom: 20 },
  sectionLabel: {
    fontSize: 11, color: C.muted, fontFamily: F.semibold,
    letterSpacing: 2, marginBottom: 12, paddingHorizontal: 24,
  },

  hScroll: { paddingLeft: 24 },
  miniCard: {
    backgroundColor: C.card, borderRadius: 18, padding: 16,
    marginRight: 12, width: 130, borderWidth: 1, borderColor: C.border,
    ...cardShadow,
  },
  miniTag:    { fontSize: 18, marginBottom: 6 },
  miniTicker: { fontSize: 18, color: C.text, fontFamily: F.xbold, marginBottom: 4 },
  miniPrice:  { fontSize: 12, color: C.sub, fontFamily: F.medium, marginBottom: 4 },
  miniChange: { fontSize: 13, fontFamily: F.bold },

  feedUnavailable: {
    fontSize: 13, fontFamily: F.regular, color: C.muted,
    paddingHorizontal: 24,
  },

  riskCard: {
    marginHorizontal: 24, backgroundColor: C.card,
    borderRadius: 20, padding: 8, borderWidth: 1, borderColor: C.border, ...cardShadow,
  },
  riskRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  radioActive: { backgroundColor: C.orange, borderColor: C.orange },
  radioInactive: { backgroundColor: 'transparent', borderColor: C.border },
  riskLabel: { flex: 1, fontSize: 15, fontFamily: F.medium },
  riskLabelActive: { color: C.text, fontFamily: F.bold },
  riskLabelFaded: { color: C.muted },
  riskBadge: {
    backgroundColor: C.orangeGlow, borderRadius: 10,
    paddingVertical: 3, paddingHorizontal: 8, borderWidth: 1, borderColor: C.orangeBorder,
  },
  riskBadgeText: { fontSize: 10, color: C.orange, fontFamily: F.semibold },
});

const pulse = StyleSheet.create({
  card: {
    marginHorizontal: 24,
    backgroundColor: C.card, borderRadius: 20,
    borderWidth: 1, borderColor: C.border, padding: 18,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  labelRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  label:     { fontSize: 10, fontFamily: F.semibold, color: C.orange, letterSpacing: 1.5 },
  date:      { fontSize: 10, fontFamily: F.regular, color: C.muted },
  bulletRow: { flexDirection: 'row' },
  bulletDot: { fontSize: 14, color: C.orange, marginRight: 8, lineHeight: 22 },
  bulletText:{ flex: 1, fontSize: 14, fontFamily: F.regular, color: C.sub, lineHeight: 22 },
  bold:      { fontFamily: F.bold, color: C.text },
  // skeleton
  skRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  skLabel: { height: 10, width: 90, backgroundColor: C.border, borderRadius: 4 },
  skDate:  { height: 10, width: 40, backgroundColor: C.border, borderRadius: 4 },
  skLine1: { height: 12, backgroundColor: C.border, borderRadius: 4, marginBottom: 8 },
  skLine2: { height: 12, width: '80%', backgroundColor: C.border, borderRadius: 4, marginBottom: 8 },
  skLine3: { height: 12, width: '65%', backgroundColor: C.border, borderRadius: 4 },
});
