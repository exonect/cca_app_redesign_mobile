import { useState } from 'react'
import { Image, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Circle, Path } from 'react-native-svg'

import { DEV_LOGIN, useAuth } from '@/auth/AuthProvider'
import { Banner, Body, Button, Field, H1, Small, Strong, TextField } from '@/ui/kit'
import { color, font } from '@/ui/theme'

/** Mobile sign in, as on the approved board: ink top with the grading curve
 * motif, white sheet with one Microsoft button. */
export function SignInScreen() {
  const { signInWithMicrosoft, devSignIn, error, busy } = useAuth()
  const [email, setEmail] = useState('')
  return (
    <View style={{ flex: 1, backgroundColor: color.ink }}>
      <SafeAreaView edges={['top']} style={{ paddingHorizontal: 24, paddingTop: 16, gap: 24, flex: 1 }}>
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
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: color.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 24, gap: 16 }}>
        <H1 style={{ fontSize: 30 }}>Sign in</H1>
        <Body style={{ color: color.muted }}>Use your Thermax Microsoft account. Your role and projects load automatically.</Body>
        {error ? <Banner tone="error">{error}</Banner> : null}
        <Button variant="primary" title="Sign in with Microsoft" busy={busy} onPress={signInWithMicrosoft} />
        <Small>Can't get in? Your account may not be set up in CCA yet. Ask your CCA admin to add you, then sign in again.</Small>
        {DEV_LOGIN ? (
          <View style={{ gap: 10, borderTopWidth: 1, borderColor: color.line, paddingTop: 14 }}>
            <Field label="Sign in for testing" hint="Test builds only. Enter the email of a CCA user.">
              <TextField value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="name@thermaxglobal.com" />
            </Field>
            <Button title="Sign in as this user" disabled={!email} busy={busy} onPress={() => devSignIn(email)} />
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  )
}
