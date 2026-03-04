import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { auth, googleProvider } from '../config/firebase';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
} from 'firebase/auth';

const BANK_KEY = 'loopi_bankConnected';
const loadBankConnected = () => { try { return localStorage.getItem(BANK_KEY) === 'true'; } catch { return false; } };
const saveBankConnected = (val) => { try { val ? localStorage.setItem(BANK_KEY, 'true') : localStorage.removeItem(BANK_KEY); } catch {} };

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [bankConnected, setBankConnectedState] = useState(
    Platform.OS === 'web' ? loadBankConnected() : false
  );

  const setBankConnected = (val) => {
    setBankConnectedState(val);
    if (Platform.OS === 'web') saveBankConnected(val);
  };

  useEffect(() => {
    let unsubscribe = null;

    const init = async () => {
      if (Platform.OS === 'web') {
        try {
          const result = await getRedirectResult(auth);
          console.log('[Auth] getRedirectResult:', result?.user?.email ?? null);
        } catch (err) {
          console.error('[Auth] getRedirectResult failed:', err.code, err.message);
          setAuthError(`${err.code}: ${err.message}`);
        }
      }

      unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        console.log('[Auth] onAuthStateChanged:', firebaseUser?.email ?? 'signed out');
        setUser(firebaseUser);
        setAuthLoading(false);
      });
    };

    init();
    return () => unsubscribe?.();
  }, []);

  const signInWithEmail = async (email, password) => {
    setAuthError(null);
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  };

  const registerWithEmail = async (email, password) => {
    setAuthError(null);
    const result = await createUserWithEmailAndPassword(auth, email, password);
    return result.user;
  };

  const resetPassword = async (email) => {
    await sendPasswordResetEmail(auth, email);
  };

  const signInWithGoogle = async () => {
    setAuthError(null);
    if (Platform.OS === 'web') {
      await signInWithRedirect(auth, googleProvider);
      return;
    }
    try {
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    } catch (err) {
      const silent = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'];
      if (!silent.includes(err.code)) {
        console.error('[Auth] signInWithPopup failed:', err.code, err.message);
        throw err;
      }
    }
  };

  const signOutUser = async () => {
    await signOut(auth);
    setBankConnected(false);
  };

  return (
    <AuthContext.Provider value={{
      user, authLoading, authError,
      bankConnected, setBankConnected,
      signInWithEmail, registerWithEmail, resetPassword, signInWithGoogle, signOutUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
