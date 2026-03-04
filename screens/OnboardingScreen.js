import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const steps = [
  {
    emoji: '👋',
    title: 'Hola, inversor',
    sub: 'Sin rollos. Sin letra pequeña.\nTu dinero, creciendo.',
    btn: 'Empezar →',
  },
  {
    emoji: '🏦',
    title: 'Conecta tu banco',
    sub: 'BBVA, Santander, CaixaBank...\nUsamos Open Banking seguro (PSD2).',
    btn: 'Conectar banco →',
    input: true,
  },
  {
    emoji: '🤳',
    title: 'Tu cara = tu firma',
    sub: 'Face ID para cada movimiento.\nSin contraseñas raras.',
    btn: 'Activar Face ID →',
    face: true,
  },
];

export default function OnboardingScreen({ navigation }) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];

  const handleNext = () => {
    if (stepIndex < steps.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      navigation.replace('Main');
    }
  };

  return (
    <View style={s.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={s.progressRow}>
          {steps.map((_, i) => (
            <View key={i} style={[s.progressBar, i <= stepIndex ? s.progressActive : s.progressInactive]} />
          ))}
        </View>

        <View style={s.content}>
          <Text style={s.emoji}>{step.emoji}</Text>
          <Text style={s.title}>{step.title}</Text>
          <Text style={s.sub}>{step.sub}</Text>

          {step.input && (
            <View style={s.bankList}>
              {['BBVA', 'Santander', 'CaixaBank', 'Sabadell'].map((bank) => (
                <TouchableOpacity key={bank} style={s.bankItem} activeOpacity={0.7}>
                  <Text style={s.bankName}>{bank}</Text>
                  <Text style={s.bankArrow}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {step.face && (
            <View style={s.faceContainer}>
              <View style={s.faceFrame}>
                <Text style={s.faceEmoji}>😐</Text>
              </View>
              <Text style={s.faceLabel}>MIRANDO...</Text>
            </View>
          )}

          <View style={{ flex: 1 }} />

          <TouchableOpacity style={s.btn} onPress={handleNext} activeOpacity={0.85}>
            <Text style={s.btnText}>{step.btn}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080A0E' },
  progressRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 32,
    paddingTop: 20,
  },
  progressBar: { flex: 1, height: 3, borderRadius: 2 },
  progressActive: { backgroundColor: '#00FF88' },
  progressInactive: { backgroundColor: 'rgba(255,255,255,0.1)' },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 48,
    paddingBottom: 40,
  },
  emoji: { fontSize: 64, marginBottom: 32 },
  title: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -1,
    color: '#E8F0FE',
    marginBottom: 16,
    fontFamily: 'SpaceMono_700Bold',
    lineHeight: 36,
  },
  sub: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 26,
    marginBottom: 40,
    fontFamily: 'SpaceMono_400Regular',
  },
  bankList: { marginBottom: 24 },
  bankItem: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 8,
    backgroundColor: 'rgba(0,255,136,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0,255,136,0.15)',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bankName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E8F0FE',
    fontFamily: 'SpaceMono_700Bold',
  },
  bankArrow: { fontSize: 18, color: 'rgba(255,255,255,0.3)' },
  faceContainer: { alignItems: 'center', marginBottom: 32 },
  faceFrame: {
    width: 140,
    height: 180,
    borderWidth: 2,
    borderColor: '#00FF88',
    borderTopLeftRadius: 70,
    borderTopRightRadius: 70,
    borderBottomLeftRadius: 50,
    borderBottomRightRadius: 50,
    backgroundColor: 'rgba(0,255,136,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  faceEmoji: { fontSize: 48 },
  faceLabel: {
    fontSize: 11,
    color: '#00FF88',
    letterSpacing: 2,
    fontFamily: 'SpaceMono_700Bold',
  },
  btn: {
    backgroundColor: '#00FF88',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
  },
  btnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#080A0E',
    fontFamily: 'SpaceMono_700Bold',
    letterSpacing: 0.5,
  },
});
