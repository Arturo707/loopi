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

const TOTAL_STEPS = 4;

const EXPERIENCE_OPTIONS = [
  { value: 'None',   label: 'None',   sub: 'Never invested before' },
  { value: 'Some',   label: 'Some',   sub: 'Invested a few times'  },
  { value: 'Expert', label: 'Expert', sub: 'I invest regularly'    },
];

const RISK_OPTIONS = [
  { value: 'Conservative', emoji: '🛡️', label: 'Conservative', sub: 'Safety first. ETFs and stable assets with predictable returns.' },
  { value: 'Moderate',     emoji: '⚖️', label: 'Moderate',     sub: 'Balance between safety and growth. The most popular pick.'   },
  { value: 'Aggressive',   emoji: '🚀', label: 'Aggressive',   sub: 'High potential returns with higher risk. For those who want to go all in.' },
];

const STEP_META = [
  { emoji: '🎂', title: 'When were you born?',                    subtitle: 'Your date of birth, used to verify your age.' },
  { emoji: '📊', title: 'How much investing experience do you have?', subtitle: 'Be honest — it helps us tailor your recommendations.' },
  { emoji: '🎯', title: "What's your risk profile?",               subtitle: 'No pressure — you can change it anytime from your profile.' },
  { emoji: '👤', title: "What's your name?",                       subtitle: 'As it appears on your ID.' },
];

function ChoiceCard({ label, sub, emoji, selected, onPress }) {
  return (
    <TouchableOpacity style={[s.card, selected && s.cardActive]} onPress={onPress} activeOpacity={0.7}>
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
  const { setRiskProfile } = useApp();

  const [step, setStepp]  = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1: DOB
  const [dobMonth, setDobMonth] = useState('');
  const [dobDay,   setDobDay]   = useState('');
  const [dobYear,  setDobYear]  = useState('');
  const [dobError, setDobError] = useState(null);
  const dayRef  = useRef(null);
  const yearRef = useRef(null);

  // Step 2: Experience
  const [experience, setExperience] = useState(null);

  // Step 3: Risk profile
  const [riskProfile, setRisk] = useState(null);

  // Step 4: Name
  const [firstName,      setFirstName]      = useState('');
  const [lastName,       setLastName]       = useState('');
  const [nameError,      setNameError]      = useState(null);

  const validateDob = () => {
    const m = parseInt(dobMonth, 10);
    const d = parseInt(dobDay,   10);
    const y = parseInt(dobYear,  10);
    if (!dobMonth || !dobDay || !dobYear) return 'Enter your full date of birth.';
    if (dobMonth.length !== 2 || dobDay.length !== 2 || dobYear.length !== 4) return 'Use MM / DD / YYYY format.';
    if (m < 1 || m > 12) return 'Invalid month.';
    if (d < 1 || d > 31) return 'Invalid day.';
    if (y < 1900)        return 'Invalid year.';
    const dob = new Date(y, m - 1, d);
    const threshold = new Date();
    threshold.setFullYear(threshold.getFullYear() - 18);
    if (dob > threshold) return 'You must be at least 18 years old.';
    return null;
  };

  const validateName = (v) => {
    if (v.trim().length < 2) return 'Must be at least 2 characters.';
    if (/\d/.test(v))        return 'Name cannot contain numbers.';
    return null;
  };

  const canProceed = () => {
    switch (step) {
      case 1: return dobMonth.length === 2 && dobDay.length === 2 && dobYear.length === 4 && !validateDob();
      case 2: return !!experience;
      case 3: return !!riskProfile;
      case 4: return !validateName(firstName) && !validateName(lastName);
      default: return false;
    }
  };

  const handleNext = async () => {
    if (step === 1) {
      const err = validateDob();
      if (err) { setDobError(err); return; }
      setDobError(null);
    }
    if (step === 4) {
      const fnErr = validateName(firstName);
      const lnErr = validateName(lastName);
      if (fnErr || lnErr) { setNameError(fnErr || lnErr); return; }
      setNameError(null);
      await handleFinish();
      return;
    }
    setStepp((s) => s + 1);
  };

  const handleFinish = async () => {
    setSaving(true);
    const dateOfBirth = `${dobYear}-${dobMonth}-${dobDay}`;
    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        await setDoc(
          doc(db, 'users', uid),
          { firstName: firstName.trim(), lastName: lastName.trim(), dateOfBirth, experience, riskProfile, onboardingDone: true },
          { merge: true }
        );
      }
      setRiskProfile(riskProfile);
      setOnboardingDone(true);
    } catch (err) {
      console.warn('[Onboarding] Save failed, proceeding anyway:', err.message);
      setOnboardingDone(true);
    } finally {
      setSaving(false);
    }
  };

  const meta = STEP_META[step - 1];

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>

        {/* Header: back + progress bar */}
        <View style={s.header}>
          {step > 1 ? (
            <TouchableOpacity onPress={() => setStepp((s) => s - 1)} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
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
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

            <Text style={s.stepEmoji}>{meta.emoji}</Text>
            <Text style={s.title}>{meta.title}</Text>
            <Text style={s.subtitle}>{meta.subtitle}</Text>

            {/* Step 1: Date of birth */}
            {step === 1 && (
              <View style={s.centerWrapper}>
                <View style={s.dobRow}>
                  <View style={s.dobField}>
                    <Text style={s.dobLabel}>Month</Text>
                    <TextInput
                      style={[s.dobInput, dobError && s.dobInputError]}
                      value={dobMonth}
                      onChangeText={(v) => { setDobMonth(v); setDobError(null); if (v.length === 2) dayRef.current?.focus(); }}
                      placeholder="MM" placeholderTextColor={C.muted}
                      keyboardType="number-pad" maxLength={2} autoFocus textAlign="center"
                    />
                  </View>
                  <Text style={s.dobSep}>/</Text>
                  <View style={s.dobField}>
                    <Text style={s.dobLabel}>Day</Text>
                    <TextInput
                      ref={dayRef}
                      style={[s.dobInput, dobError && s.dobInputError]}
                      value={dobDay}
                      onChangeText={(v) => { setDobDay(v); setDobError(null); if (v.length === 2) yearRef.current?.focus(); }}
                      placeholder="DD" placeholderTextColor={C.muted}
                      keyboardType="number-pad" maxLength={2} textAlign="center"
                    />
                  </View>
                  <Text style={s.dobSep}>/</Text>
                  <View style={[s.dobField, s.dobFieldYear]}>
                    <Text style={s.dobLabel}>Year</Text>
                    <TextInput
                      ref={yearRef}
                      style={[s.dobInput, dobError && s.dobInputError]}
                      value={dobYear}
                      onChangeText={(v) => { setDobYear(v); setDobError(null); }}
                      placeholder="YYYY" placeholderTextColor={C.muted}
                      keyboardType="number-pad" maxLength={4} textAlign="center"
                    />
                  </View>
                </View>
                {dobError ? <Text style={s.errorTxt}>{dobError}</Text> : null}
              </View>
            )}

            {/* Step 2: Experience */}
            {step === 2 && EXPERIENCE_OPTIONS.map((opt) => (
              <ChoiceCard
                key={opt.value} label={opt.label} sub={opt.sub}
                selected={experience === opt.value}
                onPress={() => setExperience(opt.value)}
              />
            ))}

            {/* Step 3: Risk profile */}
            {step === 3 && RISK_OPTIONS.map((opt) => (
              <ChoiceCard
                key={opt.value} emoji={opt.emoji} label={opt.label} sub={opt.sub}
                selected={riskProfile === opt.value}
                onPress={() => setRisk(opt.value)}
              />
            ))}

            {/* Step 4: Name */}
            {step === 4 && (
              <View style={s.stackedInputs}>
                <View>
                  <Text style={s.fieldLabel}>First name</Text>
                  <TextInput
                    style={s.fieldInput}
                    value={firstName}
                    onChangeText={(v) => { setFirstName(v); setNameError(null); }}
                    placeholder="e.g. James" placeholderTextColor={C.muted}
                    autoCapitalize="words" autoFocus
                  />
                </View>
                <View>
                  <Text style={s.fieldLabel}>Last name</Text>
                  <TextInput
                    style={s.fieldInput}
                    value={lastName}
                    onChangeText={(v) => { setLastName(v); setNameError(null); }}
                    placeholder="e.g. Rivera" placeholderTextColor={C.muted}
                    autoCapitalize="words"
                  />
                </View>
                {nameError ? <Text style={s.errorTxt}>{nameError}</Text> : null}
              </View>
            )}

          </ScrollView>
        </KeyboardAvoidingView>

        {/* Footer CTA */}
        <View style={s.footer}>
          <TouchableOpacity
            style={[s.nextBtn, (!canProceed() || saving) && s.nextBtnDisabled]}
            onPress={handleNext}
            disabled={!canProceed() || saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#FFF" />
              : <Text style={s.nextBtnTxt}>{step === TOTAL_STEPS ? 'Start investing →' : 'Next →'}</Text>
            }
          </TouchableOpacity>
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
  progressTrack: { flex: 1, height: 4, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden' },
  progressFill:  { height: '100%', backgroundColor: C.orange, borderRadius: 2 },
  stepCount: { fontSize: 12, color: C.muted, fontFamily: F.medium, width: 32, textAlign: 'right' },

  scroll: { paddingHorizontal: 24, paddingBottom: 24 },

  stepEmoji: { fontSize: 52, marginBottom: 20 },
  title:     { fontSize: 26, fontFamily: F.xbold, color: C.text, letterSpacing: -0.5, lineHeight: 33, marginBottom: 10 },
  subtitle:  { fontSize: 14, fontFamily: F.regular, color: C.sub, lineHeight: 22, marginBottom: 28 },
  errorTxt:  { fontSize: 13, color: C.red, fontFamily: F.medium, marginTop: 10, textAlign: 'center' },

  // DOB
  centerWrapper: { alignItems: 'center', marginTop: 8 },
  dobRow:       { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  dobField:     { flex: 1, alignItems: 'center' },
  dobFieldYear: { flex: 2 },
  dobLabel:     { fontSize: 11, fontFamily: F.semibold, color: C.muted, letterSpacing: 0.5, marginBottom: 8 },
  dobInput: {
    fontSize: 28, fontFamily: F.xbold, color: C.text, letterSpacing: -1,
    borderBottomWidth: 3, borderBottomColor: C.orange,
    paddingVertical: 4, width: '100%', textAlign: 'center',
  },
  dobInputError: { borderBottomColor: C.red },
  dobSep: { fontSize: 24, fontFamily: F.bold, color: C.muted, marginBottom: 10 },

  // Choice cards
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

  // Name step
  stackedInputs: { gap: 16 },
  fieldLabel: { fontSize: 12, fontFamily: F.semibold, color: C.muted, letterSpacing: 0.3, marginBottom: 8 },
  fieldInput: {
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, fontFamily: F.regular, color: C.text,
  },

  // Footer
  footer: { paddingHorizontal: 24, paddingBottom: 16, paddingTop: 8 },
  nextBtn: {
    backgroundColor: C.orange, borderRadius: 18, paddingVertical: 18, alignItems: 'center',
    shadowColor: C.orange, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 14, elevation: 7,
  },
  nextBtnDisabled: { opacity: 0.4, shadowOpacity: 0 },
  nextBtnTxt: { fontSize: 17, fontFamily: F.bold, color: '#FFF', letterSpacing: 0.2 },
});
