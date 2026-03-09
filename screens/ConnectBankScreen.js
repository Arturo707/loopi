import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { C } from '../constants/colors';
import { F } from '../constants/fonts';

export default function ConnectBankScreen() {
  const { setBankConnected } = useAuth();

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <View style={s.content}>
          <View style={s.iconBox}>
            <Text style={s.icon}>🏦</Text>
          </View>
          <Text style={s.title}>Bank connection</Text>
          <Text style={s.subtitle}>
            Bank connection is handled during onboarding.
          </Text>
          <TouchableOpacity style={s.btn} onPress={() => setBankConnected(true)} activeOpacity={0.85}>
            <Text style={s.btnTxt}>Continue →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  safe: { flex: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  iconBox: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  icon: { fontSize: 36 },
  title: { fontSize: 26, fontFamily: F.xbold, color: C.text, letterSpacing: -0.5, marginBottom: 10, textAlign: 'center' },
  subtitle: { fontSize: 15, fontFamily: F.regular, color: C.sub, lineHeight: 24, textAlign: 'center', marginBottom: 40 },
  btn: {
    backgroundColor: C.orange, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 40,
    shadowColor: C.orange, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 5,
  },
  btnTxt: { fontSize: 16, fontFamily: F.bold, color: '#FFF' },
});
