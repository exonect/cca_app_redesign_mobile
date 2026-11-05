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
import { cachedUser, clearCache } from '@/offline/cache'
import { isOnline, subscribe as onConnectivity } from '@/offline/connectivity'
import { offlineStorage } from '@/offline/storage'
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
  /** Signed in from the data saved on this phone because the server could not be reached; checked again once online. */
  offline: boolean
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
  const [offline, setOffline] = useState(false)

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
  // person out. No connection opens the app with the data saved on this
  // phone (to work offline on site) or, with nothing saved, offers Retry.
  // `restore` is the work; on launch the state already says loading, and Retry
  // (resume) shows loading first.
  const restore = useCallback(async (refreshToken: string | null) => {
    if (refreshToken) {
      try {
        setUser(await api<User>('/auth/me/'))
        setOffline(false)
        setStatus('signed_in')
        return
      } catch (e) {
        if (!isApiError(e) || e.status === 0 || e.status >= 500) {
          const saved = await cachedUser(offlineStorage()).catch(() => null)
          if (saved) {
            setUser(saved)
            setOffline(true)
            setStatus('signed_in')
            return
          }
          setError(errorMessage(e, 'CCA could not be reached. Try again.'))
          setStatus('unavailable')
          return
        }
        await session.clear()
      }
    }
    setStatus('signed_out')
  }, [])
  const resume = useCallback(async () => {
    setStatus('loading')
    setError(null)
    await restore(await session.refreshToken())
  }, [restore])
  // The saved token is read first; everything after it happens once that answer is in.
  useEffect(() => { void session.refreshToken().then(restore) }, [restore])

  // Opened offline: once the server can be reached, confirm the session and
  // refresh the user (an ended session signs out through onExpired).
  useEffect(() => {
    if (!offline) return
    let checking = false
    const check = async () => {
      if (checking || !isOnline()) return
      checking = true
      try {
        setUser(await api<User>('/auth/me/'))
        setOffline(false)
      } catch { /* still unreachable, or signed out by onExpired */ } finally { checking = false }
    }
    void check()
    return onConnectivity(() => { void check() })
  }, [offline])

  const signOut = useCallback(async () => {
    try {
      const refresh = await session.refreshToken()
      if (refresh) await api('/auth/sign-out/', { body: { refresh } }).catch(() => undefined)
    } finally {
      await session.clear()
      await clearCache(offlineStorage()).catch(() => undefined)
    }
    setOffline(false)
    setUser(null)
    setStatus('signed_out')
  }, [])

  useEffect(() => session.onExpired(() => {
    setOffline(false)
    setUser(null)
    setStatus('signed_out')
    setError('Your session ended. Sign in again to continue.')
  }), [])

  const value = useMemo<Ctx>(() => ({
    status, user, error, busy, offline,
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
  }), [status, user, error, busy, offline, request, discovery, promptAsync, redirectUri, start, signOut, resume])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
