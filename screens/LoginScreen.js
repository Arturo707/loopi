// v3
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { C } from '../constants/colors';
import { F } from '../constants/fonts';

const ERROR_MESSAGES = {
  'auth/invalid-email':            'That email address is not valid.',
  'auth/user-not-found':           'No account found with that email.',
  'auth/wrong-password':           'Incorrect password.',
  'auth/invalid-credential':       'Incorrect email or password.',
  'auth/email-already-in-use':     'An account with that email already exists.',
  'auth/weak-password':            'Password must be at least 6 characters.',
  'auth/too-many-requests':        'Too many attempts. Try again later.',
  'auth/network-request-failed':   'Network error. Check your connection.',
};

export default function LoginScreen() {
  const { signInWithEmail, registerWithEmail, resetPassword, signInWithGoogle } = useAuth();

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resetSent, setResetSent] = useState(false);

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      // AuthContext.user updates → RootNavigator renders correct screen automatically
    } catch (err) {
      console.log('[Google Sign-In] error:', err);
      setError(ERROR_MESSAGES[err.code] ?? 'Google sign-in failed. Try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setError(null);
    setResetSent(false);
    if (!email.trim()) {
      setError('Enter your email to reset your password.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(email.trim());
      setResetSent(true);
    } catch (err) {
      setError(ERROR_MESSAGES[err.code] ?? `Error: ${err.code}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmail(email.trim(), password);
      } else {
        await registerWithEmail(email.trim(), password);
      }
      // AuthContext.user updates → RootNavigator renders correct screen automatically
    } catch (err) {
      setError(ERROR_MESSAGES[err.code] ?? `Error: ${err.code}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={s.container}>
        <SafeAreaView style={s.safe}>

          {/* Logo */}
          <View style={s.logoArea}>
              <Text style={s.logo}>Loopi</Text>
            <Text style={s.tagline}>Inflation's winning. Start playing.</Text>
          </View>

          {/* Form */}
          <View style={s.form}>
            {/* Google Sign-In */}
            <TouchableOpacity
              style={[s.googleBtn, (loading || googleLoading) && { opacity: 0.7 }]}
              onPress={handleGoogleSignIn}
              disabled={loading || googleLoading}
              activeOpacity={0.85}
            >
              {googleLoading ? (
                <ActivityIndicator color="#1a1a1a" size="small" />
              ) : (
                <>
                  <Text style={s.googleG}>G</Text>
                  <Text style={s.googleTxt}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerTxt}>or</Text>
              <View style={s.dividerLine} />
            </View>

            {/* Mode toggle */}
            <View style={s.toggle}>
              <TouchableOpacity
                style={[s.toggleBtn, mode === 'login' && s.toggleBtnActive]}
                onPress={() => { setMode('login'); setError(null); setResetSent(false); }}
              >
                <Text style={[s.toggleText, mode === 'login' && s.toggleTextActive]}>
                  Sign in
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.toggleBtn, mode === 'register' && s.toggleBtnActive]}
                onPress={() => { setMode('register'); setError(null); setResetSent(false); }}
              >
                <Text style={[s.toggleText, mode === 'register' && s.toggleTextActive]}>
                  Sign up
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={s.input}
              placeholder="Email"
              placeholderTextColor={C.muted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              editable={!loading}
            />
            <TextInput
              style={s.input}
              placeholder="Password"
              placeholderTextColor={C.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              editable={!loading}
            />

            {error && (
              <Text style={s.errorText}>{error}</Text>
            )}
            {resetSent && (
              <Text style={s.successText}>
                We sent a link to {email.trim()}. Check your inbox.
              </Text>
            )}

            <TouchableOpacity
              style={[s.primaryBtn, loading && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={s.primaryBtnText}>
                  {mode === 'login' ? 'Sign in' : 'Create account'}
                </Text>
              )}
            </TouchableOpacity>

            {mode === 'login' && (
              <TouchableOpacity
                onPress={handleResetPassword}
                disabled={loading}
                activeOpacity={0.7}
                style={s.resetLink}
              >
                <Text style={s.resetLinkText}>Forgot your password?</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={s.terms}>
            By continuing you agree to our{' '}
            <Text style={s.termsLink}>Terms of Use</Text>
            {' '}and{' '}
            <Text style={s.termsLink}>Privacy Policy</Text>.
          </Text>

        </SafeAreaView>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: C.bg },
  safe: { flex: 1, paddingHorizontal: 28 },

  // Logo
  logoArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 24 },
  logo: { fontSize: 42, color: '#FF6B35', fontFamily: 'Pacifico_400Regular', letterSpacing: 0, marginBottom: 4, paddingHorizontal: 8 },
  tagline: { fontSize: 15, color: C.sub, fontFamily: F.medium },

  // Form
  form: { paddingBottom: 16 },

  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFF', borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 12, height: 52, marginBottom: 16,
  },
  googleG:   { fontSize: 18, fontWeight: '700', color: '#4285F4', marginRight: 10 },
  googleTxt: { fontSize: 15, color: '#1a1a1a', fontFamily: F.medium },

  divider: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerTxt: { marginHorizontal: 12, fontSize: 13, color: C.muted, fontFamily: F.regular },

  toggle: {
    flexDirection: 'row',
    backgroundColor: C.border,
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
  },
  toggleBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: C.card,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  toggleText: { fontSize: 14, fontFamily: F.medium, color: C.muted },
  toggleTextActive: { color: C.text, fontFamily: F.semibold },

  input: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: F.regular,
    color: C.text,
    marginBottom: 10,
  },

  errorText: {
    color: C.red,
    fontFamily: F.medium,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 10,
  },

  primaryBtn: {
    backgroundColor: C.orange,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    shadowColor: C.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  primaryBtnText: { color: '#FFF', fontFamily: F.semibold, fontSize: 16 },

  resetLink: { alignItems: 'center', marginTop: 12 },
  resetLinkText: { fontSize: 13, color: C.orange, fontFamily: F.medium },

  successText: {
    color: C.green, fontFamily: F.medium, fontSize: 13,
    textAlign: 'center', marginBottom: 10,
  },

  terms: {
    fontSize: 11, color: C.muted, fontFamily: F.regular,
    textAlign: 'center', lineHeight: 17, paddingBottom: 24,
  },
  termsLink: { color: C.orange, fontFamily: F.medium },
});
