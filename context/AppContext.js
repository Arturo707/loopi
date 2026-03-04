import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../config/firebase';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [balance] = useState(3240);
  const [investedAmount, setInvestedAmount] = useState(0);
  const [portfolio, setPortfolio] = useState([]);
  const [riskProfile, setRiskProfileState] = useState('Moderado');

  // Load persisted risk profile when user signs in, reset on sign-out
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setRiskProfileState('Moderado');
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (snap.exists() && snap.data().riskProfile) {
          setRiskProfileState(snap.data().riskProfile);
        }
      } catch (err) {
        console.warn('[App] Failed to load risk profile:', err.message);
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

  return (
    <AppContext.Provider value={{
      balance, investedAmount, portfolio, addToPortfolio,
      riskProfile, setRiskProfile,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
