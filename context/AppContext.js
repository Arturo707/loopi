import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../config/firebase';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [bankAccount,    setBankAccount]     = useState(null);
  const [investedAmount, setInvestedAmount]  = useState(0);
  const [portfolio,      setPortfolio]       = useState([]);
  const [riskProfile,    setRiskProfileState] = useState('Moderado');

  // Onboarding / profile fields
  const [age,         setAge]         = useState(null);
  const [incomeRange, setIncomeRange] = useState(null);
  const [experience,  setExperience]  = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setRiskProfileState('Moderado');
        setBankAccount(null);
        setAge(null);
        setIncomeRange(null);
        setExperience(null);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (snap.exists()) {
          const d = snap.data();
          if (d.riskProfile)  setRiskProfileState(d.riskProfile);
          if (d.bankAccount)  setBankAccount(d.bankAccount);
          if (d.age != null)  setAge(d.age);
          if (d.incomeRange)  setIncomeRange(d.incomeRange);
          if (d.experience)   setExperience(d.experience);
        }
      } catch (err) {
        console.warn('[App] Failed to load user data:', err.message);
      }
    });
    return unsubscribe;
  }, []);

  // Save all onboarding answers + risk profile in a single Firestore write
  const saveProfile = async ({ age: a, incomeRange: ir, experience: ex, riskProfile: rp }) => {
    const profile = rp || 'Moderado';
    setAge(a);
    setIncomeRange(ir);
    setExperience(ex);
    setRiskProfileState(profile);
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await setDoc(
      doc(db, 'users', uid),
      { age: a, incomeRange: ir, experience: ex, riskProfile: profile },
      { merge: true }
    );
  };

  const setRiskProfile = async (profile) => {
    setRiskProfileState(profile);
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try { await setDoc(doc(db, 'users', uid), { riskProfile: profile }, { merge: true }); }
    catch (err) { console.warn('[App] Failed to save risk profile:', err.message); }
  };

  const addToPortfolio = (stock) => {
    setPortfolio((prev) => [...prev, { ...stock, amount: stock.recommended }]);
    setInvestedAmount((prev) => prev + stock.recommended);
  };

  const balance = bankAccount?.balance ?? 0;

  return (
    <AppContext.Provider value={{
      balance, bankAccount,
      investedAmount, portfolio, addToPortfolio,
      riskProfile, setRiskProfile,
      age, incomeRange, experience,
      saveProfile,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
