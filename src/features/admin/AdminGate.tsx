import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useAuth } from '@/auth/AuthProvider'
import { Body, H1, Small } from '@/ui/kit'
import { color, font, TOUCH } from '@/ui/theme'

import { goBack } from '@/features/projects/TabHeader'

export function AdminHeader({ title, sub, right, children }: { title: string; sub?: string; right?: ReactNode; children?: ReactNode }) {
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: color.surface, borderBottomWidth: 1, borderColor: color.line, paddingHorizontal: 16, paddingBottom: 14, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to More" onPress={() => goBack('/more')} hitSlop={8} style={{ minHeight: TOUCH, justifyContent: 'center' }}>
          <Text style={{ fontFamily: font.semibold, fontSize: 15, color: color.link }}>‹ More</Text>
        </Pressable>
        {right}
      </View>
      <H1>{title}</H1>
      {sub ? <Small>{sub}</Small> : null}
      {children}
    </SafeAreaView>
  )
}

/** Users and Master data are Admin only; the server refuses others too. */
export function AdminOnly({ title, children }: { title: string; children: ReactNode }) {
  const { hasRole } = useAuth()
  if (hasRole('AD')) return <>{children}</>
  return (
    <View style={{ flex: 1, backgroundColor: color.concrete }}>
      <AdminHeader title={title} />
      <View style={{ padding: 16 }}><Body style={{ color: color.muted }}>Only an Admin can manage {title.toLowerCase()}. Ask your CCA Admin for changes.</Body></View>
    </View>
  )
}

export function Switch({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: on, disabled }} disabled={disabled} onPress={onChange}
      hitSlop={6} style={{ minWidth: TOUCH, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
      <View style={{ width: 44, height: 26, borderRadius: 13, padding: 3, backgroundColor: on ? color.met.solid : color.field, alignItems: on ? 'flex-end' : 'flex-start' }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' }} />
      </View>
    </Pressable>
  )
}
