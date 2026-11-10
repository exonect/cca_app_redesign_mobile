/**
 * What the app shows for the session state, and the one navigator.
 *
 * - Opening (saved session being restored) shows "Signing you in", never the
 *   sign in screen, so a relaunch with a saved session goes straight in.
 * - Signed out: the navigator holds only the sign in screen. Signing out in
 *   any way (the More button, the server ending the session, signed out
 *   elsewhere) removes every signed in screen from the stack, so Back or a
 *   swipe cannot return to one, and the query cache is emptied.
 * - Signed in: the navigator starts at My work; a link that arrived while
 *   signed out (or on launch) then opens on top of it (src/auth/redirect.ts).
 */
import type { QueryClient } from '@tanstack/react-query'
import { router, Stack, usePathname, useRootNavigationState, type Href } from 'expo-router'
import { useEffect, useSyncExternalStore } from 'react'
import { View } from 'react-native'

import { useAuth } from '@/auth/AuthProvider'
import { useOfflineRuntime } from '@/offline/runtime'
import { OfflineBar } from '@/offline/ui'
import { Banner, Body, Button, H1, Loading } from '@/ui/kit'
import { color } from '@/ui/theme'

import { pendingTarget, setNavigable } from './redirect'

/** Every route under src/app except sign-in. Only reachable while signed in (a test checks the list is complete). */
export const SIGNED_IN_SCREENS = [
  '(tabs)', 'project/[id]', 'project/new', 'trial/index', 'trial/[id]', 'sieve-data/[id]',
  'recipes/index', 'recipes/[id]', 'admin/users', 'admin/master-data', 'sync', '+not-found',
] as const

/** Opens the link waiting for sign in, once the signed in navigator shows My work. */
function OpenPendingTarget({ signedIn }: { signedIn: boolean }) {
  const target = useSyncExternalStore(pendingTarget.subscribe, pendingTarget.get)
  const ready = Boolean(useRootNavigationState()?.key)
  const pathname = usePathname()
  const live = signedIn && ready && pathname !== '/sign-in'
  useEffect(() => {
    setNavigable(live)
    return () => setNavigable(false)
  }, [live])
  useEffect(() => {
    if (!live || !target) return
    const to = pendingTarget.take()
    if (to) router.push(to as Href)
  }, [live, target])
  return null
}

export function AppStack({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.concrete } }}>
        <Stack.Protected guard={signedIn}>
          {SIGNED_IN_SCREENS.map((name) => <Stack.Screen key={name} name={name} />)}
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" options={{ animation: 'none', gestureEnabled: false }} />
        </Stack.Protected>
      </Stack>
      <OpenPendingTarget signedIn={signedIn} />
    </>
  )
}

export function Gate({ queryClient }: { queryClient: QueryClient }) {
  const { status, error, resume, signOut, user } = useAuth()
  // A signed out device never shows the previous user's data.
  useEffect(() => { if (status === 'signed_out') queryClient.clear() }, [status, queryClient])
  const ready = useOfflineRuntime(queryClient, status === 'signed_in' ? user : null)
  if (status === 'loading' || (status === 'signed_in' && !ready)) return <Loading label="Signing you in" />
  if (status === 'unavailable') {
    return (
      <View style={{ flex: 1, backgroundColor: color.concrete, padding: 24, paddingTop: 72, gap: 12 }}>
        <H1>CCA could not be reached</H1>
        <View accessibilityLiveRegion="polite"><Banner tone="error">{error ?? 'Check your mobile data or Wi-Fi and try again.'}</Banner></View>
        <Body>You are still signed in. Your work is saved on the server.</Body>
        <Button title="Try again" variant="primary" onPress={() => { void resume() }} />
        <Button title="Sign out" variant="tertiary" onPress={() => { void signOut() }} />
      </View>
    )
  }
  const signedIn = status === 'signed_in'
  return (
    <View style={{ flex: 1, backgroundColor: color.concrete }}>
      {signedIn ? <OfflineBar /> : null}
      <AppStack signedIn={signedIn} />
    </View>
  )
}
