import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { C } from '../constants/colors';
import { F } from '../constants/fonts';

export default function PortfolioScreen() {
  const { investedAmount, portfolio } = useApp();
  const navigation = useNavigation();
  const returns = (investedAmount * 0.042).toFixed(0);
  const returnsPct = investedAmount > 0 ? '+4.2%' : '—';

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
                <Text style={s.summaryLabel}>TOTAL INVERTIDO</Text>
                <Text style={s.summaryValue}>{investedAmount.toLocaleString('es-ES')}€</Text>
              </View>
              <View style={s.divider} />
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.summaryLabel}>RENTABILIDAD</Text>
                <Text style={[s.summaryValue, { color: C.green }]}>+{returns}€</Text>
                <Text style={s.returnsPct}>{returnsPct} anual</Text>
              </View>
            </View>
          </LinearGradient>

          {portfolio.length === 0 ? (
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
          ) : (
            <View style={{ paddingHorizontal: 24 }}>
              <Text style={s.sectionLabel}>TUS POSICIONES</Text>
              {portfolio.map((pos, i) => (
                <View key={i} style={s.positionCard}>
                  <View style={s.positionLeft}>
                    <Text style={s.posTag}>{pos.tag}</Text>
                    <Text style={s.posTicker}>{pos.ticker}</Text>
                    <Text style={s.posName}>{pos.name}</Text>
                  </View>
                  <View style={s.positionRight}>
                    <Text style={s.posAmount}>{pos.amount}€</Text>
                    <View style={s.returnBadge}>
                      <Text style={s.returnBadgeText}>+{(pos.amount * 0.042).toFixed(1)}€</Text>
                    </View>
                  </View>
                </View>
              ))}
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
  divider: { width: 1, height: 48, backgroundColor: C.border, marginHorizontal: 24 },
  returnsPct: { fontSize: 12, color: C.green, fontFamily: F.medium, marginTop: 2 },

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
  posTag: { fontSize: 11, color: C.muted, fontFamily: F.regular, marginBottom: 4 },
  posTicker: { fontSize: 20, color: C.text, fontFamily: F.xbold, marginBottom: 2 },
  posName: { fontSize: 12, color: C.muted, fontFamily: F.regular },
  positionRight: { alignItems: 'flex-end', gap: 6 },
  posAmount: { fontSize: 20, color: C.text, fontFamily: F.bold },
  returnBadge: {
    backgroundColor: C.greenBg, borderRadius: 8,
    paddingVertical: 3, paddingHorizontal: 8, borderWidth: 1, borderColor: C.greenBorder,
  },
  returnBadgeText: { fontSize: 12, color: C.green, fontFamily: F.semibold },
});
