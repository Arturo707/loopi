import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { C } from '../constants/colors';
import { F } from '../constants/fonts';

const DISCLAIMER = `Not financial advice. Loopi, Inc. is not a registered broker-dealer, investment adviser, or financial planner. Nothing on this app — including the Loopi Score, vibe checks, feed rankings, or any accompanying commentary — constitutes investment advice, a recommendation, an offer, or a solicitation to buy or sell any security, and should not be relied upon in making any investment decision. All content is provided for informational and entertainment purposes only.

Securities-related services, when available, are offered through a third-party registered broker-dealer partner; all brokerage accounts and trades are held and executed by that partner, not by Loopi. Investing involves risk, including the possible loss of principal. Past performance does not guarantee future results. Fractional shares, market data, and availability of specific securities are subject to the terms and restrictions of our broker-dealer partner and applicable law.

Loopi makes no representations or warranties as to the accuracy, completeness, timeliness, or reliability of any information on this app, and expressly disclaims any and all liability arising from reliance on it to the fullest extent permitted by law. You are solely responsible for your own investment decisions; consider consulting a licensed financial, tax, or legal professional before acting.`;

export default function ProfileScreen() {
  const { user, signOutUser } = useAuth();
  const [disclaimerVisible, setDisclaimerVisible] = useState(false);

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

          <TouchableOpacity style={s.legalBtn} onPress={() => setDisclaimerVisible(true)} activeOpacity={0.85}>
            <Text style={s.legalTxt}>Legal & Disclaimers</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.deleteBtn} onPress={handleDeleteAccount} activeOpacity={0.85}>
            <Text style={s.deleteTxt}>Delete account</Text>
          </TouchableOpacity>
        </View>

      </SafeAreaView>

      {/* Legal Disclaimer Modal */}
      <Modal
        visible={disclaimerVisible}
        animationType="slide"
        onRequestClose={() => setDisclaimerVisible(false)}
      >
        <SafeAreaView style={s.modalSafe}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => setDisclaimerVisible(false)} activeOpacity={0.7} style={s.modalClose}>
              <Text style={s.modalCloseText}>✕</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>Legal & Disclaimers</Text>
            <View style={s.modalClose} />
          </View>
          <ScrollView style={s.modalScroll} contentContainerStyle={s.modalContent}>
            <Text style={s.modalBody}>{DISCLAIMER}</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>

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

  legalBtn: {
    backgroundColor: C.card, borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', borderWidth: 1, borderColor: C.border,
  },
  legalTxt: { fontSize: 15, fontFamily: F.semibold, color: C.muted },

  deleteBtn: {
    backgroundColor: C.card, borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', borderWidth: 1, borderColor: '#FFD5D5',
  },
  deleteTxt: { fontSize: 15, fontFamily: F.semibold, color: C.red },

  // Disclaimer modal
  modalSafe: { flex: 1, backgroundColor: C.bg },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  modalClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  modalCloseText: { fontSize: 16, color: C.muted },
  modalTitle: { fontSize: 17, fontFamily: F.bold, color: C.text },
  modalScroll: { flex: 1 },
  modalContent: { paddingHorizontal: 24, paddingVertical: 24 },
  modalBody: {
    fontSize: 14, fontFamily: F.regular, color: C.sub,
    lineHeight: 22, letterSpacing: 0.1,
  },
});
