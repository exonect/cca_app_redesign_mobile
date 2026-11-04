/**
 * API client for the app: base URL from the build, bearer token, one silent
 * refresh on expiry, the backend error shape as ApiError. The refresh token
 * lives in the device's secure storage (Keychain / Keystore), never in plain
 * storage.
 */
import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'

const BASE: string = (Constants.expoConfig?.extra?.apiBase as string | undefined) ?? 'http://localhost:8000/api/v1'
const REFRESH_KEY = 'cca.refresh'

export class ApiError extends Error {
  status: number
  code: string
  fields: Record<string, string[]>
  constructor(status: number, code: string, message: string, fields: Record<string, string[]> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
  }
}

let access: string | null = null
let refreshing: Promise<boolean> | null = null
const expiredListeners = new Set<() => void>()

export const session = {
  async set(tokens: { access: string; refresh: string }) {
    access = tokens.access
    await SecureStore.setItemAsync(REFRESH_KEY, tokens.refresh)
  },
  async clear() {
    access = null
    await SecureStore.deleteItemAsync(REFRESH_KEY)
  },
  refreshToken: () => SecureStore.getItemAsync(REFRESH_KEY),
  onExpired(fn: () => void) {
    expiredListeners.add(fn)
    return () => { expiredListeners.delete(fn) }
  },
  baseUrl: BASE,
  accessToken: () => access,
}

async function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    const token = await session.refreshToken()
    if (!token) return false
    try {
      const r = await fetch(`${BASE}/auth/refresh/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh: token }),
      })
      if (!r.ok) return false
      await session.set(await r.json())
      return true
    } catch {
      return false
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

async function toError(r: Response): Promise<ApiError> {
  try {
    const e = (await r.json())?.error ?? {}
    return new ApiError(r.status, e.code ?? 'error', e.message ?? 'Request failed.', e.fields ?? {})
  } catch {
    return new ApiError(r.status, r.status >= 500 ? 'server_error' : 'error',
      r.status >= 500 ? 'Something went wrong on the server. Try again.' : 'Request failed.')
  }
}

type Options = { method?: string; body?: unknown; query?: Query; form?: FormData }

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
    r = await fetch(url(path, opts.query), { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body })
  } catch {
    throw new ApiError(0, 'offline', 'No connection. Check your mobile data or Wi-Fi and try again.')
  }
  if (r.status === 401 && !retried && !path.startsWith('/auth/')) {
    if (await refresh()) return api<T>(path, opts, true)
    await session.clear()
    expiredListeners.forEach((fn) => fn())
  }
  if (!r.ok) throw await toError(r)
  if (r.status === 204) return undefined as T
  return (await r.json()) as T
}

export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] }

export function fieldErrors(e: unknown): Record<string, string> {
  const fields = (e as { fields?: Record<string, string[]> })?.fields ?? {}
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, Array.isArray(v) ? String(v[0]) : String(v)]))
}
