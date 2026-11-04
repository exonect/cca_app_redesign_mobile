import { Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold, useFonts } from '@expo-google-fonts/barlow'
import { BarlowSemiCondensed_600SemiBold, BarlowSemiCondensed_700Bold } from '@expo-google-fonts/barlow-semi-condensed'
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { AppState, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { ApiError } from '@/api/client'
import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import { isOnline } from '@/offline/connectivity'
import { useOfflineRuntime } from '@/offline/runtime'
import { OfflineBar } from '@/offline/ui'
import { SignInScreen } from '@/features/auth/SignInScreen'
import { ScreenErrorBoundary } from '@/ui/ErrorFallback'
import { Banner, Body, Button, H1, Loading } from '@/ui/kit'
import { color } from '@/ui/theme'

SplashScreen.preventAutoHideAsync().catch(() => undefined)

/** A crash anywhere in the app shows a way back instead of a blank screen. */
export const ErrorBoundary = ScreenErrorBoundary

// Coming back to the app counts as focus: stale lists refetch, and the alert
// count stops polling while the app is in the background.
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener('change', (state) => handleFocus(state === 'active'))
  return () => sub.remove()
})

// Queries pause while offline (showing what is cached, which is kept for 3
// days so it can be saved for offline use); mutations always run, so an
// online only action fails at once with "No connection" instead of hanging.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 3 * 24 * 3_600_000,
      retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && !(e instanceof ApiError && e.status === 0 && !isOnline()) && n < 2,
    },
    mutations: { networkMode: 'always' },
  },
})

function Gate() {
  const { status, error, resume, signOut, user } = useAuth()
  // A signed out device never shows the previous user's data.
  useEffect(() => { if (status === 'signed_out') queryClient.clear() }, [status])
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
  if (status === 'signed_out') return <SignInScreen />
  return (
    <View style={{ flex: 1, backgroundColor: color.concrete }}>
      <OfflineBar />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.concrete } }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </View>
  )
}

export default function RootLayout() {
  const [loaded] = useFonts({ Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold, BarlowSemiCondensed_600SemiBold, BarlowSemiCondensed_700Bold })
  useEffect(() => { if (loaded) SplashScreen.hideAsync().catch(() => undefined) }, [loaded])
  if (!loaded) return null
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="dark" />
            <Gate />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
