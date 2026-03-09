import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../config/firebase';

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '');

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [bankAccount,    setBankAccount]     = useState(null);
  const [investedAmount, setInvestedAmount]  = useState(0);
  const [portfolio,      setPortfolio]       = useState([]);
  const [riskProfile,    setRiskProfileState] = useState('Moderate');

  // Onboarding / profile fields
  const [age,         setAge]         = useState(null);
  const [incomeRange, setIncomeRange] = useState(null);
  const [experience,  setExperience]  = useState(null);

  // Alpaca brokerage account
  const [alpacaAccountId,     setAlpacaAccountId]     = useState(null);
  const [alpacaAccountStatus, setAlpacaAccountStatus] = useState(null);

  // Alpaca portfolio (live data)
  const [alpacaPositions,      setAlpacaPositions]      = useState([]);
  const [alpacaCash,           setAlpacaCash]            = useState(0);
  const [alpacaPortfolioValue, setAlpacaPortfolioValue]  = useState(0);

  const fetchAlpacaPortfolio = async (accountId) => {
    try {
      const res = await fetch(`${API_BASE}/api/alpaca-portfolio?accountId=${accountId}`);
      const data = await res.json();
      if (res.ok) {
        setAlpacaPositions(data.positions ?? []);
        setAlpacaCash(data.cash ?? 0);
        setAlpacaPortfolioValue(data.portfolioValue ?? 0);
      }
    } catch (err) {
      console.warn('[App] Failed to load portfolio:', err.message);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setRiskProfileState('Moderado');
        setBankAccount(null);
        setAge(null);
        setIncomeRange(null);
        setExperience(null);
        setAlpacaAccountId(null);
        setAlpacaAccountStatus(null);
        setAlpacaPositions([]);
        setAlpacaCash(0);
        setAlpacaPortfolioValue(0);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (snap.exists()) {
          const d = snap.data();
          if (d.riskProfile)          setRiskProfileState(d.riskProfile);
          if (d.bankAccount)          setBankAccount(d.bankAccount);
          if (d.age != null)          setAge(d.age);
          if (d.incomeRange)          setIncomeRange(d.incomeRange);
          if (d.experience)           setExperience(d.experience);
          if (d.alpacaAccountId)      setAlpacaAccountId(d.alpacaAccountId);
          if (d.alpacaAccountStatus)  setAlpacaAccountStatus(d.alpacaAccountStatus);
          if (d.alpacaAccountId)      fetchAlpacaPortfolio(d.alpacaAccountId);
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

  const createAlpacaAccount = async (profileData) => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Not authenticated');
    const response = await fetch(`${API_BASE}/api/alpaca-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileData),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to create account');
    setAlpacaAccountId(data.alpacaAccountId);
    setAlpacaAccountStatus(data.status);
    await setDoc(
      doc(db, 'users', uid),
      { alpacaAccountId: data.alpacaAccountId, alpacaAccountStatus: data.status },
      { merge: true }
    );
    return data;
  };

  const refreshAlpacaPortfolio = () => {
    if (alpacaAccountId) fetchAlpacaPortfolio(alpacaAccountId);
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
      alpacaAccountId, alpacaAccountStatus, createAlpacaAccount,
      alpacaPositions, alpacaCash, alpacaPortfolioValue, refreshAlpacaPortfolio,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
