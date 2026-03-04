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
  'auth/invalid-email':            'El correo no es válido.',
  'auth/user-not-found':           'No existe una cuenta con ese correo.',
  'auth/wrong-password':           'Contraseña incorrecta.',
  'auth/invalid-credential':       'Correo o contraseña incorrectos.',
  'auth/email-already-in-use':     'Ya existe una cuenta con ese correo.',
  'auth/weak-password':            'La contraseña debe tener al menos 6 caracteres.',
  'auth/too-many-requests':        'Demasiados intentos. Inténtalo más tarde.',
  'auth/network-request-failed':   'Error de red. Comprueba tu conexión.',
};

export default function LoginScreen() {
  const { signInWithEmail, registerWithEmail, resetPassword } = useAuth();

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resetSent, setResetSent] = useState(false);

  const handleResetPassword = async () => {
    setError(null);
    setResetSent(false);
    if (!email.trim()) {
      setError('Introduce tu correo para restablecer la contraseña.');
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
      setError('Por favor introduce tu correo y contraseña.');
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
            <View style={s.logoMark}>
              <Text style={s.logoMarkText}>∞</Text>
            </View>
            <Text style={s.logo}>loopi</Text>
            <Text style={s.tagline}>Invierte en lo que crees.</Text>
          </View>

          {/* Form */}
          <View style={s.form}>
            {/* Mode toggle */}
            <View style={s.toggle}>
              <TouchableOpacity
                style={[s.toggleBtn, mode === 'login' && s.toggleBtnActive]}
                onPress={() => { setMode('login'); setError(null); setResetSent(false); }}
              >
                <Text style={[s.toggleText, mode === 'login' && s.toggleTextActive]}>
                  Iniciar sesión
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.toggleBtn, mode === 'register' && s.toggleBtnActive]}
                onPress={() => { setMode('register'); setError(null); setResetSent(false); }}
              >
                <Text style={[s.toggleText, mode === 'register' && s.toggleTextActive]}>
                  Registrarse
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={s.input}
              placeholder="Correo electrónico"
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
              placeholder="Contraseña"
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
                Hemos enviado un enlace a {email.trim()}. Revisa tu bandeja de entrada.
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
                  {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
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
                <Text style={s.resetLinkText}>¿Olvidaste tu contraseña?</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={s.terms}>
            Al continuar aceptas los{' '}
            <Text style={s.termsLink}>Términos de uso</Text>
            {' '}y la{' '}
            <Text style={s.termsLink}>Política de privacidad</Text>.
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
  logoMark: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
    shadowColor: C.orange, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35, shadowRadius: 20, elevation: 8,
  },
  logoMarkText: { fontSize: 32, color: '#FFF', fontFamily: F.xbold },
  logo: { fontSize: 42, color: C.orange, fontFamily: F.xbold, letterSpacing: -2, marginBottom: 4 },
  tagline: { fontSize: 15, color: C.sub, fontFamily: F.medium },

  // Form
  form: { paddingBottom: 16 },

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
