/**
 * API client for the app: base URL from the build, bearer token, one silent
 * refresh on expiry, the backend error shape as ApiError. The refresh token
 * lives in the device's secure storage (Keychain / Keystore), never in plain
 * storage.
 *
 * Every failure leaves here as an ApiError with a plain message: no
 * connection, a timeout, an expired session, the server's own error, or a
 * generic sentence for 5xx and unreadable answers (never raw server text).
 */
import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'

import { reportRequest } from '@/offline/connectivity'

import { fieldErrors as flattenFieldErrors, SERVER } from './errors'

const BASE: string = (Constants.expoConfig?.extra?.apiBase as string | undefined) ?? 'http://localhost:8000/api/v1'
const REFRESH_KEY = 'cca.refresh'
/** Ordinary requests give up after this long; uploads pass their own, longer limit. */
export const TIMEOUT_MS = 30_000
export const UPLOAD_TIMEOUT_MS = 5 * 60_000

export const MESSAGES = {
  offline: 'No connection. Check your mobile data or Wi-Fi and try again.',
  timeout: 'The server took too long to answer. Check your connection and try again.',
  expired: 'Your session ended. Sign in again to continue.',
  tooLarge: 'This file is too large to upload.',
  throttled: 'Too many attempts. Wait a minute and try again.',
  failed: 'Request failed. Try again.',
} as const

export class ApiError extends Error {
  status: number
  code: string
  fields: Record<string, string[]>
  constructor(status: number, code: string, message: string, fields: Record<string, string[]> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }
}

let access: string | null = null
/** The refresh token, also kept in memory in case secure storage is unavailable. */
let memoryRefresh: string | null = null
let refreshing: Promise<RefreshResult> | null = null
const expiredListeners = new Set<() => void>()

/** Secure storage can fail (locked keychain, a wiped keystore after an OS
 * restore). The session then lives in memory only until the app closes. */
async function secure<T>(op: () => Promise<T>, fallback: T): Promise<T> {
  try { return await op() } catch { return fallback }
}

export const session = {
  async set(tokens: { access: string; refresh: string }) {
    access = tokens.access
    memoryRefresh = tokens.refresh
    await secure(() => SecureStore.setItemAsync(REFRESH_KEY, tokens.refresh), undefined)
  },
  async clear() {
    access = null
    memoryRefresh = null
    await secure(() => SecureStore.deleteItemAsync(REFRESH_KEY), undefined)
  },
  async refreshToken(): Promise<string | null> {
    return (await secure(() => SecureStore.getItemAsync(REFRESH_KEY), null)) ?? memoryRefresh
  },
  onExpired(fn: () => void) {
    expiredListeners.add(fn)
    return () => { expiredListeners.delete(fn) }
  },
  baseUrl: BASE,
  accessToken: () => access,
}
type RefreshResult = 'ok' | 'rejected' | 'offline'

async function refresh(): Promise<RefreshResult> {
  refreshing ??= (async (): Promise<RefreshResult> => {
    const token = await session.refreshToken()
    if (!token) return 'rejected'
    try {
      const r = await timedFetch(`${BASE}/auth/refresh/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ refresh: token }),
      }, TIMEOUT_MS)
      // Only the server saying no ends the session; a gateway hiccup does not.
      if (r.status === 400 || r.status === 401 || r.status === 403) return 'rejected'
      if (!r.ok) return 'offline'
      const body = await r.json() as { access?: string; refresh?: string }
      if (!body.access) return 'rejected'
      await session.set({ access: body.access, refresh: body.refresh ?? token })
      return 'ok'
    } catch {
      return 'offline'
    }
  })().finally(() => { refreshing = null })
  return refreshing
}

export type Query = Record<string, string | number | boolean | null | undefined | (string | number)[]>

export function url(path: string, query?: Query) {
  const parts: string[] = []
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === '') continue
    const values = Array.isArray(v) ? v : [v]
    values.forEach((x) => parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(x))}`))
  }
  return `${BASE}${path}${parts.length ? `?${parts.join('&')}` : ''}`
}

class Timeout extends Error {}

/** fetch with a time limit. Rejects with Timeout when the limit passes. */
async function timedFetch(input: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller?.abort(); reject(new Timeout()) }, ms)
  })
  try {
    return await Promise.race([fetch(input, { ...init, signal: controller?.signal }), limit])
  } finally {
    clearTimeout(timer)
  }
}

/** Turn a failed response into an ApiError. 5xx and unreadable bodies get a generic sentence. */
export async function toError(r: Response): Promise<ApiError> {
  type Body = { code?: unknown; message?: unknown; fields?: unknown }
  const e = await r.json().then((b: { error?: Body } | null) => b?.error ?? null, () => null) as Body | null
  if (r.status >= 500) return new ApiError(r.status, 'server_error', SERVER)
  if (!e || typeof e !== 'object') {
    if (r.status === 413) return new ApiError(413, 'too_large', MESSAGES.tooLarge)
    if (r.status === 429) return new ApiError(429, 'throttled', MESSAGES.throttled)
    return new ApiError(r.status, 'error', MESSAGES.failed)
  }
  const fields = e.fields && typeof e.fields === 'object' && !Array.isArray(e.fields) ? e.fields as Record<string, string[]> : {}
  return new ApiError(r.status, typeof e.code === 'string' ? e.code : 'error',
    typeof e.message === 'string' && e.message ? e.message : MESSAGES.failed, fields)
}

/** Sign in, refresh and sign out never retry; /auth/me/ must, or resuming a saved session would always fail. */
const NO_REFRESH = ['/auth/microsoft/', '/auth/dev/', '/auth/refresh/', '/auth/sign-out/']

type Options = { method?: string; body?: unknown; query?: Query; form?: FormData; timeoutMs?: number }

export async function api<T = unknown>(path: string, opts: Options = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (access) headers.Authorization = `Bearer ${access}`
  let body: BodyInit | undefined
  if (opts.form) body = opts.form as unknown as BodyInit
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  let r: Response
  try {
    r = await timedFetch(url(path, opts.query), { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body }, opts.timeoutMs ?? TIMEOUT_MS)
  } catch (e) {
    if (e instanceof Timeout) throw new ApiError(0, 'timeout', MESSAGES.timeout)
    reportRequest(false)
    throw new ApiError(0, 'offline', MESSAGES.offline)
  }
  reportRequest(true)
  if (r.status === 401 && !retried && !NO_REFRESH.includes(path)) {
    const result = await refresh()
    if (result === 'ok') return api<T>(path, opts, true)
    if (result === 'offline') throw new ApiError(0, 'offline', MESSAGES.offline)
    await session.clear()
    expiredListeners.forEach((fn) => fn())
    throw new ApiError(401, 'session_expired', MESSAGES.expired)
  }
  if (!r.ok) throw await toError(r)
  if (r.status === 204) return undefined as T
  try {
    return (await r.json()) as T
  } catch {
    throw new ApiError(r.status, 'bad_response', SERVER)
  }
}

/** Can the server be reached at all? Any HTTP answer counts (no sign in needed). */
export async function ping(): Promise<boolean> {
  try {
    await timedFetch(`${BASE}/auth/me/`, { method: 'GET', headers: { Accept: 'application/json' } }, 10_000)
    reportRequest(true)
    return true
  } catch {
    return false
  }
}

export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] }

/** First message per field of a 400 response (nested list and object errors flattened). */
export const fieldErrors = flattenFieldErrors
