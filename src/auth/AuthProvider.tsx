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

import { api, session } from '@/api/client'
import { errorMessage, isApiError, UserError } from '@/api/errors'
import type { Role, User } from '@/shared/types'

WebBrowser.maybeCompleteAuthSession()

const extra = Constants.expoConfig?.extra ?? {}
const CLIENT_ID = extra.entraClientId as string | undefined
const TENANT_ID = extra.entraTenantId as string | undefined
export const DEV_LOGIN = extra.devLogin === true
const SCHEME = (Constants.expoConfig?.scheme as string | undefined) ?? 'com.thermex.app'

/** unavailable: a saved session exists but the server could not be reached
 * to resume it (offline, timeout, 5xx). The session is kept; Retry tries again. */
type Status = 'loading' | 'unavailable' | 'signed_out' | 'signed_in'
type Ctx = {
  status: Status; user: User | null; error: string | null; busy: boolean; microsoftConfigured: boolean
  signInWithMicrosoft: () => Promise<void>; devSignIn: (email: string) => Promise<void>; signOut: () => Promise<void>
  hasRole: (...roles: Role[]) => boolean
  /** Try resuming the saved session again (from the unavailable state). */
  resume: () => Promise<void>
}

/** What to tell the person when Microsoft sign in did not finish. Cancel and dismiss say nothing. */
export function microsoftResultMessage(result: { type: string; params?: Record<string, string> }): string | null {
  if (result.type === 'success' || result.type === 'cancel' || result.type === 'dismiss' || result.type === 'opened') return null
  if (result.type === 'locked') return 'A Microsoft sign in is already open. Finish or close it, then try again.'
  if (result.params?.error === 'access_denied') return 'Microsoft sign in was cancelled or not allowed. Try again, or ask your CCA admin for access.'
  return 'Microsoft sign in did not finish. Try again.'
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

  // Resume a saved session on launch. Only the server refusing it signs the
  // person out; no connection keeps the session and offers Retry.
  const resume = useCallback(async () => {
    setStatus('loading')
    setError(null)
    if (await session.refreshToken()) {
      try {
        setUser(await api<User>('/auth/me/'))
        setStatus('signed_in')
        return
      } catch (e) {
        if (!isApiError(e) || e.status === 0 || e.status >= 500) {
          setError(errorMessage(e, 'CCA could not be reached. Try again.'))
          setStatus('unavailable')
          return
        }
        await session.clear()
      }
    }
    setStatus('signed_out')
  }, [])
  useEffect(() => { void resume() }, [resume])

  const signOut = useCallback(async () => {
    try {
      const refresh = await session.refreshToken()
      if (refresh) await api('/auth/sign-out/', { body: { refresh } }).catch(() => undefined)
    } finally {
      await session.clear()
    }
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
        if (result.type !== 'success') {
          setError(microsoftResultMessage(result))
          return
        }
        const tokens = await exchangeCodeAsync(
          { clientId: CLIENT_ID, code: result.params.code, redirectUri, extraParams: { code_verifier: request.codeVerifier ?? '' } },
          discovery,
        )
        if (!tokens.idToken) throw new UserError('Microsoft did not return an ID token. Try again.')
        await start(await api<SessionResponse>('/auth/microsoft/', { body: { id_token: tokens.idToken } }))
      } catch (e) {
        setError(errorMessage(e, 'Sign in failed. Try again.'))
      } finally {
        setBusy(false)
      }
    },
    async devSignIn(email: string) {
      setError(null)
      setBusy(true)
      try { await start(await api<SessionResponse>('/auth/dev/', { body: { email: email.trim() } })) }
      catch (e) { setError(errorMessage(e, 'Sign in failed. Try again.')) }
      finally { setBusy(false) }
    },
    signOut,
    resume,
    hasRole: (...roles: Role[]) => Boolean(user && roles.includes(user.role)),
  }), [status, user, error, busy, request, discovery, promptAsync, redirectUri, start, signOut, resume])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
