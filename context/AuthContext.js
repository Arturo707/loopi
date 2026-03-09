import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { auth, db } from '../config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';

// ── localStorage helpers (web only) ──────────────────────────────────────────
const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v ? localStorage.setItem(k, 'true') : localStorage.removeItem(k); } catch {} },
};
const KEYS = { bank: 'loopi_bankConnected', onboarding: 'loopi_onboardingDone' };

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]             = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [bankConnected, setBankConnectedState]       = useState(Platform.OS === 'web' ? ls.get(KEYS.bank) === 'true' : false);
  const [onboardingDone, setOnboardingDoneState]     = useState(Platform.OS === 'web' ? ls.get(KEYS.onboarding) === 'true' : false);

  // Persist a boolean flag to both localStorage and Firestore
  const persist = (field, localKey, setter) => (val) => {
    setter(val);
    if (Platform.OS === 'web') ls.set(localKey, val);
    const uid = auth.currentUser?.uid;
    if (uid) setDoc(doc(db, 'users', uid), { [field]: val }, { merge: true }).catch(() => {});
  };

  const setBankConnected   = persist('bankConnected',   KEYS.bank,        setBankConnectedState);
  const setOnboardingDone  = persist('onboardingDone',  KEYS.onboarding,  setOnboardingDoneState);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);

      if (!firebaseUser) {
        setBankConnectedState(false);
        setOnboardingDoneState(false);
        if (Platform.OS === 'web') { ls.set(KEYS.bank, false); ls.set(KEYS.onboarding, false); }
        return;
      }

      // Authoritative cross-device state from Firestore
      try {
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          if (data.bankConnected === true) {
            setBankConnectedState(true);
            if (Platform.OS === 'web') ls.set(KEYS.bank, true);
          }
          const profileComplete =
            data.onboardingDone === true &&
            !!data.liquidNetWorth &&
            !!data.employmentStatus &&
            !!data.achRelationshipId;
          if (profileComplete) {
            setOnboardingDoneState(true);
            if (Platform.OS === 'web') ls.set(KEYS.onboarding, true);
          }
        }
      } catch (err) {
        console.warn('[Auth] Firestore load failed:', err.message);
      }
    });
    return unsubscribe;
  }, []);

  const signInWithEmail    = (email, password) => signInWithEmailAndPassword(auth, email, password).then(r => r.user);
  const registerWithEmail  = (email, password) => createUserWithEmailAndPassword(auth, email, password).then(r => r.user);
  const resetPassword      = (email)            => sendPasswordResetEmail(auth, email);

  const signOutUser = async () => {
    await signOut(auth);
    setBankConnectedState(false);
    setOnboardingDoneState(false);
    if (Platform.OS === 'web') { ls.set(KEYS.bank, false); ls.set(KEYS.onboarding, false); }
  };

  return (
    <AuthContext.Provider value={{
      user, authLoading,
      bankConnected,  setBankConnected,
      onboardingDone, setOnboardingDone,
      signInWithEmail, registerWithEmail, resetPassword, signOutUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
