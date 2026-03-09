import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { C } from '../constants/colors';
import { F } from '../constants/fonts';

export default function SplashScreen({ authLoading, onDone }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const [timerDone, setTimerDone] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => setTimerDone(true), 1800);
    return () => clearTimeout(timer);
  }, []);

  // Call onDone only when both the animation timer AND auth check are done
  useEffect(() => {
    if (timerDone && !authLoading) onDone?.();
  }, [timerDone, authLoading]);

  return (
    <View style={s.container}>
      <Animated.View style={[s.inner, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        <Text style={s.logo}>Loopi</Text>
        <Text style={s.tagline}>Inflation's winning. Start playing.</Text>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  inner: { alignItems: 'center' },
  logo: { fontSize: 52, color: '#FF6B35', fontFamily: 'Pacifico_400Regular', letterSpacing: 0, marginBottom: 8, paddingHorizontal: 8 },
  tagline: { fontSize: 16, color: C.muted, fontFamily: F.medium },
});
