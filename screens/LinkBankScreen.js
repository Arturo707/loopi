import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Platform, Linking,
} from 'react-native';
import { doc, setDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { db } from '../config/firebase';

// Safe require — native SDK is unavailable on web; catch prevents bundler crash
let PlaidLink = null;
try {
  PlaidLink = require('react-native-plaid-link-sdk').PlaidLink;
} catch (_) {}

const API_BASE = 'https://loopi-teal.vercel.app';

export default function LinkBankScreen({ navigation }) {
  const { user }                          = useAuth();
  const { alpacaAccountId, setAchRelationshipId } = useApp();

  const [linkToken,   setLinkToken]   = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [exchanging,  setExchanging]  = useState(false);
  const [succeeded,   setSucceeded]   = useState(false);
  const [error,       setError]       = useState(null);

  useEffect(() => {
    fetchLinkToken();
  }, []);

  // ── 1. Fetch link token ───────────────────────────────────────────────────

  const fetchLinkToken = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/plaid/create-link-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid }),
      });
      const data = await res.json();
      if (!data.link_token) throw new Error('No link token returned');
      setLinkToken(data.link_token);
    } catch (err) {
      setError('Could not initialise bank linking. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── 2. Exchange public token → ACH relationship ───────────────────────────

  const handleSuccess = async (publicToken, accountId) => {
    setExchanging(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/plaid/exchange-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          public_token:       publicToken,
          account_id:         accountId,
          alpaca_account_id:  alpacaAccountId,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Exchange failed');

      await setDoc(
        doc(db, 'users', user.uid),
        { achRelationshipId: data.ach_relationship_id },
        { merge: true }
      );
      setAchRelationshipId(data.ach_relationship_id);
      setSucceeded(true);
    } catch (err) {
      setError('Could not link your bank account. Please try again.');
    } finally {
      setExchanging(false);
    }
  };

  // ── 3. Web: open Plaid hosted link in browser ─────────────────────────────

  const openWebPlaid = () => {
    if (!linkToken) return;
    Linking.openURL(
      `https://cdn.plaid.com/link/v2/stable/link.html?token=${linkToken}`
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#00C896" />
        <Text style={s.hint}>Preparing secure connection…</Text>
      </View>
    );
  }

  if (exchanging) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#00C896" />
        <Text style={s.hint}>Connecting your bank…</Text>
      </View>
    );
  }

  if (succeeded) {
    return (
      <View style={s.center}>
        <Text style={s.successIcon}>✓</Text>
        <Text style={s.successTitle}>Bank connected</Text>
        <Text style={s.successSub}>Your bank is securely connected via Plaid</Text>
        <TouchableOpacity style={s.btn} onPress={() => navigation.goBack()}>
          <Text style={s.btnTxt}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <Text style={s.title}>Connect Your Bank</Text>
      <Text style={s.subtitle}>
        Securely link your bank account to fund your investments instantly via ACH.
      </Text>

      {error && (
        <Text style={s.errorTxt}>{error}</Text>
      )}

      {/* Native: use PlaidLink SDK component */}
      {Platform.OS !== 'web' && PlaidLink && linkToken ? (
        <PlaidLink
          tokenConfig={{ token: linkToken }}
          onSuccess={(success) => {
            const publicToken = success.publicToken;
            const accountId   = success.metadata?.accounts?.[0]?.id;
            handleSuccess(publicToken, accountId);
          }}
          onExit={(exit) => {
            if (exit?.error) {
              console.error('[Plaid] exit error:', exit.error);
              setError('Bank linking was cancelled or failed. Please try again.');
            }
          }}
        >
          <TouchableOpacity style={s.btn}>
            <Text style={s.btnTxt}>🔗 Connect Bank Account</Text>
          </TouchableOpacity>
        </PlaidLink>
      ) : Platform.OS !== 'web' && !PlaidLink ? (
        /* Native but SDK unavailable — fallback */
        <TouchableOpacity style={s.btn} onPress={openWebPlaid}>
          <Text style={s.btnTxt}>🔗 Connect Bank Account</Text>
        </TouchableOpacity>
      ) : (
        /* Web: open hosted Plaid link in browser */
        <TouchableOpacity style={s.btn} onPress={openWebPlaid} disabled={!linkToken}>
          <Text style={s.btnTxt}>🔗 Connect Bank Account</Text>
        </TouchableOpacity>
      )}

      {error && (
        <TouchableOpacity style={s.retryBtn} onPress={fetchLinkToken}>
          <Text style={s.retryTxt}>Retry</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={s.cancelBtn} onPress={() => navigation.goBack()}>
        <Text style={s.cancelTxt}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    padding: 24,
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
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
    lineHeight: 24,
    marginBottom: 40,
  },
  hint: {
    marginTop: 16,
    fontSize: 14,
    color: '#888888',
  },
  btn: {
    backgroundColor: '#00C896',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  btnTxt: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
  retryBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 4,
  },
  retryTxt: {
    color: '#00C896',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelTxt: {
    color: '#888888',
    fontSize: 14,
  },
  errorTxt: {
    color: '#ef4444',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
  },
  successIcon: {
    fontSize: 64,
    color: '#00C896',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  successSub: {
    fontSize: 15,
    color: '#888888',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 22,
  },
});
