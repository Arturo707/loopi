import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { auth } from '../config/firebase';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';

const BANK_KEY = 'loopi_bankConnected';
const loadBankConnected = () => { try { return localStorage.getItem(BANK_KEY) === 'true'; } catch { return false; } };
const saveBankConnected = (val) => { try { val ? localStorage.setItem(BANK_KEY, 'true') : localStorage.removeItem(BANK_KEY); } catch {} };

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [bankConnected, setBankConnectedState] = useState(
    Platform.OS === 'web' ? loadBankConnected() : false
  );

  const setBankConnected = (val) => {
    setBankConnectedState(val);
    if (Platform.OS === 'web') saveBankConnected(val);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
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
    setBankConnected(false);
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
