import Constants from 'expo-constants'
import { router, type Href } from 'expo-router'
import { useState } from 'react'
import { Platform, Pressable, ScrollView, Text, View } from 'react-native'

import { useAuth } from '@/auth/AuthProvider'
import { Body, Button, H2, Small, Strong } from '@/ui/kit'
import { color, font, radius } from '@/ui/theme'

import { ConfirmSheet } from '@/features/projects/Sheet'
import { Avatar, TabHeader } from '@/features/projects/TabHeader'

const ROLE_NAME = { AD: 'Admin', SAD: 'Sales Admin', SP: 'Sales Person', CT: 'CT (Technical)' } as const

export function appVersion() {
  const cfg = Constants.expoConfig
  const id = Platform.OS === 'ios' ? cfg?.ios?.bundleIdentifier : cfg?.android?.package
  return `CCA ${cfg?.version ?? ''}${id ? ` (${id})` : ''}`.trim()
}

export function MoreScreen() {
  const { user, hasRole, signOut } = useAuth()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const admin = hasRole('AD')

  const work: { title: string; meta?: string; href: Href }[] = [
    { title: 'Projects', meta: hasRole('CT') ? 'Assigned to you' : undefined, href: '/projects' },
    { title: 'Trials', meta: 'All trials you can see', href: '/trial' },
    { title: 'Product search', meta: 'Past trials by product', href: '/search' },
  ]
  if (hasRole('AD', 'SAD', 'CT')) work.push({ title: 'Recipe master', meta: hasRole('CT') ? 'Your recipes' : 'All locations', href: '/recipes' })

  return (
    <View style={{ flex: 1, backgroundColor: color.concrete }}>
      <TabHeader title="More" avatar={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }} accessible
          accessibilityLabel={`${user?.full_name ?? ''}, ${user ? ROLE_NAME[user.role] : ''}${user?.region_name ? `, ${user.region_name}` : ''}, ${user?.email ?? ''}`}>
          <Avatar name={user?.full_name} size={52} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: font.bold, fontSize: 18, color: '#fff' }}>{user?.full_name}</Text>
            <Text style={{ fontFamily: font.regular, fontSize: 14, color: color.line }}>
              {[user ? ROLE_NAME[user.role] : null, user?.region_name].filter(Boolean).join(', ')}
            </Text>
            <Text style={{ fontFamily: font.regular, fontSize: 14, color: color.line }} numberOfLines={1}>{user?.email}</Text>
          </View>
        </View>
      </TabHeader>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 32 }}>
        <List label="Work" rows={work.map((w) => ({ ...w, onPress: () => router.push(w.href) }))} />

        <View style={{ gap: 8 }}>
          <H2>Admin</H2>
          {admin ? (
            <List label="Admin" rows={[
              { title: 'Users', meta: 'Add, edit, deactivate', onPress: () => router.push('/admin/users') },
              { title: 'Master data', meta: 'Dropdown values', onPress: () => router.push('/admin/master-data') },
            ]} />
          ) : (
            <View style={{ backgroundColor: color.head, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, padding: 14 }}>
              <Body style={{ color: color.subtle }}>Users and Master data show here only for Admin. Ask your CCA Admin if a dropdown value is missing.</Body>
            </View>
          )}
        </View>

        <View style={{ gap: 10, alignItems: 'center', paddingTop: 4 }}>
          <Button title="Sign out" onPress={() => setConfirm(true)} style={{ alignSelf: 'stretch' }} />
          <Small>{appVersion()}</Small>
        </View>
      </ScrollView>

      <ConfirmSheet open={confirm} onClose={() => setConfirm(false)} title="Sign out of CCA?"
        body="You will need your Thermax Microsoft account to sign in again. Nothing you saved is lost."
        confirmLabel="Sign out" busy={busy}
        onConfirm={async () => { setBusy(true); try { await signOut() } finally { setBusy(false) } }} />
    </View>
  )
}

function List({ label, rows }: { label: string; rows: { title: string; meta?: string; onPress: () => void }[] }) {
  return (
    <View accessibilityLabel={label} style={{ backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, overflow: 'hidden' }}>
      {rows.map((r, i) => (
        <Pressable key={r.title} accessibilityRole="link" accessibilityLabel={[r.title, r.meta].filter(Boolean).join(', ')} onPress={r.onPress}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 16, borderTopWidth: i ? 1 : 0, borderColor: color.divider, backgroundColor: pressed ? color.head : undefined })}>
          <Strong style={{ flex: 1, fontSize: 16 }}>{r.title}</Strong>
          {r.meta ? <Small style={{ fontSize: 14 }}>{r.meta}</Small> : null}
          <Text style={{ color: color.muted, fontSize: 20 }}>›</Text>
        </Pressable>
      ))}
    </View>
  )
}
