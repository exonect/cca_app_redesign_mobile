/** Dark tab header from the approved boards: logo, title, avatar, optional controls below. */
import { router } from 'expo-router'
import type { ReactNode } from 'react'
import { Image, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useAuth } from '@/auth/AuthProvider'
import { H1 } from '@/ui/kit'
import { color, font } from '@/ui/theme'

import { initials } from './format'

export function TabHeader({ title, right, children, avatar = true }: { title: string; right?: ReactNode; children?: ReactNode; avatar?: boolean }) {
  const { user } = useAuth()
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: color.ink, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Image source={require('../../../assets/thermax-logo.jpg')} accessibilityIgnoresInvertColors accessible={false}
          style={{ width: 24, height: 31, borderRadius: 4, backgroundColor: '#fff' }} resizeMode="contain" />
        <H1 style={{ color: '#fff', flex: 1 }} numberOfLines={1}>{title}</H1>
        {right}
        {avatar ? <Avatar name={user?.full_name} onPress={() => router.navigate('/more')} /> : null}
      </View>
      {children}
    </SafeAreaView>
  )
}

export function Avatar({ name, onPress, size = 36, dark }: { name?: string | null; onPress?: () => void; size?: number; dark?: boolean }) {
  const circle = (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: dark ? color.ink : '#DCE7F2', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: font.bold, fontSize: size > 40 ? 18 : 14, color: dark ? '#fff' : '#1F4568' }}>{initials(name)}</Text>
    </View>
  )
  if (!onPress) return <View accessible={false}>{circle}</View>
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Profile and settings" onPress={onPress} hitSlop={6}
      style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
      {circle}
    </Pressable>
  )
}

/** Two or three tabs on the dark header (My work, Alerts). */
export function DarkSegmented<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void
}) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={{ flexDirection: 'row', gap: 6, backgroundColor: color.ink2, padding: 4, borderRadius: 10 }}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, minHeight: 44, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? '#fff' : 'transparent' }}>
            <Text numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: 15, color: on ? color.ink : color.line }}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** Go back, or to a sensible screen when opened from a link with no history. */
export function goBack(fallback: '/' | '/projects' | '/more' | '/recipes' = '/') {
  if (router.canGoBack()) router.back()
  else router.replace(fallback)
}
