import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { C } from '../constants/colors';
import { F } from '../constants/fonts';

const BANKS = [
  { id: 'bbva', name: 'BBVA', emoji: '🔵', color: '#004481' },
  { id: 'santander', name: 'Santander', emoji: '🔴', color: '#EC0000' },
  { id: 'caixabank', name: 'CaixaBank', emoji: '⭐', color: '#007BC4' },
  { id: 'sabadell', name: 'Sabadell', emoji: '🟦', color: '#0065A4' },
  { id: 'bankia', name: 'Bankia', emoji: '🟩', color: '#009B3A' },
  { id: 'ing', name: 'ING', emoji: '🦁', color: '#FF6600' },
];

export default function ConnectBankScreen({ navigation }) {
  const { setBankConnected, signOutUser } = useAuth();
  const [connecting, setConnecting] = useState(null);
  const [connected, setConnected] = useState(null);

  const handleBankSelect = (bank) => {
    setConnecting(bank.id);
    // ─────────────────────────────────────────────────
    // TODO: Replace with real Tink Link flow:
    // 1. POST to your backend → create Tink session
    // 2. Open WebBrowser.openAuthSessionAsync(tinkUrl, redirectUrl)
    // 3. Handle redirect back with auth code
    // 4. Exchange code for account data via backend
    // ─────────────────────────────────────────────────
    setTimeout(() => {
      setConnecting(null);
      setConnected(bank);
    }, 2200);
  };

  const handleContinue = () => {
    setBankConnected(true);
  };

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>

        <View style={s.header}>
          <Text style={s.title}>Conecta tu banco</Text>
          <Text style={s.subtitle}>
            Conexión segura vía Open Banking (PSD2).{'\n'}No almacenamos tus credenciales.
          </Text>
          <View style={s.badges}>
            {['🔒 Cifrado 256-bit', '✅ PSD2', '🇪🇺 Regulado'].map((b) => (
              <View key={b} style={s.badge}>
                <Text style={s.badgeText}>{b}</Text>
              </View>
            ))}
          </View>
        </View>

        {connected ? (
          // ── Success state ──
          <View style={s.successContainer}>
            <View style={s.successIcon}>
              <Text style={s.successEmoji}>✅</Text>
            </View>
            <Text style={s.successTitle}>{connected.name} conectado</Text>
            <Text style={s.successSub}>
              Hemos importado tu saldo y movimientos de forma segura.
            </Text>
            <View style={s.accountPreview}>
              <Text style={s.accountLabel}>CUENTA CORRIENTE</Text>
              <Text style={s.accountBalance}>3.240,00 €</Text>
              <Text style={s.accountIban}>ES•• •••• •••• •••• 4821</Text>
            </View>
            <TouchableOpacity style={s.continueBtn} onPress={handleContinue} activeOpacity={0.85}>
              <Text style={s.continueBtnText}>Empezar a invertir →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // ── Bank list ──
          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            <Text style={s.listLabel}>ELIGE TU BANCO</Text>
            {BANKS.map((bank) => (
              <TouchableOpacity
                key={bank.id}
                style={[s.bankRow, connecting === bank.id && s.bankRowActive]}
                onPress={() => !connecting && handleBankSelect(bank)}
                activeOpacity={0.7}
                disabled={!!connecting}
              >
                <View style={[s.bankIcon, { backgroundColor: bank.color + '15' }]}>
                  <Text style={s.bankEmoji}>{bank.emoji}</Text>
                </View>
                <Text style={s.bankName}>{bank.name}</Text>
                {connecting === bank.id ? (
                  <ActivityIndicator color={C.orange} size="small" />
                ) : (
                  <Text style={s.bankChevron}>›</Text>
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.skipBtn} onPress={() => setBankConnected(true)}>
              <Text style={s.skipText}>Lo haré después</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  safe: { flex: 1, paddingHorizontal: 24 },

  header: { paddingTop: 20, paddingBottom: 24 },
  title: { fontSize: 28, color: C.text, fontFamily: F.xbold, letterSpacing: -0.5, marginBottom: 8 },
  subtitle: { fontSize: 14, color: C.sub, fontFamily: F.regular, lineHeight: 22, marginBottom: 16 },
  badges: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  badge: {
    backgroundColor: C.greenBg,
    borderWidth: 1, borderColor: C.greenBorder,
    borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10,
  },
  badgeText: { fontSize: 11, color: C.green, fontFamily: F.semibold },

  listLabel: {
    fontSize: 11, color: C.muted, fontFamily: F.semibold,
    letterSpacing: 2, marginBottom: 12,
  },
  bankRow: {
    backgroundColor: C.card,
    borderRadius: 16, padding: 18,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  bankRowActive: { borderColor: C.orange, backgroundColor: C.orangeLight },
  bankIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bankEmoji: { fontSize: 20 },
  bankName: { flex: 1, fontSize: 15, color: C.text, fontFamily: F.semibold },
  bankChevron: { fontSize: 22, color: C.muted },

  skipBtn: { alignItems: 'center', paddingVertical: 24 },
  skipText: { fontSize: 14, color: C.muted, fontFamily: F.medium },

  // Success
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  successIcon: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: C.greenBg, borderWidth: 1, borderColor: C.greenBorder,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  successEmoji: { fontSize: 36 },
  successTitle: { fontSize: 24, color: C.text, fontFamily: F.xbold, marginBottom: 8, textAlign: 'center' },
  successSub: { fontSize: 14, color: C.sub, fontFamily: F.regular, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  accountPreview: {
    backgroundColor: C.card, borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: C.border, width: '100%', marginBottom: 28,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  accountLabel: { fontSize: 10, color: C.muted, fontFamily: F.semibold, letterSpacing: 2, marginBottom: 8 },
  accountBalance: { fontSize: 36, color: C.text, fontFamily: F.xbold, letterSpacing: -1, marginBottom: 4 },
  accountIban: { fontSize: 13, color: C.muted, fontFamily: F.regular },
  continueBtn: {
    backgroundColor: C.orange, borderRadius: 16, paddingVertical: 18,
    paddingHorizontal: 40, width: '100%', alignItems: 'center',
    shadowColor: C.orange, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  continueBtnText: { fontSize: 16, color: '#FFFFFF', fontFamily: F.bold },
});
