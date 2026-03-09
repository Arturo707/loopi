import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { C } from '../constants/colors';
import { F } from '../constants/fonts';

export default function ProfileScreen() {
  const { user, signOutUser } = useAuth();

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'To delete your account, please contact our support team.',
      [{ text: 'OK' }]
    );
  };

  const displayName = user?.displayName || 'Loopi User';
  const email = user?.email || '';
  const initial = (displayName[0] || 'L').toUpperCase();

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>

        <Text style={s.screenTitle}>Profile</Text>

        {/* Avatar + name + email */}
        <View style={s.profileCard}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initial}</Text>
          </View>
          <Text style={s.name}>{displayName}</Text>
          <Text style={s.email}>{email}</Text>
        </View>

        {/* Actions */}
        <View style={s.actions}>
          <TouchableOpacity style={s.signOutBtn} onPress={signOutUser} activeOpacity={0.85}>
            <Text style={s.signOutTxt}>Sign out</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.deleteBtn} onPress={handleDeleteAccount} activeOpacity={0.85}>
            <Text style={s.deleteTxt}>Delete account</Text>
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  safe: { flex: 1, paddingHorizontal: 24 },

  screenTitle: {
    fontSize: 28, fontFamily: F.xbold, color: C.text,
    letterSpacing: -0.5, paddingTop: 20, paddingBottom: 32,
  },

  profileCard: {
    backgroundColor: C.card, borderRadius: 24, padding: 28,
    alignItems: 'center', borderWidth: 1, borderColor: C.border,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
    marginBottom: 24,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
    shadowColor: C.orange, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 5,
  },
  avatarText: { fontSize: 30, color: '#FFF', fontFamily: F.xbold },
  name: { fontSize: 20, fontFamily: F.bold, color: C.text, marginBottom: 6 },
  email: { fontSize: 14, fontFamily: F.regular, color: C.muted },

  actions: { gap: 12 },

  signOutBtn: {
    backgroundColor: C.card, borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', borderWidth: 1, borderColor: C.border,
  },
  signOutTxt: { fontSize: 15, fontFamily: F.semibold, color: C.text },

  deleteBtn: {
    backgroundColor: C.card, borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', borderWidth: 1, borderColor: '#FFD5D5',
  },
  deleteTxt: { fontSize: 15, fontFamily: F.semibold, color: C.red },
});
