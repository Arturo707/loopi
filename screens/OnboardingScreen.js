import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, setDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { auth, db } from '../config/firebase';
import { C } from '../constants/colors';
import { F } from '../constants/fonts';

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '');

const TOTAL_STEPS = 10;

const INCOME_OPTIONS = [
  { value: '<1000',     label: 'Less than $1,000' },
  { value: '1000-2000', label: '$1,000 – $2,000'  },
  { value: '2000-3500', label: '$2,000 – $3,500'  },
  { value: '3500+',     label: '$3,500 or more'   },
];

const EXPERIENCE_OPTIONS = [
  { value: 'None',   label: 'None',   sub: 'Never invested before' },
  { value: 'Some',   label: 'Some',   sub: 'Invested a few times'  },
  { value: 'Expert', label: 'Expert', sub: 'I invest regularly'    },
];

const RISK_OPTIONS = [
  {
    value: 'Conservative', emoji: '🛡️', label: 'Conservative',
    sub: 'Safety first. ETFs and stable assets with predictable returns.',
  },
  {
    value: 'Moderate', emoji: '⚖️', label: 'Moderate',
    sub: 'Balance between safety and growth. The most popular pick.',
  },
  {
    value: 'Aggressive', emoji: '🚀', label: 'Aggressive',
    sub: 'High potential returns with higher risk. For those who want to go all in.',
  },
];

const STEP_META = [
  { emoji: '🎂', title: 'How old are you?',                    subtitle: 'Your age determines how long your money has to grow.' },
  { emoji: '💰', title: "What's your monthly income?",         subtitle: "We only invest what you have left over — never what you need to live." },
  { emoji: '📊', title: 'How much investing experience do you have?', subtitle: 'Be honest — it helps us tailor your recommendations.' },
  { emoji: '🎯', title: "What's your risk profile?",           subtitle: 'No pressure — you can change it anytime from your profile.' },
  { emoji: '👤', title: "What's your first name?",             subtitle: 'As it appears on your ID.' },
  { emoji: '📝', title: 'And your last name?',                  subtitle: 'As it appears on your passport or ID.' },
  { emoji: '📅', title: 'When were you born?',                  subtitle: 'Your full date of birth.' },
  { emoji: '🏠', title: 'Where do you live?',                   subtitle: 'Your current home address.' },
  { emoji: '🪪', title: 'Social Security Number',              subtitle: 'We need this to verify your identity and open your account.' },
  { emoji: '🏦', title: 'Link your bank account',              subtitle: 'Connect your bank to fund your investments instantly via ACH.' },
];

// ── SSN auto-formatter ──
const formatSsn = (raw) => {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
};

function ChoiceCard({ label, sub, emoji, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[s.card, selected && s.cardActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {emoji ? <Text style={s.cardEmoji}>{emoji}</Text> : null}
      <View style={{ flex: 1 }}>
        <Text style={[s.cardLabel, selected && s.cardLabelActive]}>{label}</Text>
        {sub ? <Text style={s.cardSub}>{sub}</Text> : null}
      </View>
      {selected ? <Text style={s.check}>✓</Text> : null}
    </TouchableOpacity>
  );
}

export default function OnboardingScreen() {
  const { setOnboardingDone } = useAuth();
  const { saveProfile, alpacaAccountId, setAchRelationshipId } = useApp();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // ── Step 1: Age ──
  const [age, setAgeText]       = useState('');
  const [ageError, setAgeError] = useState(null);

  // ── Step 2: Income ──
  const [incomeRange, setIncome] = useState(null);

  // ── Step 3: Experience ──
  const [experience, setExperience] = useState(null);

  // ── Step 4: Risk ──
  const [riskProfile, setRisk] = useState(null);

  // ── Step 5: First name ──
  const [firstName, setFirstName]           = useState('');
  const [firstNameError, setFirstNameError] = useState(null);

  // ── Step 6: Last name + middle ──
  const [lastName1, setLastName1]             = useState('');
  const [lastName2, setLastName2]             = useState('');
  const [lastName1Error, setLastName1Error]   = useState(null);

  // ── Step 7: Date of birth (MM / DD / YYYY) ──
  const [dobMonth, setDobMonth] = useState('');
  const [dobDay,   setDobDay]   = useState('');
  const [dobYear,  setDobYear]  = useState('');
  const [dobError, setDobError] = useState(null);
  const dayRef  = useRef(null);
  const yearRef = useRef(null);

  // ── Step 8: Address ──
  const [streetAddress, setStreetAddress] = useState('');
  const [city,          setCity]          = useState('');
  const [state,         setState]         = useState('');
  const [postalCode,    setPostalCode]    = useState('');
  const [country,       setCountry]       = useState('United States');
  const [addressError,  setAddressError]  = useState(null);

  // ── Step 9: SSN ──
  const [taxId,      setTaxId]      = useState('');
  const [taxIdError, setTaxIdError] = useState(null);

  // ── Step 10: Bank link ──
  const [routingNumber,   setRoutingNumber]   = useState('');
  const [bankAccountNum,  setBankAccountNum]  = useState('');
  const [routingError,    setRoutingError]    = useState(null);
  const [accountNumError, setAccountNumError] = useState(null);
  const [bankLinkError,   setBankLinkError]   = useState(null);
  const [bankLinkLoading, setBankLinkLoading] = useState(false);

  // ── Validation helpers ──
  const validateAge = (v) => {
    const n = parseInt(v, 10);
    if (!v.trim()) return 'Enter your age.';
    if (isNaN(n) || n < 18 || n > 100) return 'You must be at least 18 years old.';
    return null;
  };

  const validateName = (v) => {
    if (v.trim().length < 2) return 'Must be at least 2 characters.';
    if (/\d/.test(v)) return 'Name cannot contain numbers.';
    return null;
  };

  const validateDob = () => {
    const m = parseInt(dobMonth, 10);
    const d = parseInt(dobDay, 10);
    const y = parseInt(dobYear, 10);
    if (!dobMonth || !dobDay || !dobYear) return 'Enter your full date of birth.';
    if (dobMonth.length !== 2 || dobDay.length !== 2 || dobYear.length !== 4) return 'Use MM / DD / YYYY format.';
    if (m < 1 || m > 12) return 'Invalid month.';
    if (d < 1 || d > 31) return 'Invalid day.';
    if (y < 1900) return 'Invalid year.';
    const dob = new Date(y, m - 1, d);
    const threshold = new Date();
    threshold.setFullYear(threshold.getFullYear() - 18);
    if (dob > threshold) return 'You must be at least 18 years old.';
    return null;
  };

  const validateZip = (v) => {
    if (!/^\d{5}$/.test(v)) return 'ZIP code must be exactly 5 digits.';
    return null;
  };

  const validateSsn = (v) => {
    if (!/^\d{3}-\d{2}-\d{4}$/.test(v)) return 'Enter a valid SSN: 123-45-6789.';
    return null;
  };

  const validateRouting = (v) => {
    if (!/^\d{9}$/.test(v.trim())) return 'Routing number must be exactly 9 digits.';
    return null;
  };

  const validateAccountNum = (v) => {
    if (!/^\d{4,17}$/.test(v.trim())) return 'Account number must be 4–17 digits.';
    return null;
  };

  const canProceed = () => {
    switch (step) {
      case 1:  return age.trim().length > 0 && !validateAge(age);
      case 2:  return !!incomeRange;
      case 3:  return !!experience;
      case 4:  return !!riskProfile;
      case 5:  return !validateName(firstName);
      case 6:  return !validateName(lastName1);
      case 7:  return dobMonth.length === 2 && dobDay.length === 2 && dobYear.length === 4 && !validateDob();
      case 8:  return (
        streetAddress.trim().length > 0 &&
        city.trim().length > 0 &&
        state.trim().length > 0 &&
        !validateZip(postalCode)
      );
      case 9:  return !validateSsn(taxId);
      case 10: return !validateRouting(routingNumber) && !validateAccountNum(bankAccountNum);
      default: return false;
    }
  };

  const handleNext = () => {
    if (step === 1) {
      const err = validateAge(age);
      if (err) { setAgeError(err); return; }
      setAgeError(null);
    }
    if (step === 5) {
      const err = validateName(firstName);
      if (err) { setFirstNameError(err); return; }
      setFirstNameError(null);
    }
    if (step === 6) {
      const err = validateName(lastName1);
      if (err) { setLastName1Error(err); return; }
      setLastName1Error(null);
    }
    if (step === 7) {
      const err = validateDob();
      if (err) { setDobError(err); return; }
      setDobError(null);
    }
    if (step === 8) {
      if (!streetAddress.trim() || !city.trim() || !state.trim()) {
        setAddressError('Please fill in all required fields.');
        return;
      }
      const zipErr = validateZip(postalCode);
      if (zipErr) { setAddressError(zipErr); return; }
      setAddressError(null);
    }
    if (step === 9) {
      const err = validateSsn(taxId);
      if (err) { setTaxIdError(err); return; }
      setTaxIdError(null);
    }

    if (step === TOTAL_STEPS) {
      handleBankLink();
      return;
    }

    if (step < TOTAL_STEPS) {
      setStep((s) => s + 1);
    }
  };

  const handleBankLink = async () => {
    const rErr = validateRouting(routingNumber);
    const aErr = validateAccountNum(bankAccountNum);
    if (rErr) { setRoutingError(rErr); return; }
    if (aErr) { setAccountNumError(aErr); return; }

    setBankLinkError(null);
    setBankLinkLoading(true);
    try {
      const uid = auth.currentUser?.uid;
      const accountId = alpacaAccountId;
      const bankAccountOwnerName = [firstName.trim(), lastName1.trim()].filter(Boolean).join(' ') || 'Account Owner';

      if (!accountId) {
        handleFinish();
        return;
      }

      const res = await fetch(`${API_BASE}/api/alpaca-bank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          uid,
          routingNumber: routingNumber.trim(),
          accountNumber: bankAccountNum.trim(),
          bankAccountOwnerName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to link bank');

      setAchRelationshipId(data.achRelationshipId);
    } catch (err) {
      setBankLinkError(err.message);
    } finally {
      setBankLinkLoading(false);
      handleFinish();
    }
  };

  const handleFinish = async () => {
    setSaving(true);
    const lastName = [lastName1.trim(), lastName2.trim()].filter(Boolean).join(' ');
    const dateOfBirth = `${dobMonth}/${dobDay}/${dobYear}`;
    try {
      await saveProfile({
        age: parseInt(age, 10),
        incomeRange,
        experience,
        riskProfile,
      });
      const uid = auth.currentUser?.uid;
      if (uid) {
        await setDoc(
          doc(db, 'users', uid),
          { firstName, lastName, dateOfBirth, streetAddress, city, state, postalCode, country, taxId, taxIdType: 'USA_SSN' },
          { merge: true }
        );
      }
      setOnboardingDone(true);
    } catch (err) {
      console.warn('[Onboarding] Save failed, proceeding anyway:', err.message);
      setOnboardingDone(true);
    } finally {
      setSaving(false);
    }
  };

  const { emoji, title, subtitle } = STEP_META[step - 1];
  const isLast = step === TOTAL_STEPS;

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>

        {/* ── Header: back + progress bar ── */}
        <View style={s.header}>
          {step > 1 ? (
            <TouchableOpacity
              onPress={() => setStep((s) => s - 1)}
              style={s.backBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={s.backTxt}>←</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.backBtn} />
          )}
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%` }]} />
          </View>
          <Text style={s.stepCount}>{step}/{TOTAL_STEPS}</Text>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={s.stepEmoji}>{emoji}</Text>
            <Text style={s.title}>{title}</Text>
            <Text style={s.subtitle}>{subtitle}</Text>

            {/* ── Step 1: Age ── */}
            {step === 1 && (
              <View style={s.centerWrapper}>
                <TextInput
                  style={[s.bigInput, ageError && s.bigInputError]}
                  value={age}
                  onChangeText={(v) => { setAgeText(v); setAgeError(null); }}
                  placeholder="25"
                  placeholderTextColor={C.muted}
                  keyboardType="number-pad"
                  maxLength={3}
                  autoFocus
                  textAlign="center"
                />
                <Text style={s.bigInputUnit}>years old</Text>
                {ageError ? <Text style={s.errorTxt}>{ageError}</Text> : null}
              </View>
            )}

            {/* ── Step 2: Monthly income ── */}
            {step === 2 && INCOME_OPTIONS.map((opt) => (
              <ChoiceCard
                key={opt.value}
                label={opt.label}
                selected={incomeRange === opt.value}
                onPress={() => setIncome(opt.value)}
              />
            ))}

            {/* ── Step 3: Experience ── */}
            {step === 3 && EXPERIENCE_OPTIONS.map((opt) => (
              <ChoiceCard
                key={opt.value}
                label={opt.label}
                sub={opt.sub}
                selected={experience === opt.value}
                onPress={() => setExperience(opt.value)}
              />
            ))}

            {/* ── Step 4: Risk profile ── */}
            {step === 4 && RISK_OPTIONS.map((opt) => (
              <ChoiceCard
                key={opt.value}
                emoji={opt.emoji}
                label={opt.label}
                sub={opt.sub}
                selected={riskProfile === opt.value}
                onPress={() => setRisk(opt.value)}
              />
            ))}

            {/* ── Step 5: First name ── */}
            {step === 5 && (
              <View style={s.centerWrapper}>
                <TextInput
                  style={[s.bigTextInput, firstNameError && s.bigInputError]}
                  value={firstName}
                  onChangeText={(v) => { setFirstName(v); setFirstNameError(null); }}
                  placeholder="e.g. James"
                  placeholderTextColor={C.muted}
                  autoCapitalize="words"
                  autoFocus
                  textAlign="center"
                />
                {firstNameError ? <Text style={s.errorTxt}>{firstNameError}</Text> : null}
              </View>
            )}

            {/* ── Step 6: Last name + middle ── */}
            {step === 6 && (
              <View style={s.stackedInputs}>
                <View>
                  <Text style={s.fieldLabel}>Last name</Text>
                  <TextInput
                    style={[s.fieldInput, lastName1Error && s.fieldInputError]}
                    value={lastName1}
                    onChangeText={(v) => { setLastName1(v); setLastName1Error(null); }}
                    placeholder="e.g. Rivera"
                    placeholderTextColor={C.muted}
                    autoCapitalize="words"
                    autoFocus
                  />
                  {lastName1Error ? <Text style={s.errorTxt}>{lastName1Error}</Text> : null}
                </View>
                <View>
                  <Text style={s.fieldLabel}>Middle name <Text style={s.optional}>(optional)</Text></Text>
                  <TextInput
                    style={s.fieldInput}
                    value={lastName2}
                    onChangeText={setLastName2}
                    placeholder="e.g. Michael (optional)"
                    placeholderTextColor={C.muted}
                    autoCapitalize="words"
                  />
                </View>
              </View>
            )}

            {/* ── Step 7: Date of birth (MM / DD / YYYY) ── */}
            {step === 7 && (
              <View style={s.centerWrapper}>
                <View style={s.dobRow}>
                  <View style={s.dobField}>
                    <Text style={s.dobLabel}>Month</Text>
                    <TextInput
                      style={[s.dobInput, dobError && s.bigInputError]}
                      value={dobMonth}
                      onChangeText={(v) => {
                        setDobMonth(v);
                        setDobError(null);
                        if (v.length === 2) dayRef.current?.focus();
                      }}
                      placeholder="MM"
                      placeholderTextColor={C.muted}
                      keyboardType="number-pad"
                      maxLength={2}
                      autoFocus
                      textAlign="center"
                    />
                  </View>
                  <Text style={s.dobSep}>/</Text>
                  <View style={s.dobField}>
                    <Text style={s.dobLabel}>Day</Text>
                    <TextInput
                      ref={dayRef}
                      style={[s.dobInput, dobError && s.bigInputError]}
                      value={dobDay}
                      onChangeText={(v) => {
                        setDobDay(v);
                        setDobError(null);
                        if (v.length === 2) yearRef.current?.focus();
                      }}
                      placeholder="DD"
                      placeholderTextColor={C.muted}
                      keyboardType="number-pad"
                      maxLength={2}
                      textAlign="center"
                    />
                  </View>
                  <Text style={s.dobSep}>/</Text>
                  <View style={[s.dobField, s.dobFieldYear]}>
                    <Text style={s.dobLabel}>Year</Text>
                    <TextInput
                      ref={yearRef}
                      style={[s.dobInput, dobError && s.bigInputError]}
                      value={dobYear}
                      onChangeText={(v) => { setDobYear(v); setDobError(null); }}
                      placeholder="YYYY"
                      placeholderTextColor={C.muted}
                      keyboardType="number-pad"
                      maxLength={4}
                      textAlign="center"
                    />
                  </View>
                </View>
                {dobError ? <Text style={s.errorTxt}>{dobError}</Text> : null}
              </View>
            )}

            {/* ── Step 8: Address ── */}
            {step === 8 && (
              <View style={s.stackedInputs}>
                <View>
                  <Text style={s.fieldLabel}>Street address</Text>
                  <TextInput
                    style={s.fieldInput}
                    value={streetAddress}
                    onChangeText={setStreetAddress}
                    placeholder="e.g. 123 Main St"
                    placeholderTextColor={C.muted}
                    autoCapitalize="words"
                    autoFocus
                  />
                </View>
                <View>
                  <Text style={s.fieldLabel}>City</Text>
                  <TextInput
                    style={s.fieldInput}
                    value={city}
                    onChangeText={setCity}
                    placeholder="e.g. New York"
                    placeholderTextColor={C.muted}
                    autoCapitalize="words"
                  />
                </View>
                <View style={s.twoCol}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>State</Text>
                    <TextInput
                      style={s.fieldInput}
                      value={state}
                      onChangeText={(v) => { setState(v.toUpperCase().slice(0, 2)); }}
                      placeholder="e.g. NY"
                      placeholderTextColor={C.muted}
                      autoCapitalize="characters"
                      maxLength={2}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>ZIP code</Text>
                    <TextInput
                      style={[s.fieldInput, addressError && validateZip(postalCode) && s.fieldInputError]}
                      value={postalCode}
                      onChangeText={(v) => { setPostalCode(v); setAddressError(null); }}
                      placeholder="e.g. 10001"
                      placeholderTextColor={C.muted}
                      keyboardType="number-pad"
                      maxLength={5}
                    />
                  </View>
                </View>
                {addressError ? <Text style={s.errorTxt}>{addressError}</Text> : null}
              </View>
            )}

            {/* ── Step 9: SSN ── */}
            {step === 9 && (
              <View style={s.stackedInputs}>
                <View>
                  <Text style={s.ssnLabel}>Social Security Number (SSN)</Text>
                  <TextInput
                    style={[s.fieldInput, taxIdError && s.fieldInputError]}
                    value={taxId}
                    onChangeText={(v) => {
                      setTaxId(formatSsn(v));
                      setTaxIdError(null);
                    }}
                    placeholder="e.g. 123-45-6789"
                    placeholderTextColor={C.muted}
                    keyboardType="number-pad"
                    maxLength={11}
                    autoFocus
                  />
                  {taxIdError ? <Text style={s.errorTxt}>{taxIdError}</Text> : null}
                </View>
                <Text style={s.legalNote}>
                  Your SSN is used to verify your identity. It is encrypted and sent directly to our brokerage partner.
                </Text>
              </View>
            )}

            {/* ── Step 10: Bank link ── */}
            {step === 10 && (
              <View style={s.stackedInputs}>
                {/* Security notice */}
                <View style={s.securityBanner}>
                  <Text style={s.securityBannerTitle}>🔒 Your bank details are never stored by Loopi</Text>
                  <Text style={s.securityBannerBody}>
                    All information is encrypted and sent directly to Alpaca Securities, our SIPC-insured brokerage partner. Loopi never has access to your credentials.
                  </Text>
                </View>

                <View>
                  <Text style={s.fieldLabel}>Routing number</Text>
                  <TextInput
                    style={[s.fieldInput, routingError && s.fieldInputError]}
                    value={routingNumber}
                    onChangeText={(v) => {
                      const digits = v.replace(/\D/g, '').slice(0, 9);
                      setRoutingNumber(digits);
                      setRoutingError(null);
                    }}
                    placeholder="e.g. 021000021"
                    placeholderTextColor={C.muted}
                    keyboardType="number-pad"
                    maxLength={9}
                    autoFocus
                  />
                  {routingError ? <Text style={s.errorTxt}>{routingError}</Text> : null}
                </View>
                <View>
                  <Text style={s.fieldLabel}>Account number</Text>
                  <TextInput
                    style={[s.fieldInput, accountNumError && s.fieldInputError]}
                    value={bankAccountNum}
                    onChangeText={(v) => {
                      const digits = v.replace(/\D/g, '').slice(0, 17);
                      setBankAccountNum(digits);
                      setAccountNumError(null);
                    }}
                    placeholder="e.g. 000123456789"
                    placeholderTextColor={C.muted}
                    keyboardType="number-pad"
                    maxLength={17}
                    secureTextEntry
                  />
                  {accountNumError ? <Text style={s.errorTxt}>{accountNumError}</Text> : null}
                </View>
                {bankLinkError ? <Text style={s.errorTxt}>{bankLinkError}</Text> : null}
              </View>
            )}

          </ScrollView>
        </KeyboardAvoidingView>

        {/* ── Footer CTA ── */}
        <View style={s.footer}>
          <TouchableOpacity
            style={[s.nextBtn, (!canProceed() || saving || bankLinkLoading) && s.nextBtnDisabled]}
            onPress={handleNext}
            disabled={!canProceed() || saving || bankLinkLoading}
            activeOpacity={0.85}
          >
            {saving || bankLinkLoading
              ? <ActivityIndicator color="#FFF" />
              : <Text style={s.nextBtnTxt}>{step === TOTAL_STEPS ? 'Link bank →' : isLast ? 'Start investing →' : 'Next →'}</Text>
            }
          </TouchableOpacity>
          {step === TOTAL_STEPS && (
            <TouchableOpacity
              onPress={handleFinish}
              disabled={saving || bankLinkLoading}
              activeOpacity={0.7}
              style={s.skipLink}
            >
              <Text style={s.skipLinkTxt}>Skip for now</Text>
            </TouchableOpacity>
          )}
        </View>

      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  safe:      { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 20,
  },
  backBtn:  { width: 32, alignItems: 'flex-start' },
  backTxt:  { fontSize: 24, color: C.text, fontFamily: F.bold },
  progressTrack: {
    flex: 1, height: 4, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: C.orange, borderRadius: 2 },
  stepCount: { fontSize: 12, color: C.muted, fontFamily: F.medium, width: 32, textAlign: 'right' },

  scroll: { paddingHorizontal: 24, paddingBottom: 24 },

  stepEmoji: { fontSize: 52, marginBottom: 20 },
  title:     { fontSize: 26, fontFamily: F.xbold, color: C.text, letterSpacing: -0.5, lineHeight: 33, marginBottom: 10 },
  subtitle:  { fontSize: 14, fontFamily: F.regular, color: C.sub, lineHeight: 22, marginBottom: 28 },

  errorTxt: { fontSize: 13, color: C.red, fontFamily: F.medium, marginTop: 8 },

  // ── Centered single-input steps ──
  centerWrapper: { alignItems: 'center', marginTop: 8 },

  bigInput: {
    fontSize: 72, fontFamily: F.xbold, color: C.text, letterSpacing: -3,
    borderBottomWidth: 3, borderBottomColor: C.orange,
    paddingVertical: 4, width: 200, textAlign: 'center',
  },
  bigInputUnit: { fontSize: 18, fontFamily: F.medium, color: C.muted, marginTop: 10 },

  bigTextInput: {
    fontSize: 36, fontFamily: F.xbold, color: C.text, letterSpacing: -1,
    borderBottomWidth: 3, borderBottomColor: C.orange,
    paddingVertical: 8, width: '100%', textAlign: 'center',
  },
  bigInputError: { borderBottomColor: C.red },

  // ── Choice cards ──
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border,
    borderRadius: 18, padding: 18, marginBottom: 10,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  cardActive:      { borderColor: C.orange, backgroundColor: C.orangeLight },
  cardEmoji:       { fontSize: 28 },
  cardLabel:       { fontSize: 16, fontFamily: F.semibold, color: C.text, marginBottom: 2 },
  cardLabelActive: { color: C.orange },
  cardSub:         { fontSize: 13, fontFamily: F.regular, color: C.muted, lineHeight: 18 },
  check:           { fontSize: 16, color: C.orange, fontFamily: F.bold },

  // ── Stacked text inputs ──
  stackedInputs: { gap: 16 },
  twoCol: { flexDirection: 'row', gap: 12 },
  fieldLabel: {
    fontSize: 12, fontFamily: F.semibold, color: C.muted,
    letterSpacing: 0.3, marginBottom: 8,
  },
  ssnLabel: {
    fontSize: 14, fontFamily: F.semibold, color: C.text,
    marginBottom: 10,
  },
  optional: { fontFamily: F.regular, color: C.muted },
  fieldInput: {
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, fontFamily: F.regular, color: C.text,
  },
  fieldInputError: { borderColor: C.red },

  // ── Date of birth ──
  dobRow:       { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  dobField:     { flex: 1, alignItems: 'center' },
  dobFieldYear: { flex: 2 },
  dobLabel:     { fontSize: 11, fontFamily: F.semibold, color: C.muted, letterSpacing: 0.5, marginBottom: 8 },
  dobInput: {
    fontSize: 28, fontFamily: F.xbold, color: C.text, letterSpacing: -1,
    borderBottomWidth: 3, borderBottomColor: C.orange,
    paddingVertical: 4, width: '100%', textAlign: 'center',
  },
  dobSep: { fontSize: 24, fontFamily: F.bold, color: C.muted, marginBottom: 10 },

  // ── Legal note ──
  legalNote: {
    fontSize: 12, fontFamily: F.regular, color: C.muted,
    lineHeight: 18, textAlign: 'center', paddingHorizontal: 8,
  },

  // ── Bank security banner ──
  securityBanner: {
    backgroundColor: C.orange, borderRadius: 16, padding: 16,
  },
  securityBannerTitle: {
    fontSize: 14, fontFamily: F.bold, color: '#FFF', marginBottom: 8,
  },
  securityBannerBody: {
    fontSize: 13, fontFamily: F.regular, color: 'rgba(255,255,255,0.9)', lineHeight: 20,
  },

  // ── Footer ──
  footer: { paddingHorizontal: 24, paddingBottom: 16, paddingTop: 8, gap: 12 },
  skipLink: { alignItems: 'center' },
  skipLinkTxt: { fontSize: 14, color: C.muted, fontFamily: F.medium },
  nextBtn: {
    backgroundColor: C.orange, borderRadius: 18, paddingVertical: 18,
    alignItems: 'center',
    shadowColor: C.orange, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 14, elevation: 7,
  },
  nextBtnDisabled: { opacity: 0.4, shadowOpacity: 0 },
  nextBtnTxt: { fontSize: 17, fontFamily: F.bold, color: '#FFF', letterSpacing: 0.2 },
});
