import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { PlaidLink, LinkSuccess, LinkExit } from 'react-native-plaid-link-sdk';
import { doc, setDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { db } from '../config/firebase';

export default function LinkBankScreen({ navigation }) {
  const { user } = useAuth();
  const { setAchRelationshipId } = useApp();
  const [linkToken, setLinkToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLinkToken();
  }, []);

  const fetchLinkToken = async () => {
    try {
      const response = await fetch('https://loopi-teal.vercel.app/api/plaid/create-link-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid }),
      });
      const data = await response.json();
      setLinkToken(data.link_token);
    } catch (error) {
      Alert.alert('Error', 'Could not initialize bank linking. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onSuccess = async (success: LinkSuccess) => {
    try {
      setLoading(true);
      const response = await fetch('https://loopi-teal.vercel.app/api/plaid/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          public_token: success.publicToken,
          account_id: success.metadata.accounts[0].id,
          alpaca_account_id: user.alpacaAccountId,
        }),
      });
      const data = await response.json();
      if (data.success) {
        await setDoc(
          doc(db, 'users', user.uid),
          { achRelationshipId: data.ach_relationship_id },
          { merge: true }
        );
        setAchRelationshipId(data.ach_relationship_id);
        Alert.alert('Bank linked!', 'Your bank account is now connected to Loopi.');
        navigation.goBack();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      Alert.alert('Error', 'Could not link bank account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onExit = (exit: LinkExit) => {
    if (exit.error) {
      console.error('Plaid exit error:', exit.error);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00C896" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Connect Your Bank</Text>
      <Text style={styles.subtitle}>
        Securely link your bank account to fund your investments instantly.
      </Text>

      {linkToken && (
        <PlaidLink
          tokenConfig={{ token: linkToken }}
          onSuccess={onSuccess}
          onExit={onExit}
        >
          <TouchableOpacity style={styles.button}>
            <Text style={styles.buttonText}>Connect Bank Account</Text>
          </TouchableOpacity>
        </PlaidLink>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    padding: 24,
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#888888',
    marginBottom: 48,
    lineHeight: 24,
  },
  button: {
    backgroundColor: '#00C896',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
});
