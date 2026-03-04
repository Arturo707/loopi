import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { stocks } from '../constants/data';
import { C } from '../constants/colors';
import { F } from '../constants/fonts';

export default function DashboardScreen({ navigation }) {
  const { balance, investedAmount } = useApp();
  const { user, signOutUser } = useAuth();
  const freeBalance = balance - investedAmount;
  const firstName = user?.displayName?.split(' ')[0] || 'Inversor';

  const hour = new Date().getHours();
  const greeting = hour < 14 ? 'Buenos días' : hour < 21 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <View style={s.container}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.greeting}>{greeting} ☀️</Text>
            <Text style={s.name}>{firstName}</Text>
          </View>
          <TouchableOpacity style={s.avatar} onPress={signOutUser} activeOpacity={0.8}>
            <Text style={s.avatarText}>
              {(user?.displayName?.[0] || 'L').toUpperCase()}
            </Text>
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
              <Text style={s.balanceLabel}>SALDO DISPONIBLE</Text>
              <Text style={s.balanceAmount}>{freeBalance.toLocaleString('es-ES')}€</Text>
              <View style={s.balanceRow}>
                <View style={s.balancePill}>
                  <Text style={s.balancePillText}>↑ Invertido: {investedAmount}€</Text>
                </View>
                <Text style={s.balanceHint}>Tu dinero durmiendo 😴</Text>
              </View>
            </LinearGradient>
          </View>

          {/* AI Insight */}
          <View style={s.insightCard}>
            <View style={s.insightHeader}>
              <View style={s.insightDot} />
              <Text style={s.insightLabel}>loopi IA</Text>
            </View>
            <Text style={s.insightText}>
              Tienes{' '}
              <Text style={s.insightHighlight}>{freeBalance}€ parados</Text>
              . La inflación te come un 3% al año. Con 3 clicks puedes hacer que trabajen.
            </Text>
          </View>

          {/* Quick picks */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>PARA TI HOY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.hScroll}>
              {stocks.slice(0, 4).map((stock, i) => (
                <TouchableOpacity
                  key={stock.ticker}
                  style={s.miniCard}
                  onPress={() => navigation.navigate('Discover', { cardIndex: i })}
                  activeOpacity={0.75}
                >
                  <Text style={s.miniTag}>{stock.tag}</Text>
                  <Text style={s.miniTicker}>{stock.ticker}</Text>
                  <Text style={s.miniPrice}>{stock.price}</Text>
                  <Text style={[s.miniChange, { color: stock.up ? C.green : C.red }]}>
                    {stock.change}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Risk profile */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>TU PERFIL DE RIESGO</Text>
            <View style={s.riskCard}>
              {['Conservador', 'Moderado', 'Atrevido'].map((label, i) => (
                <TouchableOpacity key={label} style={s.riskRow} activeOpacity={0.7}>
                  <View style={[s.radio, i === 1 ? s.radioActive : s.radioInactive]} />
                  <Text style={[s.riskLabel, i === 1 ? s.riskLabelActive : s.riskLabelFaded]}>
                    {label}
                  </Text>
                  {i === 1 && (
                    <View style={s.riskBadge}>
                      <Text style={s.riskBadgeText}>Seleccionado</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

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

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16,
  },
  greeting: { fontSize: 13, color: C.muted, fontFamily: F.medium, marginBottom: 2 },
  name: { fontSize: 26, color: C.text, fontFamily: F.xbold, letterSpacing: -0.5 },
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
  balanceLabel: { fontSize: 11, color: C.muted, fontFamily: F.semibold, letterSpacing: 2, marginBottom: 8 },
  balanceAmount: { fontSize: 42, color: C.text, fontFamily: F.xbold, letterSpacing: -1.5, marginBottom: 14 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balancePill: {
    backgroundColor: C.orangeGlow, borderWidth: 1, borderColor: C.orangeBorder,
    borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10,
  },
  balancePillText: { fontSize: 12, color: C.orange, fontFamily: F.semibold },
  balanceHint: { fontSize: 12, color: C.muted, fontFamily: F.regular },

  insightCard: {
    marginHorizontal: 24, marginBottom: 24,
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
  miniTag: { fontSize: 11, color: C.muted, fontFamily: F.regular, marginBottom: 6 },
  miniTicker: { fontSize: 18, color: C.text, fontFamily: F.xbold, marginBottom: 4 },
  miniPrice: { fontSize: 12, color: C.sub, fontFamily: F.medium, marginBottom: 4 },
  miniChange: { fontSize: 13, fontFamily: F.bold },

  riskCard: {
    marginHorizontal: 24, backgroundColor: C.card,
    borderRadius: 20, padding: 8, borderWidth: 1, borderColor: C.border, ...cardShadow,
  },
  riskRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14, borderRadius: 14,
  },
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
