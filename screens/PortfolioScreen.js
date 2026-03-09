import React, { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { C } from '../constants/colors';
import { F } from '../constants/fonts';

const fmtMoney = (n) =>
  `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtPct = (n) => {
  const v = Number(n) * 100;
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
};

export default function PortfolioScreen() {
  const navigation = useNavigation();
  const {
    alpacaAccountId,
    alpacaPositions,
    alpacaCash,
    alpacaPortfolioValue,
    refreshAlpacaPortfolio,
  } = useApp();

  useEffect(() => {
    if (alpacaAccountId) refreshAlpacaPortfolio();
  }, [alpacaAccountId]);

  const totalPL = alpacaPositions.reduce((sum, p) => sum + p.unrealizedPL, 0);
  const invested = alpacaPortfolioValue - alpacaCash;

  return (
    <View style={s.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={s.header}>
          <Text style={s.title}>Tu cartera</Text>
          <Text style={s.subtitle}>Resumen de tus posiciones</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Summary */}
          <LinearGradient
            colors={['#FFF3E0', '#FFFBF6']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.summaryCard}
          >
            <View style={s.summaryRow}>
              <View>
                <Text style={s.summaryLabel}>VALOR TOTAL</Text>
                <Text style={s.summaryValue}>{fmtMoney(alpacaPortfolioValue)}</Text>
                <Text style={s.cashLabel}>Efectivo: {fmtMoney(alpacaCash)}</Text>
              </View>
              <View style={s.divider} />
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.summaryLabel}>GANANCIA/PÉRDIDA</Text>
                <Text style={[s.summaryValue, { color: totalPL >= 0 ? C.green : C.red }]}>
                  {totalPL >= 0 ? '+' : ''}{fmtMoney(totalPL)}
                </Text>
                {invested > 0 && (
                  <Text style={[s.returnsPct, { color: totalPL >= 0 ? C.green : C.red }]}>
                    {totalPL >= 0 ? '+' : ''}{((totalPL / invested) * 100).toFixed(2)}%
                  </Text>
                )}
              </View>
            </View>
          </LinearGradient>

          {!alpacaAccountId ? (
            <View style={s.emptyState}>
              <View style={s.emptyIcon}>
                <Text style={{ fontSize: 40 }}>📭</Text>
              </View>
              <Text style={s.emptyTitle}>Portfolio vacío</Text>
              <Text style={s.emptySub}>Empieza invirtiendo desde 50€. Sin comisiones ocultas.</Text>
              <TouchableOpacity
                style={s.exploreBtn}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('Discover')}
              >
                <Text style={s.exploreBtnText}>Explorar inversiones →</Text>
              </TouchableOpacity>
            </View>
          ) : alpacaPositions.length === 0 ? (
            <View style={s.emptyState}>
              <View style={s.emptyIcon}>
                <Text style={{ fontSize: 40 }}>📈</Text>
              </View>
              <Text style={s.emptyTitle}>Sin posiciones aún</Text>
              <Text style={s.emptySub}>Tu cuenta está lista. Compra tu primera acción desde Descubrir.</Text>
              <TouchableOpacity
                style={s.exploreBtn}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('Discover')}
              >
                <Text style={s.exploreBtnText}>Explorar inversiones →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 24 }}>
              <Text style={s.sectionLabel}>TUS POSICIONES</Text>
              {alpacaPositions.map((pos) => {
                const pl = pos.unrealizedPL;
                const plPct = pos.unrealizedPLPC;
                const positive = pl >= 0;
                return (
                  <View key={pos.symbol} style={s.positionCard}>
                    <View style={s.positionLeft}>
                      <Text style={s.posTicker}>{pos.symbol}</Text>
                      <Text style={s.posDetail}>{pos.qty} acciones · {fmtMoney(pos.currentPrice)}</Text>
                    </View>
                    <View style={s.positionRight}>
                      <Text style={s.posAmount}>{fmtMoney(pos.marketValue)}</Text>
                      <View style={[s.returnBadge, { backgroundColor: positive ? C.greenBg : C.redBg, borderColor: positive ? C.greenBorder : C.redBorder }]}>
                        <Text style={[s.returnBadgeText, { color: positive ? C.green : C.red }]}>
                          {positive ? '+' : ''}{fmtMoney(pl)} ({fmtPct(plPct)})
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const cardShadow = {
  shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16 },
  title: { fontSize: 28, color: C.text, fontFamily: F.xbold, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: C.muted, fontFamily: F.regular, marginTop: 2 },

  summaryCard: {
    marginHorizontal: 24, marginBottom: 24, borderRadius: 24, padding: 24,
    borderWidth: 1, borderColor: C.orangeBorder, ...cardShadow,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryLabel: { fontSize: 10, color: C.muted, fontFamily: F.semibold, letterSpacing: 2, marginBottom: 6 },
  summaryValue: { fontSize: 30, color: C.text, fontFamily: F.xbold, letterSpacing: -1 },
  cashLabel: { fontSize: 12, color: C.muted, fontFamily: F.regular, marginTop: 4 },
  divider: { width: 1, height: 48, backgroundColor: C.border, marginHorizontal: 24 },
  returnsPct: { fontSize: 12, fontFamily: F.medium, marginTop: 2 },

  emptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: C.bgAlt, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, color: C.text, fontFamily: F.bold, marginBottom: 8 },
  emptySub: { fontSize: 14, color: C.muted, fontFamily: F.regular, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  exploreBtn: {
    backgroundColor: C.orange, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 28,
    shadowColor: C.orange, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 10, elevation: 5,
  },
  exploreBtnText: { fontSize: 15, color: '#FFF', fontFamily: F.bold },

  sectionLabel: { fontSize: 11, color: C.muted, fontFamily: F.semibold, letterSpacing: 2, marginBottom: 12 },
  positionCard: {
    backgroundColor: C.card, borderRadius: 18, padding: 18, marginBottom: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1, borderColor: C.border, ...cardShadow,
  },
  positionLeft: { flex: 1 },
  posTicker: { fontSize: 20, color: C.text, fontFamily: F.xbold, marginBottom: 4 },
  posDetail: { fontSize: 12, color: C.muted, fontFamily: F.regular },
  positionRight: { alignItems: 'flex-end', gap: 6 },
  posAmount: { fontSize: 20, color: C.text, fontFamily: F.bold },
  returnBadge: {
    borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8, borderWidth: 1,
  },
  returnBadgeText: { fontSize: 12, fontFamily: F.semibold },
});
