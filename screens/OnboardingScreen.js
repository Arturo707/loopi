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

const TOTAL_STEPS = 9;

const INCOME_OPTIONS = [
  { value: '<1000',     label: 'Menos de 1.000€' },
  { value: '1000-2000', label: '1.000 – 2.000€'  },
  { value: '2000-3500', label: '2.000 – 3.500€'  },
  { value: '3500+',     label: '3.500€ o más'    },
];

const EXPERIENCE_OPTIONS = [
  { value: 'Ninguna', label: 'Ninguna', sub: 'Nunca he invertido' },
  { value: 'Algo',    label: 'Algo',    sub: 'He invertido alguna vez' },
  { value: 'Experto', label: 'Experto', sub: 'Invierto de forma regular' },
];

const RISK_OPTIONS = [
  {
    value: 'Conservador', emoji: '🛡️', label: 'Conservador',
    sub: 'Prefiero seguridad. ETFs y activos estables con rentabilidad predecible.',
  },
  {
    value: 'Moderado', emoji: '⚖️', label: 'Moderado',
    sub: 'Equilibrio entre seguridad y crecimiento. El perfil más popular.',
  },
  {
    value: 'Atrevido', emoji: '🚀', label: 'Atrevido',
    sub: 'Alta rentabilidad potencial con mayor riesgo. Para maximizar rendimientos.',
  },
];

const STEP_META = [
  { emoji: '🎂', title: '¿Cuántos años tienes?',                  subtitle: 'Tu edad define cuánto tiempo tienes para que tu dinero crezca.' },
  { emoji: '💰', title: '¿Cuáles son tus ingresos mensuales?',    subtitle: 'Invertiremos solo lo que sobra, nunca lo que necesitas para vivir.' },
  { emoji: '📊', title: '¿Cuánta experiencia tienes invirtiendo?', subtitle: 'Sé honesto — nos ayuda a personalizar tus recomendaciones.' },
  { emoji: '🎯', title: '¿Cuál es tu perfil de riesgo?',          subtitle: 'Sin presiones — puedes cambiarlo cuando quieras desde tu perfil.' },
  { emoji: '👤', title: '¿Cuál es tu nombre?',                    subtitle: 'Tal como aparece en tu documento de identidad.' },
  { emoji: '📝', title: '¿Y tus apellidos?',                      subtitle: 'Tal como figuran en tu DNI, NIE o pasaporte.' },
  { emoji: '📅', title: '¿Cuándo naciste?',                       subtitle: 'Tu fecha de nacimiento completa.' },
  { emoji: '🏠', title: '¿Dónde vives?',                          subtitle: 'Tu dirección de residencia actual.' },
  { emoji: '🪪', title: '¿Cuál es tu DNI, NIE o pasaporte?',      subtitle: 'Lo necesitamos para verificar tu identidad y abrir tu cuenta.' },
];

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
  const { saveProfile }       = useApp();

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
  const [firstName, setFirstName]       = useState('');
  const [firstNameError, setFirstNameError] = useState(null);

  // ── Step 6: Last names ──
  const [lastName1, setLastName1]         = useState('');
  const [lastName2, setLastName2]         = useState('');
  const [lastName1Error, setLastName1Error] = useState(null);

  // ── Step 7: Date of birth ──
  const [dobDay,   setDobDay]   = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear,  setDobYear]  = useState('');
  const [dobError, setDobError] = useState(null);
  const monthRef = useRef(null);
  const yearRef  = useRef(null);

  // ── Step 8: Address ──
  const [streetAddress, setStreetAddress]         = useState('');
  const [city,          setCity]                  = useState('');
  const [postalCode,    setPostalCode]             = useState('');
  const [country,       setCountry]               = useState('España');
  const [addressError,  setAddressError]           = useState(null);

  // ── Step 9: Tax ID ──
  const [taxId,      setTaxId]      = useState('');
  const [taxIdError, setTaxIdError] = useState(null);

  // ── Validation helpers ──
  const validateAge = (v) => {
    const n = parseInt(v, 10);
    if (!v.trim()) return 'Introduce tu edad.';
    if (isNaN(n) || n < 16 || n > 100) return 'Introduce una edad entre 16 y 100.';
    return null;
  };

  const validateDob = () => {
    const d = parseInt(dobDay, 10);
    const m = parseInt(dobMonth, 10);
    const y = parseInt(dobYear, 10);
    if (!dobDay || !dobMonth || !dobYear) return 'Completa tu fecha de nacimiento.';
    if (dobDay.length !== 2 || dobMonth.length !== 2 || dobYear.length !== 4)
      return 'Formato: DD MM AAAA.';
    if (d < 1 || d > 31) return 'Día no válido.';
    if (m < 1 || m > 12) return 'Mes no válido.';
    if (y < 1900 || y > new Date().getFullYear() - 16) return 'Año no válido.';
    return null;
  };

  const canProceed = () => {
    switch (step) {
      case 1: return age.trim().length > 0 && !validateAge(age);
      case 2: return !!incomeRange;
      case 3: return !!experience;
      case 4: return !!riskProfile;
      case 5: return firstName.trim().length > 0;
      case 6: return lastName1.trim().length > 0;
      case 7: return dobDay.length === 2 && dobMonth.length === 2 && dobYear.length === 4 && !validateDob();
      case 8: return streetAddress.trim().length > 0 && city.trim().length > 0 && country.trim().length > 0;
      case 9: return taxId.trim().length > 0;
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
      if (!firstName.trim()) { setFirstNameError('Introduce tu nombre.'); return; }
      setFirstNameError(null);
    }
    if (step === 6) {
      if (!lastName1.trim()) { setLastName1Error('Introduce al menos el primer apellido.'); return; }
      setLastName1Error(null);
    }
    if (step === 7) {
      const err = validateDob();
      if (err) { setDobError(err); return; }
      setDobError(null);
    }
    if (step === 8) {
      if (!streetAddress.trim() || !city.trim() || !country.trim()) {
        setAddressError('Completa los campos obligatorios.');
        return;
      }
      setAddressError(null);
    }
    if (step === 9) {
      if (!taxId.trim()) { setTaxIdError('Introduce tu documento de identidad.'); return; }
      setTaxIdError(null);
    }

    if (step < TOTAL_STEPS) {
      setStep((s) => s + 1);
    } else {
      handleFinish();
    }
  };

  const handleFinish = async () => {
    setSaving(true);
    const lastName = [lastName1.trim(), lastName2.trim()].filter(Boolean).join(' ');
    const dateOfBirth = `${dobDay}/${dobMonth}/${dobYear}`;
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
          { firstName, lastName, dateOfBirth, streetAddress, city, postalCode, country, taxId },
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
                <Text style={s.bigInputUnit}>años</Text>
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
                  placeholder="Ana"
                  placeholderTextColor={C.muted}
                  autoCapitalize="words"
                  autoFocus
                  textAlign="center"
                />
                {firstNameError ? <Text style={s.errorTxt}>{firstNameError}</Text> : null}
              </View>
            )}

            {/* ── Step 6: Last names ── */}
            {step === 6 && (
              <View style={s.stackedInputs}>
                <View>
                  <Text style={s.fieldLabel}>Primer apellido</Text>
                  <TextInput
                    style={[s.fieldInput, lastName1Error && s.fieldInputError]}
                    value={lastName1}
                    onChangeText={(v) => { setLastName1(v); setLastName1Error(null); }}
                    placeholder="García"
                    placeholderTextColor={C.muted}
                    autoCapitalize="words"
                    autoFocus
                  />
                  {lastName1Error ? <Text style={s.errorTxt}>{lastName1Error}</Text> : null}
                </View>
                <View>
                  <Text style={s.fieldLabel}>Segundo apellido <Text style={s.optional}>(opcional)</Text></Text>
                  <TextInput
                    style={s.fieldInput}
                    value={lastName2}
                    onChangeText={setLastName2}
                    placeholder="Martínez"
                    placeholderTextColor={C.muted}
                    autoCapitalize="words"
                  />
                </View>
              </View>
            )}

            {/* ── Step 7: Date of birth ── */}
            {step === 7 && (
              <View style={s.centerWrapper}>
                <View style={s.dobRow}>
                  <View style={s.dobBox}>
                    <Text style={s.dobLabel}>Día</Text>
                    <TextInput
                      style={[s.dobInput, dobError && s.bigInputError]}
                      value={dobDay}
                      onChangeText={(v) => {
                        setDobDay(v);
                        setDobError(null);
                        if (v.length === 2) monthRef.current?.focus();
                      }}
                      placeholder="DD"
                      placeholderTextColor={C.muted}
                      keyboardType="number-pad"
                      maxLength={2}
                      autoFocus
                      textAlign="center"
                    />
                  </View>
                  <Text style={s.dobSep}>/</Text>
                  <View style={s.dobBox}>
                    <Text style={s.dobLabel}>Mes</Text>
                    <TextInput
                      ref={monthRef}
                      style={[s.dobInput, dobError && s.bigInputError]}
                      value={dobMonth}
                      onChangeText={(v) => {
                        setDobMonth(v);
                        setDobError(null);
                        if (v.length === 2) yearRef.current?.focus();
                      }}
                      placeholder="MM"
                      placeholderTextColor={C.muted}
                      keyboardType="number-pad"
                      maxLength={2}
                      textAlign="center"
                    />
                  </View>
                  <Text style={s.dobSep}>/</Text>
                  <View style={[s.dobBox, s.dobBoxYear]}>
                    <Text style={s.dobLabel}>Año</Text>
                    <TextInput
                      ref={yearRef}
                      style={[s.dobInput, dobError && s.bigInputError]}
                      value={dobYear}
                      onChangeText={(v) => { setDobYear(v); setDobError(null); }}
                      placeholder="AAAA"
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
                  <Text style={s.fieldLabel}>Calle y número</Text>
                  <TextInput
                    style={s.fieldInput}
                    value={streetAddress}
                    onChangeText={setStreetAddress}
                    placeholder="Calle Mayor 12, 3º A"
                    placeholderTextColor={C.muted}
                    autoCapitalize="words"
                    autoFocus
                  />
                </View>
                <View>
                  <Text style={s.fieldLabel}>Ciudad</Text>
                  <TextInput
                    style={s.fieldInput}
                    value={city}
                    onChangeText={setCity}
                    placeholder="Madrid"
                    placeholderTextColor={C.muted}
                    autoCapitalize="words"
                  />
                </View>
                <View>
                  <Text style={s.fieldLabel}>Código postal <Text style={s.optional}>(opcional)</Text></Text>
                  <TextInput
                    style={s.fieldInput}
                    value={postalCode}
                    onChangeText={setPostalCode}
                    placeholder="28001"
                    placeholderTextColor={C.muted}
                    keyboardType="number-pad"
                    maxLength={10}
                  />
                </View>
                <View>
                  <Text style={s.fieldLabel}>País</Text>
                  <TextInput
                    style={s.fieldInput}
                    value={country}
                    onChangeText={setCountry}
                    placeholder="España"
                    placeholderTextColor={C.muted}
                    autoCapitalize="words"
                  />
                </View>
                {addressError ? <Text style={s.errorTxt}>{addressError}</Text> : null}
              </View>
            )}

            {/* ── Step 9: Tax ID ── */}
            {step === 9 && (
              <View style={s.centerWrapper}>
                <TextInput
                  style={[s.bigTextInput, taxIdError && s.bigInputError]}
                  value={taxId}
                  onChangeText={(v) => { setTaxId(v); setTaxIdError(null); }}
                  placeholder="12345678A"
                  placeholderTextColor={C.muted}
                  autoCapitalize="characters"
                  autoFocus
                  textAlign="center"
                />
                {taxIdError ? <Text style={s.errorTxt}>{taxIdError}</Text> : null}
                <Text style={s.legalNote}>
                  Requerido para operar en mercados financieros (MiFID II)
                </Text>
              </View>
            )}

          </ScrollView>
        </KeyboardAvoidingView>

        {/* ── Footer CTA ── */}
        <View style={s.footer}>
          <TouchableOpacity
            style={[s.nextBtn, (!canProceed() || saving) && s.nextBtnDisabled]}
            onPress={handleNext}
            disabled={!canProceed() || saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#FFF" />
              : <Text style={s.nextBtnTxt}>{isLast ? 'Empezar a invertir →' : 'Siguiente →'}</Text>
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
  progressTrack: {
    flex: 1, height: 4, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: C.orange, borderRadius: 2 },
  stepCount: { fontSize: 12, color: C.muted, fontFamily: F.medium, width: 32, textAlign: 'right' },

  scroll: { paddingHorizontal: 24, paddingBottom: 24 },

  stepEmoji: { fontSize: 52, marginBottom: 20 },
  title:     { fontSize: 26, fontFamily: F.xbold, color: C.text, letterSpacing: -0.5, lineHeight: 33, marginBottom: 10 },
  subtitle:  { fontSize: 14, fontFamily: F.regular, color: C.sub, lineHeight: 22, marginBottom: 28 },

  errorTxt: { fontSize: 13, color: C.red, fontFamily: F.medium, marginTop: 12, textAlign: 'center' },

  // ── Centered single-input steps (age, name, taxId) ──
  centerWrapper: { alignItems: 'center', marginTop: 8 },

  // Age-style big number input
  bigInput: {
    fontSize: 72, fontFamily: F.xbold, color: C.text, letterSpacing: -3,
    borderBottomWidth: 3, borderBottomColor: C.orange,
    paddingVertical: 4, width: 200, textAlign: 'center',
  },
  bigInputUnit: { fontSize: 18, fontFamily: F.medium, color: C.muted, marginTop: 10 },

  // Text-style big input (name, taxId)
  bigTextInput: {
    fontSize: 36, fontFamily: F.xbold, color: C.text, letterSpacing: -1,
    borderBottomWidth: 3, borderBottomColor: C.orange,
    paddingVertical: 8, width: '100%', textAlign: 'center',
  },
  bigInputError: { borderBottomColor: C.red },

  // ── Choice cards (income, experience, risk) ──
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

  // ── Stacked text inputs (last names, address) ──
  stackedInputs: { gap: 16 },
  fieldLabel: {
    fontSize: 12, fontFamily: F.semibold, color: C.muted,
    letterSpacing: 0.3, marginBottom: 8,
  },
  optional: { fontFamily: F.regular, color: C.muted },
  fieldInput: {
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, fontFamily: F.regular, color: C.text,
  },
  fieldInputError: { borderColor: C.red },

  // ── Date of birth ──
  dobRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  dobBox: { alignItems: 'center' },
  dobBoxYear: { width: 96 },
  dobLabel: { fontSize: 11, fontFamily: F.semibold, color: C.muted, letterSpacing: 0.5, marginBottom: 8 },
  dobInput: {
    fontSize: 32, fontFamily: F.xbold, color: C.text, letterSpacing: -1,
    borderBottomWidth: 3, borderBottomColor: C.orange,
    paddingVertical: 4, width: 64, textAlign: 'center',
  },
  dobSep: { fontSize: 28, fontFamily: F.bold, color: C.muted, marginBottom: 8 },

  // ── Legal note ──
  legalNote: {
    fontSize: 12, fontFamily: F.regular, color: C.muted,
    lineHeight: 18, marginTop: 24, textAlign: 'center', paddingHorizontal: 16,
  },

  // ── Footer ──
  footer: { paddingHorizontal: 24, paddingBottom: 16, paddingTop: 8 },
  nextBtn: {
    backgroundColor: C.orange, borderRadius: 18, paddingVertical: 18,
    alignItems: 'center',
    shadowColor: C.orange, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 14, elevation: 7,
  },
  nextBtnDisabled: { opacity: 0.4, shadowOpacity: 0 },
  nextBtnTxt: { fontSize: 17, fontFamily: F.bold, color: '#FFF', letterSpacing: 0.2 },
});
