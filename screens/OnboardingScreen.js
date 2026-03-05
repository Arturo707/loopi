import React, { useState } from 'react';
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

const TOTAL_STEPS = 5;

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
  { emoji: '🎂', title: '¿Cuántos años tienes?',               subtitle: 'Tu edad define cuánto tiempo tienes para que tu dinero crezca.' },
  { emoji: '💰', title: '¿Cuáles son tus ingresos mensuales?', subtitle: 'Invertiremos solo lo que sobra, nunca lo que necesitas para vivir.' },
  { emoji: '📊', title: '¿Cuánta experiencia tienes invirtiendo?', subtitle: 'Sé honesto — nos ayuda a personalizar tus recomendaciones.' },
  { emoji: '🎯', title: '¿Cuál es tu perfil de riesgo?',        subtitle: 'Sin presiones — puedes cambiarlo cuando quieras desde tu perfil.' },
  { emoji: '🪪', title: 'Tu identidad',                         subtitle: 'Necesitamos estos datos para crear tu cuenta de bróker y operar en mercados regulados.' },
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

  const [step, setStep]             = useState(1);
  const [age, setAgeText]           = useState('');
  const [ageError, setAgeError]     = useState(null);
  const [incomeRange, setIncome]    = useState(null);
  const [experience, setExperience] = useState(null);
  const [riskProfile, setRisk]      = useState(null);
  const [saving, setSaving]         = useState(false);

  // Step 5: identity
  const [firstName,     setFirstName]     = useState('');
  const [lastName,      setLastName]      = useState('');
  const [dateOfBirth,   setDateOfBirth]   = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [city,          setCity]          = useState('');
  const [postalCode,    setPostalCode]    = useState('');
  const [country,       setCountry]       = useState('España');
  const [taxId,         setTaxId]         = useState('');
  const [idErrors,      setIdErrors]      = useState({});

  const validateAge = (v) => {
    const n = parseInt(v, 10);
    if (!v.trim()) return 'Introduce tu edad.';
    if (isNaN(n) || n < 16 || n > 100) return 'Introduce una edad entre 16 y 100.';
    return null;
  };

  const canProceed = () => {
    if (step === 1) return age.trim().length > 0 && !validateAge(age);
    if (step === 2) return !!incomeRange;
    if (step === 3) return !!experience;
    if (step === 4) return !!riskProfile;
    if (step === 5) return (
      firstName.trim() && lastName.trim() && dateOfBirth.trim() &&
      streetAddress.trim() && city.trim() && country.trim() && taxId.trim()
    );
    return false;
  };

  const handleNext = () => {
    if (step === 1) {
      const err = validateAge(age);
      if (err) { setAgeError(err); return; }
      setAgeError(null);
    }
    if (step === 5) {
      const errs = {};
      if (!firstName.trim())     errs.firstName     = 'Introduce tu nombre.';
      if (!lastName.trim())      errs.lastName      = 'Introduce tu apellido.';
      if (!dateOfBirth.trim())   errs.dateOfBirth   = 'Introduce tu fecha de nacimiento.';
      if (!streetAddress.trim()) errs.streetAddress = 'Introduce tu dirección.';
      if (!city.trim())          errs.city          = 'Introduce tu ciudad.';
      if (!country.trim())       errs.country       = 'Introduce tu país.';
      if (!taxId.trim())         errs.taxId         = 'Introduce tu DNI / NIE / Pasaporte.';
      if (Object.keys(errs).length > 0) { setIdErrors(errs); return; }
      setIdErrors({});
    }
    if (step < TOTAL_STEPS) {
      setStep((s) => s + 1);
    } else {
      handleFinish();
    }
  };

  const handleFinish = async () => {
    setSaving(true);
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
              <View style={s.ageWrapper}>
                <TextInput
                  style={[s.ageInput, ageError && s.ageInputError]}
                  value={age}
                  onChangeText={(v) => { setAgeText(v); setAgeError(null); }}
                  placeholder="25"
                  placeholderTextColor={C.muted}
                  keyboardType="number-pad"
                  maxLength={3}
                  autoFocus
                  textAlign="center"
                />
                <Text style={s.ageUnit}>años</Text>
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

            {/* ── Step 5: Identity ── */}
            {step === 5 && (
              <View style={s.idForm}>

                {/* First + Last name row */}
                <View style={s.nameRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Nombre</Text>
                    <TextInput
                      style={[s.fieldInput, idErrors.firstName && s.fieldInputError]}
                      value={firstName}
                      onChangeText={(v) => { setFirstName(v); setIdErrors((e) => ({ ...e, firstName: null })); }}
                      placeholder="Ana"
                      placeholderTextColor={C.muted}
                      autoCapitalize="words"
                    />
                    {idErrors.firstName ? <Text style={s.fieldError}>{idErrors.firstName}</Text> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Apellido</Text>
                    <TextInput
                      style={[s.fieldInput, idErrors.lastName && s.fieldInputError]}
                      value={lastName}
                      onChangeText={(v) => { setLastName(v); setIdErrors((e) => ({ ...e, lastName: null })); }}
                      placeholder="García"
                      placeholderTextColor={C.muted}
                      autoCapitalize="words"
                    />
                    {idErrors.lastName ? <Text style={s.fieldError}>{idErrors.lastName}</Text> : null}
                  </View>
                </View>

                {/* Date of birth */}
                <Text style={s.fieldLabel}>Fecha de nacimiento</Text>
                <TextInput
                  style={[s.fieldInput, idErrors.dateOfBirth && s.fieldInputError]}
                  value={dateOfBirth}
                  onChangeText={(v) => { setDateOfBirth(v); setIdErrors((e) => ({ ...e, dateOfBirth: null })); }}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor={C.muted}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
                {idErrors.dateOfBirth ? <Text style={s.fieldError}>{idErrors.dateOfBirth}</Text> : null}

                {/* Street address */}
                <Text style={s.fieldLabel}>Dirección</Text>
                <TextInput
                  style={[s.fieldInput, idErrors.streetAddress && s.fieldInputError]}
                  value={streetAddress}
                  onChangeText={(v) => { setStreetAddress(v); setIdErrors((e) => ({ ...e, streetAddress: null })); }}
                  placeholder="Calle Mayor 12, 3º A"
                  placeholderTextColor={C.muted}
                  autoCapitalize="words"
                />
                {idErrors.streetAddress ? <Text style={s.fieldError}>{idErrors.streetAddress}</Text> : null}

                {/* City + Postal code row */}
                <View style={s.nameRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Ciudad</Text>
                    <TextInput
                      style={[s.fieldInput, idErrors.city && s.fieldInputError]}
                      value={city}
                      onChangeText={(v) => { setCity(v); setIdErrors((e) => ({ ...e, city: null })); }}
                      placeholder="Madrid"
                      placeholderTextColor={C.muted}
                      autoCapitalize="words"
                    />
                    {idErrors.city ? <Text style={s.fieldError}>{idErrors.city}</Text> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Código postal (opcional)</Text>
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
                </View>

                {/* Country */}
                <Text style={s.fieldLabel}>País</Text>
                <TextInput
                  style={[s.fieldInput, idErrors.country && s.fieldInputError]}
                  value={country}
                  onChangeText={(v) => { setCountry(v); setIdErrors((e) => ({ ...e, country: null })); }}
                  placeholder="España"
                  placeholderTextColor={C.muted}
                  autoCapitalize="words"
                />
                {idErrors.country ? <Text style={s.fieldError}>{idErrors.country}</Text> : null}

                {/* Tax ID */}
                <Text style={s.fieldLabel}>DNI / NIE / Pasaporte</Text>
                <TextInput
                  style={[s.fieldInput, idErrors.taxId && s.fieldInputError]}
                  value={taxId}
                  onChangeText={(v) => { setTaxId(v); setIdErrors((e) => ({ ...e, taxId: null })); }}
                  placeholder="12345678A"
                  placeholderTextColor={C.muted}
                  autoCapitalize="characters"
                />
                {idErrors.taxId ? <Text style={s.fieldError}>{idErrors.taxId}</Text> : null}

                <Text style={s.legalNote}>
                  Requerido para cumplir con la normativa financiera europea (MiFID II) y operar en mercados internacionales.
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

  // Age step
  ageWrapper: { alignItems: 'center', marginTop: 8 },
  ageInput: {
    fontSize: 72, fontFamily: F.xbold, color: C.text, letterSpacing: -3,
    borderBottomWidth: 3, borderBottomColor: C.orange,
    paddingVertical: 4, width: 200, textAlign: 'center',
  },
  ageInputError: { borderBottomColor: C.red },
  ageUnit:  { fontSize: 18, fontFamily: F.medium, color: C.muted, marginTop: 10 },
  errorTxt: { fontSize: 13, color: C.red, fontFamily: F.medium, marginTop: 12 },

  // Choice cards (income, experience, risk)
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

  // Identity step (step 5)
  idForm: { gap: 4 },
  nameRow: { flexDirection: 'row', gap: 12 },
  fieldLabel: {
    fontSize: 12, fontFamily: F.semibold, color: C.muted,
    letterSpacing: 0.3, marginTop: 14, marginBottom: 6,
  },
  fieldInput: {
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13,
    fontSize: 15, fontFamily: F.regular, color: C.text,
  },
  fieldInputError: { borderColor: C.red },
  fieldError: { fontSize: 12, color: C.red, fontFamily: F.medium, marginTop: 4 },
  legalNote: {
    fontSize: 12, fontFamily: F.regular, color: C.muted,
    lineHeight: 18, marginTop: 20, textAlign: 'center',
  },

  // Footer
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
