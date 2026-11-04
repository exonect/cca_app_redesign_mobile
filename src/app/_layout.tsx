import { Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold, useFonts } from '@expo-google-fonts/barlow'
import { BarlowSemiCondensed_600SemiBold, BarlowSemiCondensed_700Bold } from '@expo-google-fonts/barlow-semi-condensed'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { ApiError } from '@/api/client'
import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import { SignInScreen } from '@/features/auth/SignInScreen'
import { Loading } from '@/ui/kit'
import { color } from '@/ui/theme'

SplashScreen.preventAutoHideAsync().catch(() => undefined)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2 },
  },
})

function Gate() {
  const { status } = useAuth()
  // A signed out device never shows the previous user's data.
  useEffect(() => { if (status === 'signed_out') queryClient.clear() }, [status])
  if (status === 'loading') return <Loading label="Signing you in" />
  if (status === 'signed_out') return <SignInScreen />
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.concrete } }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
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
