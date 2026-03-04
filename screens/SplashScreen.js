import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { C } from '../constants/colors';
import { F } from '../constants/fonts';

export default function SplashScreen({ navigation }) {
  const { user, authLoading, bankConnected } = useAuth();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (authLoading) return;
    const timer = setTimeout(() => {
      if (user && bankConnected) {
        navigation.replace('Main');
      } else if (user && !bankConnected) {
        navigation.replace('ConnectBank');
      } else {
        navigation.replace('Login');
      }
    }, 1800);
    return () => clearTimeout(timer);
  }, [authLoading, user, bankConnected]);

  return (
    <View style={s.container}>
      <Animated.View style={[s.inner, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        <View style={s.logoMark}>
          <Text style={s.logoMarkText}>∞</Text>
        </View>
        <Text style={s.logo}>loopi</Text>
        <Text style={s.tagline}>Invierte en lo que crees.</Text>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  inner: { alignItems: 'center' },
  logoMark: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
    shadowColor: C.orange, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 24, elevation: 10,
  },
  logoMarkText: { fontSize: 40, color: '#FFF', fontFamily: F.xbold },
  logo: { fontSize: 52, color: C.orange, fontFamily: F.xbold, letterSpacing: -2, marginBottom: 8 },
  tagline: { fontSize: 16, color: C.muted, fontFamily: F.medium },
});
