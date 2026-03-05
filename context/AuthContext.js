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

const BANK_KEY = 'loopi_bankConnected';
const loadLocal = () => { try { return localStorage.getItem(BANK_KEY) === 'true'; } catch { return false; } };
const saveLocal = (val) => { try { val ? localStorage.setItem(BANK_KEY, 'true') : localStorage.removeItem(BANK_KEY); } catch {} };

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [bankConnected, setBankConnectedState] = useState(
    Platform.OS === 'web' ? loadLocal() : false
  );

  const setBankConnected = (val) => {
    setBankConnectedState(val);
    if (Platform.OS === 'web') saveLocal(val);
    // Also persist to Firestore so other devices see the state
    const uid = auth.currentUser?.uid;
    if (uid) {
      setDoc(doc(db, 'users', uid), { bankConnected: val }, { merge: true }).catch(() => {});
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);

      if (!firebaseUser) {
        setBankConnectedState(false);
        if (Platform.OS === 'web') saveLocal(false);
        return;
      }

      // Load bankConnected from Firestore (authoritative, cross-device)
      try {
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (snap.exists() && snap.data().bankConnected === true) {
          setBankConnectedState(true);
          if (Platform.OS === 'web') saveLocal(true);
        }
      } catch (err) {
        console.warn('[Auth] Failed to load bankConnected from Firestore:', err.message);
      }
    });
    return unsubscribe;
  }, []);

  const signInWithEmail = async (email, password) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  };

  const registerWithEmail = async (email, password) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    return result.user;
  };

  const resetPassword = async (email) => {
    await sendPasswordResetEmail(auth, email);
  };

  const signOutUser = async () => {
    await signOut(auth);
    setBankConnectedState(false);
    if (Platform.OS === 'web') saveLocal(false);
  };

  return (
    <AuthContext.Provider value={{
      user, authLoading,
      bankConnected, setBankConnected,
      signInWithEmail, registerWithEmail, resetPassword, signOutUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
