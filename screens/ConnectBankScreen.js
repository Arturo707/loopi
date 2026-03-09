import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  ScrollView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { doc, setDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../config/firebase';
import { C } from '../constants/colors';
import { F } from '../constants/fonts';

const BANKS = [
  { id: 'bbva',      name: 'BBVA',      color: '#004481' },
  { id: 'santander', name: 'Santander', color: '#EC0000' },
  { id: 'caixabank', name: 'CaixaBank', color: '#007BC4' },
  { id: 'sabadell',  name: 'Sabadell',  color: '#0065A4' },
  { id: 'ing',       name: 'ING',       color: '#FF6600' },
  { id: 'openbank',  name: 'Openbank',  color: '#00897B' },
];

const API_BASE = process.env.EXPO_PUBLIC_API_URL || '';
// Native redirect — must be registered in Tink console as well
const NATIVE_REDIRECT = Linking.createURL('/bank-callback');

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
  const [account, setAccount] = useState(null);

  // ── Web: detect ?code= on mount (return from Tink redirect) ───────
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;

    console.log('[ConnectBank] Detected Tink code in URL, exchanging...');
    // Remove code from URL so a page refresh doesn't re-process it
    window.history.replaceState({}, '', window.location.pathname);
    exchangeCode(code);
  }, []);

  // ── Exchange code → real balance ──────────────────────────────────
  const exchangeCode = async (code) => {
    setPhase('connecting');
    setErrorMsg(null);
    console.log('[ConnectBank] Calling /api/tink-token with code:', code.slice(0, 24) + '…');
    try {
      const bankData = await apiFetch('/api/tink-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      console.log('[ConnectBank] tink-token response:', {
        accountId: bankData.accountId,
        balance: bankData.balance,
        currency: bankData.currency,
        iban: bankData.iban ? bankData.iban.slice(0, 6) + '…' : null,
        hasAccessToken: !!bankData.accessToken,
      });
      setAccount(bankData);
      setPhase('success');
    } catch (err) {
      console.error('[ConnectBank] Token exchange failed:', err.message);
      setPhase('error');
      setErrorMsg(err.message || 'Failed to verify bank. Try again.');
    }
  };

  // ── Button press: get Tink URL then launch flow ───────────────────
  const handleConnect = async () => {
    if (phase === 'connecting') return;
    setPhase('connecting');
    setErrorMsg(null);

    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('You must be signed in first.');

      console.log('[ConnectBank] Requesting Tink auth URL for uid:', uid);
      const { url: tinkUrl } = await apiFetch('/api/tink-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid }),
      });
      console.log('[ConnectBank] Tink Link URL:', tinkUrl);

      if (Platform.OS === 'web') {
        // ── Web: navigate current tab directly ──────────────────────
        console.log('[ConnectBank] Navigating to Tink (web full-tab redirect)…');
        window.location.href = tinkUrl;
      } else {
        // ── Native: in-app browser session (iOS ASWebAuthenticationSession) ─
        console.log('[ConnectBank] Opening Tink in-app browser (native)…');
        const result = await WebBrowser.openAuthSessionAsync(tinkUrl, NATIVE_REDIRECT);
        console.log('[ConnectBank] WebBrowser result type:', result.type);
        console.log('[ConnectBank] WebBrowser result url:', result.url?.slice(0, 80));

        if (result.type !== 'success') {
          setPhase('idle');
          setErrorMsg('Canceled. Tap the button to try again.');
          return;
        }

        const urlObj = new URL(result.url);
        const code = urlObj.searchParams.get('code');
        if (!code) throw new Error('No authorization code received from Tink.');
        await exchangeCode(code);
      }
    } catch (err) {
      console.error('[ConnectBank] handleConnect error:', err.message);
      setPhase('error');
      setErrorMsg(err.message || 'Something went wrong. Try again.');
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
        console.log('[ConnectBank] Bank account saved to Firestore.');
      }
      setBankConnected(true);
    } catch (err) {
      console.warn('[ConnectBank] Firestore save failed, proceeding anyway:', err.message);
      setBankConnected(true);
    }
  };

  const isConnecting = phase === 'connecting';
  const isSaving = phase === 'saving';

  const formatBalance = (amount, currency = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

  const formatIban = (iban) =>
    iban ? `${iban.slice(0, 4)} •••• •••• •••• ${iban.slice(-4)}` : null;

  // ── Render ────────────────────────────────────────────────────────
  if (phase === 'success' && account) {
    return (
      <View style={s.container}>
        <SafeAreaView style={s.safe}>
          <View style={s.successContainer}>
            <View style={s.checkCircle}>
              <Text style={s.checkEmoji}>✅</Text>
            </View>
            <Text style={s.successTitle}>Bank connected!</Text>
            <Text style={s.successSub}>
              Your financial data was imported securely.
            </Text>

            <View style={s.balanceCard}>
              <Text style={s.balanceLabel}>AVAILABLE BALANCE</Text>
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
              {isSaving
                ? <ActivityIndicator color="#FFF" />
                : <Text style={s.ctaBtnText}>Start investing →</Text>
              }
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

          <Text style={s.title}>Connect your bank</Text>
          <Text style={s.subtitle}>
            Read-only access. Loopi never sees your credentials.{'\n'}
            EU-certified Open Banking (PSD2) · Powered by Tink (Visa).
          </Text>

          <View style={s.badges}>
            {['🔒 256-bit Encrypted', '✅ PSD2', '🇪🇺 Regulated', '👁️ Read-only'].map((b) => (
              <View key={b} style={s.badge}>
                <Text style={s.badgeText}>{b}</Text>
              </View>
            ))}
          </View>

          <Text style={s.supportedLabel}>SUPPORTED BANKS</Text>
          <View style={s.bankGrid}>
            {BANKS.map((bank) => (
              <View key={bank.id} style={s.bankPill}>
                <View style={[s.bankDot, { backgroundColor: bank.color }]} />
                <Text style={s.bankPillName}>{bank.name}</Text>
              </View>
            ))}
          </View>

          {errorMsg && (
            <View style={s.errorBanner}>
              <Text style={s.errorText}>{errorMsg}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[s.ctaBtn, isConnecting && s.ctaBtnLoading]}
            onPress={handleConnect}
            activeOpacity={0.85}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <View style={s.ctaRow}>
                <ActivityIndicator color="#FFF" size="small" />
                <Text style={s.ctaBtnText}>Connecting to Tink…</Text>
              </View>
            ) : (
              <Text style={s.ctaBtnText}>Connect my bank →</Text>
            )}
          </TouchableOpacity>

          <Text style={s.poweredBy}>Secure connection via Tink (Visa) · Open Banking PSD2</Text>

          <TouchableOpacity
            style={s.skipBtn}
            onPress={() => setBankConnected(true)}
            disabled={isConnecting}
          >
            <Text style={s.skipText}>I'll do this later</Text>
          </TouchableOpacity>

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

  supportedLabel: { fontSize: 11, color: C.muted, fontFamily: F.semibold, letterSpacing: 2, marginBottom: 12 },
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
    borderWidth: 1, borderColor: C.border, width: '100%', marginBottom: 32, ...cardShadow,
  },
  balanceLabel: { fontSize: 10, color: C.muted, fontFamily: F.semibold, letterSpacing: 2, marginBottom: 10 },
  balanceAmount: { fontSize: 40, color: C.text, fontFamily: F.xbold, letterSpacing: -1.5, marginBottom: 6 },
  balanceIban: { fontSize: 13, color: C.muted, fontFamily: F.regular },
});
