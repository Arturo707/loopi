import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../config/firebase';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [bankAccount, setBankAccount] = useState(null); // { accountId, balance, currency, iban }
  const [investedAmount, setInvestedAmount] = useState(0);
  const [portfolio, setPortfolio] = useState([]);
  const [riskProfile, setRiskProfileState] = useState('Moderado');

  // Load persisted data when user signs in, reset on sign-out
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setRiskProfileState('Moderado');
        setBankAccount(null);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          if (data.riskProfile) setRiskProfileState(data.riskProfile);
          if (data.bankAccount) setBankAccount(data.bankAccount);
        }
      } catch (err) {
        console.warn('[App] Failed to load user data:', err.message);
      }
    });
    return unsubscribe;
  }, []);

  const setRiskProfile = async (profile) => {
    setRiskProfileState(profile);
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await setDoc(doc(db, 'users', uid), { riskProfile: profile }, { merge: true });
    } catch (err) {
      console.warn('[App] Failed to save risk profile:', err.message);
    }
  };

  const addToPortfolio = (stock) => {
    setPortfolio((prev) => [...prev, { ...stock, amount: stock.recommended }]);
    setInvestedAmount((prev) => prev + stock.recommended);
  };

  const balance = bankAccount?.balance ?? 0;

  return (
    <AppContext.Provider value={{
      balance, bankAccount, investedAmount, portfolio, addToPortfolio,
      riskProfile, setRiskProfile,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
