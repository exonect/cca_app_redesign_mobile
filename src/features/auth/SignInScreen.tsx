import { useRef, useState } from 'react'
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, View, type TextInputInstance } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Circle, Path } from 'react-native-svg'

import { DEV_LOGIN, useAuth } from '@/auth/AuthProvider'
import { Banner, Body, Button, Field, H1, Small, Strong, TextField } from '@/ui/kit'
import { color, font } from '@/ui/theme'

import { PASSWORD_MESSAGES, type SignInProblem } from './password'
import { PasswordField } from './PasswordField'

/** Mobile sign in, as on the approved board: ink top with the grading curve
 * motif, white sheet with the Microsoft button. While the server allows it
 * (UAT), a temporary ID and password form shows below it. */
export function SignInScreen() {
  const { signInWithMicrosoft, devSignIn, error, busy, microsoftConfigured, options, optionsState, reloadOptions } = useAuth()
  const [email, setEmail] = useState('')
  // If the server cannot say which options are on, offer what this build can do; the server still decides.
  const showMicrosoft = optionsState === 'ready' ? options?.microsoft === true : optionsState === 'error' && microsoftConfigured
  const showPassword = optionsState === 'ready' ? options?.password === true : optionsState === 'error'
  return (
    <View style={{ flex: 1, backgroundColor: color.ink }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView edges={['top']} style={{ paddingHorizontal: 24, paddingTop: 16, gap: 24, flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Image source={require('../../../assets/thermax-logo.jpg')} accessibilityLabel="Thermax" style={{ width: 30, height: 38, borderRadius: 5, backgroundColor: '#fff' }} resizeMode="contain" />
            <Strong style={{ color: '#fff', fontFamily: font.cond, fontSize: 19 }}>Chemical Construction App</Strong>
          </View>
          <Svg viewBox="0 0 340 180" width="100%" height={170} accessibilityLabel="An aggregate grading curve rising within its limit band">
            <Path d="M10 170 C 70 164, 100 146, 135 122 S 200 66, 245 42 S 305 14, 330 12 L 330 28 C 300 32, 262 56, 230 72 S 170 118, 135 140 S 60 172, 10 174 Z" fill={color.ink2} />
            <Path d="M10 172 C 70 167, 100 152, 135 130 S 200 78, 245 56 S 305 21, 330 18" fill="none" stroke={color.logo} strokeWidth={3.5} strokeLinecap="round" />
            {[[66, 165], [121, 137], [176, 101], [231, 62], [286, 31]].map(([x, y]) => <Circle key={x} cx={x} cy={y} r={4} fill={color.logo} />)}
          </Svg>
        </SafeAreaView>
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: color.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '88%' }}>
          <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
            <H1 style={{ fontSize: 30 }}>Sign in</H1>
            <Body style={{ color: color.muted }}>
              {showPassword && !showMicrosoft
                ? 'Use the ID and password your CCA admin gave you. Your role and projects load automatically.'
                : 'Use your Thermax Microsoft account. Your role and projects load automatically.'}
            </Body>
            {error ? <Banner tone="error">{error}</Banner> : null}
            {optionsState === 'loading' ? (
              <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 }}>
                <ActivityIndicator color={color.ink} />
                <Small>Checking how you can sign in…</Small>
              </View>
            ) : null}
            {optionsState === 'error' ? (
              <View style={{ gap: 8 }}>
                <Banner tone="error">{PASSWORD_MESSAGES.optionsFailed}</Banner>
                <Button title="Try again" variant="tertiary" onPress={() => { void reloadOptions() }} accessibilityLabel="Check sign in options again" />
              </View>
            ) : null}
            {optionsState === 'ready' && !showMicrosoft && !showPassword ? <Banner tone="warn">{PASSWORD_MESSAGES.noOptions}</Banner> : null}
            {showMicrosoft ? (
              <>
                <Button variant="primary" title="Sign in with Microsoft" busy={busy} onPress={signInWithMicrosoft} />
                <Small>{"Can't get in? Your account may not be set up in CCA yet. Ask your CCA admin to add you, then sign in again."}</Small>
              </>
            ) : null}
            {showPassword ? <PasswordSignIn primary={!showMicrosoft} divided={showMicrosoft} /> : null}
            {DEV_LOGIN ? (
              <View style={{ gap: 10, borderTopWidth: 1, borderColor: color.line, paddingTop: 14 }}>
                <Field label="Sign in for testing" hint="Test builds only. Enter the email of a CCA user.">
                  <TextField value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="name@thermaxglobal.com" />
                </Field>
                <Button title="Sign in as this user" disabled={!email} busy={busy} onPress={() => devSignIn(email)} />
              </View>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  )
}

/** Temporary ID and password sign in (UAT). Same session as Microsoft sign in once it succeeds. */
function PasswordSignIn({ primary, divided }: { primary: boolean; divided: boolean }) {
  const { signInWithPassword, busy } = useAuth()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState<SignInProblem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const inFlight = useRef(false)
  const passwordRef = useRef<TextInputInstance>(null)

  const submit = async () => {
    if (inFlight.current || busy) return
    inFlight.current = true
    setSubmitting(true)
    setProblem(null)
    try {
      setProblem(await signInWithPassword(login, password))
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }
  return (
    <View style={[{ gap: 12 }, divided && { borderTopWidth: 1, borderColor: color.line, paddingTop: 14 }]}>
      <Strong style={{ fontSize: 16 }}>Sign in with ID and password</Strong>
      <Field label="Email or employee ID" error={problem?.fields.login}>
        <TextField accessibilityLabel="Email or employee ID" value={login} invalid={Boolean(problem?.fields.login)} maxLength={254}
          onChangeText={(t) => { setLogin(t); setProblem((p) => (p ? { ...p, fields: { ...p.fields, login: undefined } } : p)) }}
          autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" keyboardType="email-address"
          returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordRef.current?.focus()} />
      </Field>
      <Field label="Password" error={problem?.fields.password}>
        <PasswordField ref={passwordRef} label="Password" value={password} invalid={Boolean(problem?.fields.password)}
          onChangeText={(t) => { setPassword(t); setProblem((p) => (p ? { ...p, fields: { ...p.fields, password: undefined } } : p)) }}
          autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={() => { void submit() }} />
      </Field>
      <Button title="Sign in" variant={primary ? 'primary' : 'secondary'} busy={submitting} disabled={busy && !submitting}
        onPress={() => { void submit() }} />
      {problem?.message ? <Banner tone="error">{problem.message}</Banner> : null}
    </View>
  )
}
