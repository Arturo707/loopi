import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { C } from '../constants/colors';
import { F } from '../constants/fonts';

export default function VerifyEmailScreen() {
  const { user, resendVerification, reloadUser, signOutUser } = useAuth();
  const [loading, setLoading]   = useState(false);
  const [resent,  setResent]    = useState(false);
  const [error,   setError]     = useState(null);

  const handleResend = async () => {
    setError(null);
    setResent(false);
    setLoading(true);
    try {
      await resendVerification();
      setResent(true);
    } catch (err) {
      setError('Could not resend. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerified = async () => {
    setError(null);
    setLoading(true);
    try {
      const refreshed = await reloadUser();
      if (!refreshed?.emailVerified) {
        setError('Please verify your email first. Check your inbox.');
      }
      // If verified, onAuthStateChanged fires and navigator auto-advances
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.content}>
        <Text style={s.icon}>✉️</Text>
        <Text style={s.title}>Check your inbox</Text>
        <Text style={s.body}>
          We sent a verification link to{' '}
          <Text style={s.email}>{user?.email}</Text>.
          {'\n'}Check your inbox — and your spam folder just in case.
        </Text>
        <Text style={s.spamHint}>
          Can't find it? Check your spam or junk folder. Sometimes it hides there.
        </Text>

        {error  && <Text style={s.error}>{error}</Text>}
        {resent && <Text style={s.success}>Verification email resent!</Text>}

        <TouchableOpacity
          style={[s.primaryBtn, loading && { opacity: 0.6 }]}
          onPress={handleVerified}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.primaryBtnText}>I verified it ✓</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={s.secondaryBtn}
          onPress={handleResend}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Text style={s.secondaryBtnText}>Resend email</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={signOutUser} activeOpacity={0.7} style={s.signOut}>
          <Text style={s.signOutText}>Use a different account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32,
  },
  icon:  { fontSize: 56, marginBottom: 20 },
  title: { fontSize: 26, fontFamily: F.xbold, color: C.text, marginBottom: 12, textAlign: 'center' },
  body:  { fontSize: 15, fontFamily: F.regular, color: C.sub, lineHeight: 24, textAlign: 'center', marginBottom: 10 },
  email: { fontFamily: F.bold, color: C.text },

  spamHint: { fontSize: 12, fontFamily: F.regular, color: '#999', textAlign: 'center', marginBottom: 28, lineHeight: 18 },
  error:   { color: C.red, fontFamily: F.medium, fontSize: 13, textAlign: 'center', marginBottom: 12 },
  success: { color: C.green, fontFamily: F.medium, fontSize: 13, textAlign: 'center', marginBottom: 12 },

  primaryBtn: {
    width: '100%', backgroundColor: C.orange, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginBottom: 12,
    shadowColor: C.orange, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 5,
  },
  primaryBtnText: { color: '#FFF', fontFamily: F.semibold, fontSize: 16 },

  secondaryBtn: {
    width: '100%', borderWidth: 1.5, borderColor: C.border,
    borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 24,
  },
  secondaryBtnText: { color: C.text, fontFamily: F.medium, fontSize: 15 },

  signOut: { marginTop: 8 },
  signOutText: { fontSize: 13, color: C.muted, fontFamily: F.regular },
});
