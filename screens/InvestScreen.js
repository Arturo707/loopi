import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Modal,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { db } from '../config/firebase';
import { C } from '../constants/colors';
import { F } from '../constants/fonts';

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '');

const INVEST_AMOUNTS = [25, 50, 100, 200, 500];
const TOTAL_KYC_STEPS = 6;

const EMPLOYMENT_OPTIONS = ['Employed', 'Self-employed', 'Student', 'Unemployed', 'Retired'];
const INCOME_OPTIONS     = ['Under $30k', '$30k–$60k', '$60k–$100k', '$100k–$300k', 'Over $300k'];
const WORTH_OPTIONS      = ['Under $10k', '$10k–$50k', '$50k–$200k', 'Over $200k'];

const formatSsn = (raw) => {
  const d = raw.replace(/\D/g, '').slice(0, 9);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
};

const fmtPrice  = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtChange = (n) => { const v = Number(n); return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; };

const parseTradeError = (message) => {
  const msg = (message || '').toLowerCase();
  if (
    msg.includes('market') || msg.includes('closed') ||
    msg.includes('trading hours') || msg.includes('not open') ||
    msg.includes('outside') || msg.includes('after hours') ||
    msg.includes('pre-market') || msg.includes('session')
  ) {
    return 'Markets are closed. Try during trading hours (Mon–Fri 9:30am–4pm ET).';
  }
  return message || 'Something went wrong. Please try again.';
};

// ─── Chip selector ────────────────────────────────────────────────────────────

function Chips({ options, value, onSelect }) {
  return (
    <View style={s.chips}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt} activeOpacity={0.75}
          style={[s.chip, value === opt && s.chipActive]}
          onPress={() => onSelect(opt)}
        >
          <Text style={[s.chipTxt, value === opt && s.chipTxtActive]}>{opt}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function InvestScreen({ visible, stock, onClose, onSuccess }) {
  const {
    alpacaAccountId, achRelationshipId, riskProfile,
    setAchRelationshipId, createAlpacaAccount, refreshAlpacaPortfolio,
    firstName: ctxFirstName, lastName: ctxLastName, dateOfBirth: ctxDob,
  } = useApp();
  const { user } = useAuth();

  const isVerified = !!alpacaAccountId;

  // Parse ctx DOB for initial state pre-fill
  const [ctxDobYear, ctxDobMonth, ctxDobDay] = (ctxDob || '').split('-');

  // ── Amount (both modes) ──
  const [amount, setAmount] = useState(100);

  // ── KYC step — always starts at 1 (SSN is required and never stored) ──
  const [step, setStep] = useState(1);

  // Step 1 — Identity (pre-filled from onboarding if available)
  const [firstName,  setFirstName]  = useState(ctxFirstName || '');
  const [middleName, setMiddleName] = useState('');
  const [lastName,   setLastName]   = useState(ctxLastName || '');
  const [dobMonth,   setDobMonth]   = useState(ctxDobMonth || '');
  const [dobDay,     setDobDay]     = useState(ctxDobDay || '');
  const [dobYear,    setDobYear]    = useState(ctxDobYear || '');
  const [ssn,        setSsn]        = useState('');
  const dayRef  = useRef(null);
  const yearRef = useRef(null);

  // Step 2 — Address
  const [street,     setStreet]     = useState('');
  const [unit,       setUnit]       = useState('');
  const [city,       setCity]       = useState('');
  const [addrState,  setAddrState]  = useState('');
  const [zip,        setZip]        = useState('');

  // Step 3 — About
  const [employment, setEmployment] = useState(null);
  const [income,     setIncome]     = useState(null);
  const [netWorth,   setNetWorth]   = useState(null);

  // Step 4 — Disclosures (default No = false)
  const [isPep,        setIsPep]        = useState(false);
  const [isAffiliated, setIsAffiliated] = useState(false);
  const [isShareholder,setIsShareholder]= useState(false);
  const [isFamilyExp,  setIsFamilyExp]  = useState(false);

  // Step 5 — Agreements
  const [agree1, setAgree1] = useState(false);
  const [agree2, setAgree2] = useState(false);

  // Step 6 — Bank
  const [routing,    setRouting]    = useState('');
  const [accountNum, setAccountNum] = useState('');

  // Shared
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const reset = () => {
    setStep(1); setError(null); setAmount(100);
    setFirstName(ctxFirstName || ''); setMiddleName(''); setLastName(ctxLastName || '');
    setDobMonth(ctxDobMonth || ''); setDobDay(ctxDobDay || ''); setDobYear(ctxDobYear || '');
    setSsn(''); setStreet(''); setUnit(''); setCity('');
    setAddrState(''); setZip('');
    setEmployment(null); setIncome(null); setNetWorth(null);
    setIsPep(false); setIsAffiliated(false); setIsShareholder(false); setIsFamilyExp(false);
    setAgree1(false); setAgree2(false);
    setRouting(''); setAccountNum('');
  };

  const handleClose = () => { reset(); onClose(); };

  // ── Prefill when modal opens: context first (instant), Firestore fallback ──
  useEffect(() => {
    if (!visible || !user) return;

    // 1. Apply AppContext values synchronously — works even if modal was mounted early
    if (ctxFirstName) setFirstName(ctxFirstName);
    if (ctxLastName)  setLastName(ctxLastName);
    const [cy, cm, cd] = (ctxDob || '').split('-');
    if (cy) setDobYear(cy);
    if (cm) setDobMonth(cm);
    if (cd) setDobDay(cd);

    // 2. Only hit Firestore if identity is still incomplete after context
    const needsIdentity = !ctxFirstName || !ctxLastName || !ctxDob;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (!snap.exists()) return;
        const d = snap.data();
        // Step 1: identity — only if context didn't have it
        if (needsIdentity) {
          if (d.firstName)   setFirstName(d.firstName);
          if (d.lastName)    setLastName(d.lastName);
          if (d.dateOfBirth) {
            const [y, m, day] = d.dateOfBirth.split('-');
            if (y)   setDobYear(y);
            if (m)   setDobMonth(m);
            if (day) setDobDay(day);
          }
        }
        // Step 2: address (saved on previous KYC attempt)
        if (d.kycStreet) setStreet(d.kycStreet);
        if (d.kycUnit)   setUnit(d.kycUnit);
        if (d.kycCity)   setCity(d.kycCity);
        if (d.kycState)  setAddrState(d.kycState);
        if (d.kycZip)    setZip(d.kycZip);
        // Step 3: financial profile (saved on previous KYC attempt)
        if (d.kycEmployment) setEmployment(d.kycEmployment);
        if (d.kycIncome)     setIncome(d.kycIncome);
        if (d.kycNetWorth)   setNetWorth(d.kycNetWorth);
      } catch (err) {
        console.warn('[KYC] Failed to load prefill data:', err.message);
      }
    })();
  }, [visible, user]);

  // ── Derived: which steps are fully pre-filled and can be skipped ──
  const step1Prefilled = (
    firstName.trim().length >= 2 && lastName.trim().length >= 2 &&
    dobYear.length === 4 && dobMonth.length === 2 && dobDay.length === 2
  );
  const step2Prefilled = (
    street.trim().length > 0 && city.trim().length > 0 &&
    addrState.length === 2 && /^\d{5}$/.test(zip)
  );
  const step3Prefilled = !!employment && !!income && !!netWorth;

  // ── If step 1 becomes prefilled while we're still on step 1, advance past it ──
  useEffect(() => {
    if (step === 1 && step1Prefilled) setStep(2);
  }, [step, step1Prefilled]);

  // ── Display step / total (excluding skipped steps) ──
  const skippedCount  = (step1Prefilled ? 1 : 0) + (step2Prefilled ? 1 : 0) + (step3Prefilled ? 1 : 0);
  const displayTotal  = TOTAL_KYC_STEPS - skippedCount;
  const skippedBefore = (step > 1 && step1Prefilled ? 1 : 0) + (step > 2 && step2Prefilled ? 1 : 0) + (step > 3 && step3Prefilled ? 1 : 0);
  const displayStep   = step - skippedBefore;

  // ── Can proceed per KYC step ──
  const canProceedKyc = () => {
    switch (step) {
      case 1:
        return (
          firstName.trim().length >= 2 && lastName.trim().length >= 2 &&
          dobMonth.length === 2 && dobDay.length === 2 && dobYear.length === 4 &&
          /^\d{3}-\d{2}-\d{4}$/.test(ssn)
        );
      case 2:
        return street.trim().length > 0 && city.trim().length > 0 &&
               addrState.trim().length === 2 && /^\d{5}$/.test(zip);
      case 3: return !!employment && !!income && !!netWorth;
      case 4: return true; // disclosures always valid (defaulted to No)
      case 5: return agree1 && agree2;
      case 6: return /^\d{9}$/.test(routing) && /^\d{4,17}$/.test(accountNum);
      default: return false;
    }
  };

  // ── KYC continue / final submit ──
  const handleNextKyc = async () => {
    setError(null);
    if (step < TOTAL_KYC_STEPS) {
      // Persist non-sensitive step data so future attempts can skip it
      if (step === 2) {
        setDoc(doc(db, 'users', user.uid), {
          kycStreet: street.trim(), kycUnit: unit.trim(),
          kycCity: city.trim(), kycState: addrState.trim(), kycZip: zip.trim(),
        }, { merge: true }).catch(() => {});
      }
      if (step === 3) {
        setDoc(doc(db, 'users', user.uid), {
          kycEmployment: employment, kycIncome: income, kycNetWorth: netWorth,
        }, { merge: true }).catch(() => {});
      }
      // Advance past any prefilled steps
      let next = step + 1;
      if (next === 1 && step1Prefilled) next++;
      if (next === 2 && step2Prefilled) next++;
      if (next === 3 && step3Prefilled) next++;
      setStep(next);
      return;
    }

    // Step 6 submit: create account → link bank → place trade
    setLoading(true);
    try {
      const kycData = {
        uid: user.uid,
        firstName: firstName.trim(),
        middleName: middleName.trim() || undefined,
        lastName: lastName.trim(),
        dateOfBirth: `${dobYear}-${dobMonth}-${dobDay}`,
        taxId: ssn.replace(/-/g, ''),
        taxIdType: 'USA_SSN',
        streetAddress: street.trim(),
        unit: unit.trim() || undefined,
        city: city.trim(),
        state: addrState.trim(),
        postalCode: zip.trim(),
        country: 'USA',
        employmentStatus: employment,
        incomeRange: income,
        liquidNetWorth: netWorth,
        isPoliticallyExposed: isPep || isFamilyExp,
        isAffiliatedWithExchange: isAffiliated,
        isShareholderOfPublicCompany: isShareholder,
        riskProfile,
      };

      // 1. Create Alpaca brokerage account
      const accountData = await createAlpacaAccount(kycData);
      const newAccountId = accountData.alpacaAccountId;

      // 2. Link bank via ACH
      const bankOwner = [firstName.trim(), lastName.trim()].join(' ');
      const bankRes = await fetch(`${API_BASE}/api/alpaca-bank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: newAccountId,
          uid: user.uid,
          routingNumber: routing,
          accountNumber: accountNum,
          bankAccountOwnerName: bankOwner,
        }),
      });
      const bankData = await bankRes.json();
      if (!bankRes.ok) throw new Error(bankData.error || 'Bank link failed');
      setAchRelationshipId(bankData.achRelationshipId);

      // 3. Place trade
      const tradeRes = await fetch(`${API_BASE}/api/alpaca-trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: newAccountId,
          symbol: stock.symbol,
          side: 'buy',
          amount,
          achRelationshipId: bankData.achRelationshipId,
        }),
      });
      const tradeData = await tradeRes.json();
      if (!tradeRes.ok) throw new Error(tradeData.error || 'Trade failed');

      refreshAlpacaPortfolio();
      onSuccess('✅ Order placed');
      handleClose();
    } catch (err) {
      setError(parseTradeError(err.message));
    } finally {
      setLoading(false);
    }
  };

  // ── Mode B: invest with existing account ──
  const handleInvestB = async () => {
    if (!alpacaAccountId) return;
    setLoading(true);
    setError(null);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled  = await LocalAuthentication.isEnrolledAsync();
      if (hasHardware && isEnrolled) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: `Confirm $${amount} investment in ${stock.symbol}`,
          fallbackLabel: 'Use passcode',
          cancelLabel: 'Cancel',
        });
        if (!result.success) { setLoading(false); return; }
      }
      const res = await fetch(`${API_BASE}/api/alpaca-trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: alpacaAccountId,
          symbol: stock.symbol,
          side: 'buy',
          amount,
          achRelationshipId: achRelationshipId ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Order failed');
      refreshAlpacaPortfolio();
      onSuccess('✅ Order placed');
      handleClose();
    } catch (err) {
      setError(parseTradeError(err.message));
    } finally {
      setLoading(false);
    }
  };

  if (!stock) return null;
  const up = Number(stock.changesPercentage) >= 0;

  // ════════════════════════════════════════════════════════════════
  // MODE B — already verified, show amount picker
  // ════════════════════════════════════════════════════════════════
  if (isVerified) {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.ticker}>{stock.symbol}</Text>
            <Text style={s.stockNameTxt} numberOfLines={1}>{stock.name}</Text>
            <View style={s.priceRow}>
              <Text style={s.price}>{fmtPrice(stock.price)}</Text>
              <View style={[s.pill, { backgroundColor: up ? C.greenBg : C.redBg }]}>
                <Text style={[s.pillTxt, { color: up ? C.green : C.red }]}>
                  {up ? '▲' : '▼'} {fmtChange(stock.changesPercentage)}
                </Text>
              </View>
            </View>
            <Text style={s.amtLabel}>How much do you want to invest?</Text>
            <View style={s.amounts}>
              {INVEST_AMOUNTS.map((a) => (
                <TouchableOpacity key={a} style={[s.amtBtn, amount === a && s.amtBtnActive]} onPress={() => setAmount(a)} disabled={loading}>
                  <Text style={[s.amtTxt, amount === a && s.amtTxtActive]}>${a}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {error ? <Text style={s.errorTxt}>{error}</Text> : null}
            <TouchableOpacity style={[s.confirmBtn, loading && { opacity: 0.7 }]} onPress={handleInvestB} disabled={loading}>
              {loading ? <ActivityIndicator color="#FFF" /> : <Text style={s.confirmTxt}>⚡ Invest ${amount} in {stock.symbol}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={handleClose} disabled={loading}>
              <Text style={s.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // MODE A — KYC flow
  // ════════════════════════════════════════════════════════════════
  const KYC_META = [
    { emoji: '🪪', title: "Let's verify your identity",  subtitle: 'Quick and secure. Required to open your brokerage account.' },
    { emoji: '🏠', title: 'Your address',                 subtitle: 'Your current US home address.' },
    { emoji: '💼', title: 'A bit about you',              subtitle: 'Required by US financial regulations.' },
    { emoji: '📋', title: 'Quick disclosures',            subtitle: 'Required by US financial regulators. Most people answer No to all of these.' },
    { emoji: '✍️', title: 'Almost done',                  subtitle: 'Review and sign your agreements to continue.' },
    { emoji: '🏦', title: 'Connect your bank',            subtitle: 'Link your bank to fund investments instantly via ACH.' },
  ];
  const meta = KYC_META[step - 1];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView style={s.container}>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => {
              if (step <= 1) { handleClose(); return; }
              let prev = step - 1;
              if (prev === 3 && step3Prefilled) prev--;
              if (prev === 2 && step2Prefilled) prev--;
              if (prev === 1 && step1Prefilled) prev--;
              if (prev < 1) { handleClose(); return; }
              setStep(prev);
            }}
            style={s.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={s.backTxt}>←</Text>
          </TouchableOpacity>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${(displayStep / displayTotal) * 100}%` }]} />
          </View>
          <Text style={s.stepCount}>{displayStep}/{displayTotal}</Text>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            <Text style={s.stepEmoji}>{meta.emoji}</Text>
            <Text style={s.titleTxt}>{meta.title}</Text>
            <Text style={s.subtitleTxt}>{meta.subtitle}</Text>

            {/* ── Step 1: Identity ── */}
            {step === 1 && (
              <View style={s.fields}>
                <View style={s.twoCol}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>First name</Text>
                    <TextInput style={s.input} value={firstName} onChangeText={setFirstName}
                      placeholder="e.g. James" placeholderTextColor={C.muted} autoCapitalize="words" autoFocus />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>Last name</Text>
                    <TextInput style={s.input} value={lastName} onChangeText={setLastName}
                      placeholder="e.g. Rivera" placeholderTextColor={C.muted} autoCapitalize="words" />
                  </View>
                </View>
                <View>
                  <Text style={s.label}>Middle name <Text style={s.optional}>(optional)</Text></Text>
                  <TextInput style={s.input} value={middleName} onChangeText={setMiddleName}
                    placeholder="e.g. Michael" placeholderTextColor={C.muted} autoCapitalize="words" />
                </View>
                <View>
                  <Text style={s.label}>Date of birth</Text>
                  <View style={s.dobRow}>
                    <TextInput style={[s.input, s.dobPart]} value={dobMonth}
                      onChangeText={(v) => { setDobMonth(v); if (v.length === 2) dayRef.current?.focus(); }}
                      placeholder="MM" placeholderTextColor={C.muted} keyboardType="number-pad" maxLength={2} textAlign="center" />
                    <Text style={s.dobSep}>/</Text>
                    <TextInput ref={dayRef} style={[s.input, s.dobPart]} value={dobDay}
                      onChangeText={(v) => { setDobDay(v); if (v.length === 2) yearRef.current?.focus(); }}
                      placeholder="DD" placeholderTextColor={C.muted} keyboardType="number-pad" maxLength={2} textAlign="center" />
                    <Text style={s.dobSep}>/</Text>
                    <TextInput ref={yearRef} style={[s.input, { flex: 2 }]} value={dobYear}
                      onChangeText={setDobYear}
                      placeholder="YYYY" placeholderTextColor={C.muted} keyboardType="number-pad" maxLength={4} textAlign="center" />
                  </View>
                </View>
                <View>
                  <Text style={s.label}>Social Security Number (SSN)</Text>
                  <TextInput style={s.input} value={ssn} onChangeText={(v) => setSsn(formatSsn(v))}
                    placeholder="e.g. 123-45-6789" placeholderTextColor={C.muted}
                    keyboardType="number-pad" maxLength={11} />
                  <Text style={s.note}>Your SSN is encrypted and sent directly to Alpaca Securities, our SIPC-insured brokerage partner.</Text>
                </View>
              </View>
            )}

            {/* ── Step 2: Address ── */}
            {step === 2 && (
              <View style={s.fields}>
                <View>
                  <Text style={s.label}>Street address</Text>
                  <TextInput style={s.input} value={street} onChangeText={setStreet}
                    placeholder="e.g. 123 Main St" placeholderTextColor={C.muted} autoCapitalize="words" autoFocus />
                </View>
                <View>
                  <Text style={s.label}>Unit / Apt <Text style={s.optional}>(optional)</Text></Text>
                  <TextInput style={s.input} value={unit} onChangeText={setUnit}
                    placeholder="e.g. Apt 4B" placeholderTextColor={C.muted} />
                </View>
                <View>
                  <Text style={s.label}>City</Text>
                  <TextInput style={s.input} value={city} onChangeText={setCity}
                    placeholder="e.g. New York" placeholderTextColor={C.muted} autoCapitalize="words" />
                </View>
                <View style={s.twoCol}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>State</Text>
                    <TextInput style={s.input} value={addrState}
                      onChangeText={(v) => setAddrState(v.toUpperCase().slice(0, 2))}
                      placeholder="e.g. NY" placeholderTextColor={C.muted} autoCapitalize="characters" maxLength={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>ZIP code</Text>
                    <TextInput style={s.input} value={zip}
                      onChangeText={(v) => setZip(v.replace(/\D/g, '').slice(0, 5))}
                      placeholder="e.g. 10001" placeholderTextColor={C.muted} keyboardType="number-pad" maxLength={5} />
                  </View>
                </View>
              </View>
            )}

            {/* ── Step 3: About you ── */}
            {step === 3 && (
              <View style={s.fields}>
                <View>
                  <Text style={s.label}>Employment status</Text>
                  <Chips options={EMPLOYMENT_OPTIONS} value={employment} onSelect={setEmployment} />
                </View>
                <View>
                  <Text style={s.label}>Annual income</Text>
                  <Chips options={INCOME_OPTIONS} value={income} onSelect={setIncome} />
                </View>
                <View>
                  <Text style={s.label}>Liquid net worth</Text>
                  <Chips options={WORTH_OPTIONS} value={netWorth} onSelect={setNetWorth} />
                </View>
              </View>
            )}

            {/* ── Step 4: Disclosures ── */}
            {step === 4 && (
              <View style={s.fields}>
                {[
                  { val: isPep,        set: setIsPep,        text: 'Are you or a family member a senior political figure?' },
                  { val: isAffiliated, set: setIsAffiliated, text: 'Are you affiliated with a stock exchange or FINRA?' },
                  { val: isShareholder,set: setIsShareholder,text: 'Are you a 10%+ shareholder of a public company?' },
                  { val: isFamilyExp,  set: setIsFamilyExp,  text: 'Does a family member hold any of the above?' },
                ].map(({ val, set, text }) => (
                  <View key={text} style={s.disclosureRow}>
                    <Text style={s.disclosureTxt}>{text}</Text>
                    <View style={s.yesNo}>
                      <TouchableOpacity style={[s.toggle, val === false && s.toggleNo]} onPress={() => set(false)}>
                        <Text style={[s.toggleTxt, val === false && s.toggleTxtActive]}>No</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.toggle, val === true && s.toggleYes]} onPress={() => set(true)}>
                        <Text style={[s.toggleTxt, val === true && s.toggleTxtActive]}>Yes</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* ── Step 5: Agreements ── */}
            {step === 5 && (
              <View style={s.fields}>
                {[
                  { checked: agree1, set: setAgree1, text: 'I agree to the Customer Agreement, including the pre-dispute arbitration clause and margin agreement.' },
                  { checked: agree2, set: setAgree2, text: 'I consent to electronic communications and acknowledge this as my legal digital signature.' },
                ].map(({ checked, set, text }) => (
                  <TouchableOpacity key={text} style={s.checkRow} onPress={() => set(!checked)} activeOpacity={0.8}>
                    <View style={[s.checkbox, checked && s.checkboxChecked]}>
                      {checked && <Text style={s.checkmark}>✓</Text>}
                    </View>
                    <Text style={s.checkTxt}>{text}</Text>
                  </TouchableOpacity>
                ))}
                <View style={s.links}>
                  <Text style={s.link}>Customer Agreement</Text>
                  <Text style={s.linkSep}>·</Text>
                  <Text style={s.link}>Margin Agreement</Text>
                  <Text style={s.linkSep}>·</Text>
                  <Text style={s.link}>Account Agreement</Text>
                </View>
              </View>
            )}

            {/* ── Step 6: Bank ── */}
            {step === 6 && (
              <View style={s.fields}>
                <View style={s.bankBanner}>
                  <Text style={s.bankBannerTxt}>
                    🔒 Your bank details are never stored by Loopi{'\n'}
                    All information is encrypted and sent directly to Alpaca Securities, our SIPC-insured brokerage partner.
                  </Text>
                </View>
                <View>
                  <Text style={s.label}>Routing number</Text>
                  <TextInput style={s.input} value={routing}
                    onChangeText={(v) => setRouting(v.replace(/\D/g, '').slice(0, 9))}
                    placeholder="e.g. 021000021" placeholderTextColor={C.muted}
                    keyboardType="number-pad" maxLength={9} autoFocus />
                </View>
                <View>
                  <Text style={s.label}>Account number</Text>
                  <TextInput style={s.input} value={accountNum}
                    onChangeText={(v) => setAccountNum(v.replace(/\D/g, '').slice(0, 17))}
                    placeholder="e.g. 000123456789" placeholderTextColor={C.muted}
                    keyboardType="number-pad" maxLength={17} secureTextEntry />
                </View>
                <View>
                  <Text style={s.label}>How much to invest?</Text>
                  <View style={s.amounts}>
                    {INVEST_AMOUNTS.map((a) => (
                      <TouchableOpacity key={a} style={[s.amtBtn, amount === a && s.amtBtnActive]} onPress={() => setAmount(a)}>
                        <Text style={[s.amtTxt, amount === a && s.amtTxtActive]}>${a}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                {error ? <Text style={s.errorTxt}>{error}</Text> : null}
              </View>
            )}

          </ScrollView>
        </KeyboardAvoidingView>

        {/* Footer */}
        <View style={s.footer}>
          <TouchableOpacity
            style={[s.nextBtn, (!canProceedKyc() || loading) && s.nextBtnDisabled]}
            onPress={handleNextKyc}
            disabled={!canProceedKyc() || loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#FFF" />
              : <Text style={s.nextBtnTxt}>
                  {step === TOTAL_KYC_STEPS ? `⚡ Invest $${amount} in ${stock.symbol}` : 'Continue →'}
                </Text>
            }
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Mode A — full screen
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 20,
  },
  backBtn:       { width: 32, alignItems: 'flex-start' },
  backTxt:       { fontSize: 24, color: C.text, fontFamily: F.bold },
  progressTrack: { flex: 1, height: 4, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden' },
  progressFill:  { height: '100%', backgroundColor: C.orange, borderRadius: 2 },
  stepCount:     { fontSize: 12, color: C.muted, fontFamily: F.medium, width: 32, textAlign: 'right' },

  scroll:      { paddingHorizontal: 24, paddingBottom: 32 },
  stepEmoji:   { fontSize: 52, marginBottom: 20 },
  titleTxt:    { fontSize: 26, fontFamily: F.xbold, color: C.text, letterSpacing: -0.5, lineHeight: 33, marginBottom: 10 },
  subtitleTxt: { fontSize: 14, fontFamily: F.regular, color: C.sub, lineHeight: 22, marginBottom: 28 },

  fields:   { gap: 20 },
  twoCol:   { flexDirection: 'row', gap: 12 },
  label:    { fontSize: 12, fontFamily: F.semibold, color: C.muted, letterSpacing: 0.3, marginBottom: 8 },
  optional: { fontFamily: F.regular, color: C.muted },
  input: {
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, fontFamily: F.regular, color: C.text,
  },
  note: { fontSize: 12, fontFamily: F.regular, color: C.muted, lineHeight: 18, marginTop: 8 },

  dobRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dobPart: { flex: 1 },
  dobSep:  { fontSize: 20, fontFamily: F.bold, color: C.muted },

  chips:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:        { borderWidth: 1.5, borderColor: C.border, borderRadius: 20, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: C.card },
  chipActive:  { borderColor: C.orange, backgroundColor: C.orangeLight },
  chipTxt:     { fontSize: 14, fontFamily: F.medium, color: C.text },
  chipTxtActive: { color: C.orange, fontFamily: F.semibold },

  disclosureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 6 },
  disclosureTxt: { flex: 1, fontSize: 14, fontFamily: F.regular, color: C.text, lineHeight: 20 },
  yesNo:         { flexDirection: 'row', gap: 6 },
  toggle:        { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: C.border },
  toggleNo:      { borderColor: C.green, backgroundColor: '#F0FDF4' },
  toggleYes:     { borderColor: C.orange, backgroundColor: C.orangeLight },
  toggleTxt:     { fontSize: 13, fontFamily: F.semibold, color: C.muted },
  toggleTxtActive: { color: C.text },

  checkRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  checkbox:       { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  checkboxChecked: { backgroundColor: C.orange, borderColor: C.orange },
  checkmark:      { fontSize: 13, color: '#FFF', fontFamily: F.bold },
  checkTxt:       { flex: 1, fontSize: 14, fontFamily: F.regular, color: C.text, lineHeight: 22 },
  links:          { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  link:           { fontSize: 13, fontFamily: F.medium, color: C.orange, textDecorationLine: 'underline' },
  linkSep:        { fontSize: 13, color: C.muted },

  bankBanner:    { backgroundColor: C.orange, borderRadius: 16, padding: 16 },
  bankBannerTxt: { fontSize: 13, fontFamily: F.regular, color: '#FFF', lineHeight: 20 },

  amounts:      { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  amtBtn:       { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.bg },
  amtBtnActive: { borderColor: C.orange, backgroundColor: C.orangeLight },
  amtTxt:       { fontSize: 15, fontFamily: F.semibold, color: C.sub },
  amtTxtActive: { color: C.orange },

  errorTxt: { fontSize: 13, fontFamily: F.medium, color: C.red, textAlign: 'center' },

  footer:          { paddingHorizontal: 24, paddingBottom: 16, paddingTop: 8 },
  nextBtn:         { backgroundColor: C.orange, borderRadius: 18, paddingVertical: 18, alignItems: 'center', shadowColor: C.orange, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 7 },
  nextBtnDisabled: { opacity: 0.4, shadowOpacity: 0 },
  nextBtnTxt:      { fontSize: 17, fontFamily: F.bold, color: '#FFF', letterSpacing: 0.2 },

  // Mode B — bottom sheet
  overlay:      { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:        { backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 40 },
  handle:       { width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: 24 },
  ticker:       { fontSize: 36, fontFamily: F.xbold, color: C.text, letterSpacing: -1 },
  stockNameTxt: { fontSize: 15, fontFamily: F.regular, color: C.muted, marginTop: 4, marginBottom: 16 },
  priceRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 28 },
  price:        { fontSize: 26, fontFamily: F.bold, color: C.text },
  pill:         { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 20 },
  pillTxt:      { fontSize: 14, fontFamily: F.bold },
  amtLabel:     { fontSize: 13, fontFamily: F.semibold, color: C.muted, marginBottom: 12, letterSpacing: 0.3 },
  confirmBtn:   { backgroundColor: C.orange, borderRadius: 16, paddingVertical: 17, alignItems: 'center', shadowColor: C.orange, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 5, marginBottom: 12 },
  confirmTxt:   { fontSize: 16, fontFamily: F.semibold, color: '#FFF' },
  cancelBtn:    { alignItems: 'center', paddingVertical: 10 },
  cancelTxt:    { fontSize: 14, fontFamily: F.medium, color: C.muted },
});
