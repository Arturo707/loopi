import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { auth, db } from '../config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  signInWithCredential,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
} from 'firebase/auth';
// GoogleSignin is native-only — require() conditionally to avoid crashing on web
if (Platform.OS !== 'web') {
  try {
    const { GoogleSignin } = require('@react-native-google-signin/google-signin');
    GoogleSignin.configure({
      webClientId: '951562367501-g8s43mcsqtk0ns3lfa2kf1dn6brtljo7.apps.googleusercontent.com',
      iosClientId: '951562367501-reja207jkir1hivac3j5divi6jepae9r.apps.googleusercontent.com',
      offlineAccess: false,
    });
  } catch (e) {
    console.warn('[Auth] GoogleSignin configure failed:', e.message);
  }
}

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
    // Complete Google redirect sign-in if we just came back from Google OAuth
    if (Platform.OS === 'web') {
      getRedirectResult(auth).catch(err =>
        console.warn('[Auth] getRedirectResult error:', err.code, err.message)
      );
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('[Auth] Auth state changed:', firebaseUser?.email || 'no user');
      setUser(firebaseUser);

      if (!firebaseUser) {
        setBankConnectedState(false);
        setOnboardingDoneState(false);
        if (Platform.OS === 'web') { ls.set(KEYS.bank, false); ls.set(KEYS.onboarding, false); }
        setAuthLoading(false);
        return;
      }

      // Authoritative cross-device state from Firestore — resolve BEFORE clearing authLoading
      // so the navigator never shows the wrong screen on startup.
      try {
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          console.log('[Auth] Firestore profile:', JSON.stringify(data));
          if (data.bankConnected === true) {
            setBankConnectedState(true);
            if (Platform.OS === 'web') ls.set(KEYS.bank, true);
          }
          const profileComplete =
            data.onboardingDone === true &&
            !!data.dateOfBirth &&
            !!data.riskProfile &&
            !!data.firstName;
          console.log('[Auth] Navigation decision:', {
            isAuthenticated: true,
            onboardingComplete: profileComplete,
            hasDateOfBirth: !!data.dateOfBirth,
            hasRiskProfile: !!data.riskProfile,
            hasFirstName: !!data.firstName,
          });
          if (profileComplete) {
            setOnboardingDoneState(true);
            if (Platform.OS === 'web') ls.set(KEYS.onboarding, true);
          }
        } else {
          console.log('[Auth] Firestore profile: no document found');
          console.log('[Auth] Navigation decision:', { isAuthenticated: true, onboardingComplete: false, hasLiquidNetWorth: false, hasEmploymentStatus: false, hasAchRelationshipId: false });
        }
      } catch (err) {
        console.warn('[Auth] Firestore load failed:', err.message);
      } finally {
        // Always clear loading AFTER Firestore resolves so the navigator
        // has the correct onboardingDone/bankConnected state from the start.
        setAuthLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const signInWithEmail   = (email, password) => signInWithEmailAndPassword(auth, email, password).then(r => r.user);
  const registerWithEmail = async (email, password) => {
    const { user: newUser } = await createUserWithEmailAndPassword(auth, email, password);
    try {
      const appUrl = process.env.EXPO_PUBLIC_APP_URL || 'https://loopi-teal.vercel.app';
      await sendEmailVerification(newUser, { url: appUrl, handleCodeInApp: false });
    } catch (e) {
      console.warn('[Auth] sendEmailVerification failed:', e.message);
    }
    return newUser;
  };
  const reloadUser = async () => {
    await auth.currentUser?.reload();
    // Clone the user object so React detects the state change
    setUser(auth.currentUser ? Object.assign(Object.create(Object.getPrototypeOf(auth.currentUser)), auth.currentUser) : null);
    return auth.currentUser;
  };
  const signInWithGoogle = async () => {
    if (Platform.OS === 'web') {
      const provider = new GoogleAuthProvider();
      await signInWithRedirect(auth, provider);
      return; // page navigates to Google — onAuthStateChanged fires when it returns
    }
    const { GoogleSignin, statusCodes } = require('@react-native-google-signin/google-signin');
    try {
      await GoogleSignin.hasPlayServices();
      // v13+ returns { type, data }; v12 returns { idToken } directly
      const signInResult = await GoogleSignin.signIn();
      console.log('[Google Sign-In] signInResult:', JSON.stringify(signInResult));
      if (signInResult.type === 'cancelled') return null;
      const idToken = signInResult.data?.idToken ?? signInResult.idToken;
      console.log('[Google Sign-In] idToken present:', !!idToken);
      if (!idToken) throw new Error('No idToken returned (type=' + (signInResult.type ?? 'unknown') + ')');
      const credential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(auth, credential);
      return result.user;
    } catch (err) {
      // User dismissed the Google picker — treat as silent cancel
      if (err.code === statusCodes.SIGN_IN_CANCELLED) return null;
      // Normalize Google SDK errors (numeric code, no message) to a readable string
      throw new Error(err.message || 'Google Sign-In error (code: ' + (err.code ?? JSON.stringify(err)) + ')');
    }
  };
  // actionCodeSettings tells Firebase where to redirect after the user resets
  // their password — without it, Firebase sends them to a generic Google page.
  const resetPassword = (email) =>
    sendPasswordResetEmail(auth, email, {
      url: process.env.EXPO_PUBLIC_APP_URL || 'https://loopi-teal.vercel.app',
      handleCodeInApp: false,
    });

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
      signInWithEmail, registerWithEmail, signInWithGoogle, resetPassword, signOutUser,
      reloadUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
