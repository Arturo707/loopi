import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  ScrollView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { doc, setDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../config/firebase';
import { C } from '../constants/colors';
import { F } from '../constants/fonts';

// Supported Spanish banks — display only. Tink shows its own bank selector.
const BANKS = [
  { id: 'bbva',       name: 'BBVA',       color: '#004481' },
  { id: 'santander',  name: 'Santander',  color: '#EC0000' },
  { id: 'caixabank',  name: 'CaixaBank',  color: '#007BC4' },
  { id: 'sabadell',   name: 'Sabadell',   color: '#0065A4' },
  { id: 'ing',        name: 'ING',        color: '#FF6600' },
  { id: 'openbank',   name: 'Openbank',   color: '#00897B' },
];

const API_BASE = process.env.EXPO_PUBLIC_API_URL || '';
const REDIRECT_URI =
  process.env.EXPO_PUBLIC_TINK_REDIRECT_URI ||
  (Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.origin
    : 'https://loopi-teal.vercel.app');

async function apiFetch(path, options) {
  const res = await fetch(`${API_BASE}${path}`, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export default function ConnectBankScreen() {
  const { setBankConnected } = useAuth();

  const [phase, setPhase] = useState('idle'); // idle | connecting | success | error
  const [errorMsg, setErrorMsg] = useState(null);
  const [account, setAccount] = useState(null); // { balance, currency, accountId, iban }
  const handledRef = useRef(false);

  const formatBalance = (amount, currency = 'EUR') =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(amount);

  const formatIban = (iban) => {
    if (!iban) return null;
    return `${iban.slice(0, 4)} •••• •••• •••• ${iban.slice(-4)}`;
  };

  // ── Main connect flow ─────────────────────────────────────────────
  const handleConnect = async () => {
    if (phase === 'connecting') return;
    handledRef.current = false;
    setPhase('connecting');
    setErrorMsg(null);

    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Debes iniciar sesión primero.');

      // 1. Get Tink Link URL from server (creates/reuses permanent Tink user)
      const { url: tinkUrl } = await apiFetch('/api/tink-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid }),
      });

      // 2. Open Tink Link — user logs into their bank inside Tink's UI
      const result = await WebBrowser.openAuthSessionAsync(tinkUrl, REDIRECT_URI);

      if (handledRef.current) return; // already handled (shouldn't happen, but guard)

      if (result.type !== 'success') {
        setPhase('idle');
        setErrorMsg('Proceso cancelado. Pulsa el botón para intentarlo de nuevo.');
        return;
      }

      // 3. Extract the authorization code from the redirect URL
      const urlObj = new URL(result.url);
      const code = urlObj.searchParams.get('code');
      if (!code) throw new Error('No se recibió el código de autorización de Tink.');

      handledRef.current = true;

      // 4. Exchange code for token + fetch real balance (server-side)
      const bankData = await apiFetch('/api/tink-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      setAccount(bankData);
      setPhase('success');
    } catch (err) {
      console.error('[ConnectBank]', err.message);
      setPhase('error');
      setErrorMsg(err.message || 'Algo salió mal. Inténtalo de nuevo.');
    }
  };

  // ── Save to Firestore and enter the app ───────────────────────────
  const handleContinue = async () => {
    setPhase('saving');
    try {
      const uid = auth.currentUser?.uid;
      if (uid && account) {
        await setDoc(
          doc(db, 'users', uid),
          {
            bankAccount: {
              accountId: account.accountId,
              balance: account.balance,
              currency: account.currency,
              iban: account.iban,
              accessToken: account.accessToken,
              expiresAt: account.expiresAt,
              connectedAt: Date.now(),
            },
          },
          { merge: true }
        );
      }
      setBankConnected(true);
    } catch (err) {
      console.warn('[ConnectBank] Save failed, proceeding anyway:', err.message);
      setBankConnected(true);
    }
  };

  const isConnecting = phase === 'connecting';
  const isSaving = phase === 'saving';

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>

        {phase === 'success' ? (
          // ── Success screen ────────────────────────────────────────
          <View style={s.successContainer}>
            <View style={s.checkCircle}>
              <Text style={s.checkEmoji}>✅</Text>
            </View>
            <Text style={s.successTitle}>¡Banco conectado!</Text>
            <Text style={s.successSub}>
              Tus datos financieros se han importado de forma segura.
            </Text>

            <View style={s.balanceCard}>
              <Text style={s.balanceLabel}>SALDO DISPONIBLE</Text>
              <Text style={s.balanceAmount}>
                {formatBalance(account.balance, account.currency)}
              </Text>
              {account.iban && (
                <Text style={s.balanceIban}>{formatIban(account.iban)}</Text>
              )}
            </View>

            <TouchableOpacity
              style={s.ctaBtn}
              onPress={handleContinue}
              activeOpacity={0.85}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={s.ctaBtnText}>Empezar a invertir →</Text>
              )}
            </TouchableOpacity>
          </View>

        ) : (
          // ── Connect screen ────────────────────────────────────────
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

            <Text style={s.title}>Conecta tu banco</Text>
            <Text style={s.subtitle}>
              Acceso de solo lectura. Loopi nunca ve tus credenciales.{'\n'}
              Tecnología Open Banking certificada por la UE (PSD2).
            </Text>

            {/* Trust badges */}
            <View style={s.badges}>
              {['🔒 Cifrado 256-bit', '✅ PSD2', '🇪🇺 Regulado', '👁️ Solo lectura'].map((b) => (
                <View key={b} style={s.badge}>
                  <Text style={s.badgeText}>{b}</Text>
                </View>
              ))}
            </View>

            {/* Spanish bank logos (display only — Tink shows its own selector) */}
            <Text style={s.supportedLabel}>BANCOS COMPATIBLES</Text>
            <View style={s.bankGrid}>
              {BANKS.map((bank) => (
                <View key={bank.id} style={s.bankPill}>
                  <View style={[s.bankDot, { backgroundColor: bank.color }]} />
                  <Text style={s.bankPillName}>{bank.name}</Text>
                </View>
              ))}
            </View>

            {/* Error message */}
            {errorMsg && (
              <View style={s.errorBanner}>
                <Text style={s.errorText}>{errorMsg}</Text>
              </View>
            )}

            {/* Main CTA */}
            <TouchableOpacity
              style={[s.ctaBtn, isConnecting && s.ctaBtnLoading]}
              onPress={handleConnect}
              activeOpacity={0.85}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <View style={s.ctaRow}>
                  <ActivityIndicator color="#FFF" size="small" />
                  <Text style={s.ctaBtnText}>Abriendo Tink...</Text>
                </View>
              ) : (
                <Text style={s.ctaBtnText}>Conectar mi banco →</Text>
              )}
            </TouchableOpacity>

            {/* Powered by Tink */}
            <Text style={s.poweredBy}>Conexión segura vía Tink (Visa) · Open Banking</Text>

            {/* Skip */}
            <TouchableOpacity
              style={s.skipBtn}
              onPress={() => setBankConnected(true)}
              disabled={isConnecting}
            >
              <Text style={s.skipText}>Lo haré después</Text>
            </TouchableOpacity>

          </ScrollView>
        )}

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
  safe: { flex: 1, paddingHorizontal: 24 },
  scroll: { paddingTop: 24, paddingBottom: 40 },

  title: { fontSize: 30, color: C.text, fontFamily: F.xbold, letterSpacing: -0.5, marginBottom: 10 },
  subtitle: { fontSize: 14, color: C.sub, fontFamily: F.regular, lineHeight: 22, marginBottom: 20 },

  badges: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 32 },
  badge: {
    backgroundColor: C.greenBg, borderWidth: 1, borderColor: C.greenBorder,
    borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10,
  },
  badgeText: { fontSize: 11, color: C.green, fontFamily: F.semibold },

  supportedLabel: {
    fontSize: 11, color: C.muted, fontFamily: F.semibold,
    letterSpacing: 2, marginBottom: 12,
  },
  bankGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 32 },
  bankPill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14,
  },
  bankDot: { width: 8, height: 8, borderRadius: 4 },
  bankPillName: { fontSize: 13, color: C.text, fontFamily: F.semibold },

  errorBanner: {
    backgroundColor: '#FFF1F2', borderWidth: 1, borderColor: '#FECDD3',
    borderRadius: 14, padding: 14, marginBottom: 20,
  },
  errorText: { fontSize: 13, color: C.red, fontFamily: F.medium, textAlign: 'center' },

  ctaBtn: {
    backgroundColor: C.orange, borderRadius: 18, paddingVertical: 18,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.orange, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 14, elevation: 7,
    marginBottom: 16,
  },
  ctaBtnLoading: { opacity: 0.8 },
  ctaBtnText: { fontSize: 17, color: '#FFF', fontFamily: F.bold, letterSpacing: 0.2 },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  poweredBy: { fontSize: 11, color: C.muted, fontFamily: F.regular, textAlign: 'center', marginBottom: 24 },

  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipText: { fontSize: 14, color: C.muted, fontFamily: F.medium },

  // Success
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  checkCircle: {
    width: 88, height: 88, borderRadius: 28,
    backgroundColor: C.greenBg, borderWidth: 1, borderColor: C.greenBorder,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  checkEmoji: { fontSize: 40 },
  successTitle: { fontSize: 28, color: C.text, fontFamily: F.xbold, letterSpacing: -0.5, marginBottom: 10, textAlign: 'center' },
  successSub: { fontSize: 14, color: C.sub, fontFamily: F.regular, textAlign: 'center', lineHeight: 22, marginBottom: 32 },

  balanceCard: {
    backgroundColor: C.card, borderRadius: 24, padding: 28,
    borderWidth: 1, borderColor: C.border, width: '100%', marginBottom: 32,
    ...cardShadow,
  },
  balanceLabel: { fontSize: 10, color: C.muted, fontFamily: F.semibold, letterSpacing: 2, marginBottom: 10 },
  balanceAmount: { fontSize: 40, color: C.text, fontFamily: F.xbold, letterSpacing: -1.5, marginBottom: 6 },
  balanceIban: { fontSize: 13, color: C.muted, fontFamily: F.regular },
});
