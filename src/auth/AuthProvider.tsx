/**
 * Sign in exactly as the web does: Microsoft Entra ID (PKCE code flow in the
 * system browser) -> ID token -> POST /auth/microsoft/ -> CCA session. The
 * server verifies the token against the mobile app registration. Role and
 * permissions come from the CCA user, never from Microsoft.
 */
import { exchangeCodeAsync, makeRedirectUri, Prompt, useAuthRequest, useAutoDiscovery } from 'expo-auth-session'
import Constants from 'expo-constants'
import * as WebBrowser from 'expo-web-browser'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { api, ApiError, session } from '@/api/client'
import type { Role, User } from '@/shared/types'

WebBrowser.maybeCompleteAuthSession()

const extra = Constants.expoConfig?.extra ?? {}
const CLIENT_ID = extra.entraClientId as string | undefined
const TENANT_ID = extra.entraTenantId as string | undefined
export const DEV_LOGIN = extra.devLogin === true
const SCHEME = (Constants.expoConfig?.scheme as string | undefined) ?? 'com.thermex.app'

type Status = 'loading' | 'signed_out' | 'signed_in'
type Ctx = {
  status: Status; user: User | null; error: string | null; busy: boolean; microsoftConfigured: boolean
  signInWithMicrosoft: () => Promise<void>; devSignIn: (email: string) => Promise<void>; signOut: () => Promise<void>
  hasRole: (...roles: Role[]) => boolean
}
const AuthContext = createContext<Ctx | null>(null)
type SessionResponse = { access: string; refresh: string; user: User }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const discovery = useAutoDiscovery(TENANT_ID ? `https://login.microsoftonline.com/${TENANT_ID}/v2.0` : 'https://invalid.local')
  const redirectUri = makeRedirectUri({ native: `${SCHEME}://auth` })
  const [request, , promptAsync] = useAuthRequest(
    { clientId: CLIENT_ID ?? 'not-configured', scopes: ['openid', 'profile', 'email', 'offline_access'], redirectUri, prompt: Prompt.SelectAccount },
    TENANT_ID ? discovery : null,
  )

  const start = useCallback(async (s: SessionResponse) => {
    await session.set(s)
    setUser(s.user)
    setError(null)
    setStatus('signed_in')
  }, [])

  // Resume a saved session on launch.
  useEffect(() => {
    (async () => {
      if (await session.refreshToken()) {
        try {
          setUser(await api<User>('/auth/me/'))
          setStatus('signed_in')
          return
        } catch { await session.clear() }
      }
      setStatus('signed_out')
    })()
  }, [])

  const signOut = useCallback(async () => {
    const refresh = await session.refreshToken()
    if (refresh) await api('/auth/sign-out/', { body: { refresh } }).catch(() => undefined)
    await session.clear()
    setUser(null)
    setStatus('signed_out')
  }, [])

  useEffect(() => session.onExpired(() => {
    setUser(null)
    setStatus('signed_out')
    setError('Your session ended. Sign in again to continue.')
  }), [])

  const value = useMemo<Ctx>(() => ({
    status, user, error, busy,
    microsoftConfigured: Boolean(CLIENT_ID && TENANT_ID),
    async signInWithMicrosoft() {
      setError(null)
      if (!CLIENT_ID || !TENANT_ID || !request || !discovery) {
        setError('Microsoft sign in is not set up in this build yet.')
        return
      }
      setBusy(true)
      try {
        const result = await promptAsync()
        if (result.type !== 'success') return
        const tokens = await exchangeCodeAsync(
          { clientId: CLIENT_ID, code: result.params.code, redirectUri, extraParams: { code_verifier: request.codeVerifier ?? '' } },
          discovery,
        )
        if (!tokens.idToken) throw new Error('Microsoft did not return an ID token.')
        await start(await api<SessionResponse>('/auth/microsoft/', { body: { id_token: tokens.idToken } }))
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Sign in failed. Try again.')
      } finally {
        setBusy(false)
      }
    },
    async devSignIn(email: string) {
      setError(null)
      setBusy(true)
      try { await start(await api<SessionResponse>('/auth/dev/', { body: { email: email.trim() } })) }
      catch (e) { setError(e instanceof ApiError ? e.message : 'Sign in failed.') }
      finally { setBusy(false) }
    },
    signOut,
    hasRole: (...roles: Role[]) => Boolean(user && roles.includes(user.role)),
  }), [status, user, error, busy, request, discovery, promptAsync, redirectUri, start, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
