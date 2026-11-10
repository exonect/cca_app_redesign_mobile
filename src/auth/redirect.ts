/**
 * Where the app may be sent from outside: com.thermex.app:// links, the web
 * paths in alerts and emails, and the Microsoft sign in callback.
 *
 * - Only this app's scheme or an internal path ("/...", never "//") is read;
 *   anything else is dropped.
 * - Only screens the app has are targets (the web's paths are mapped to the
 *   app's), with their own query parameters only. Anything else is not a
 *   target: signed in it shows the not found screen, after signing in it is
 *   My work.
 * - A link that arrives while nobody is signed in (or while the app is still
 *   opening) is remembered and opened right after sign in, on top of My work.
 * - The Microsoft callback (com.thermex.app://auth?code=...) is never a screen.
 */
import Constants from 'expo-constants'

const ID = '[A-Za-z0-9_-]{1,64}'

/** App routes and the query parameters each one reads. */
const ROUTES: { re: RegExp; query?: string[] }[] = [
  { re: /^\/$/ },
  { re: /^\/(projects|search|alerts|more|trial|recipes|sync)$/ },
  { re: /^\/admin\/(users|master-data)$/ },
  { re: /^\/project\/new$/, query: ['id'] },
  { re: new RegExp(`^/project/${ID}$`) },
  { re: new RegExp(`^/trial/${ID}$`), query: ['step'] },
  { re: new RegExp(`^/sieve-data/${ID}$`) },
  { re: new RegExp(`^/recipes/${ID}$`), query: ['for_trial', 'sfdc_no', 'customer_name', 'project_name'] },
]

/** The web app's paths (alerts, emails, old bookmarks) and their screen here. */
const WEB: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^\/projects\/new$/, () => '/project/new'],
  [new RegExp(`^/projects/(${ID})/edit$`), (m) => `/project/new?id=${m[1]}`],
  [new RegExp(`^/projects/(${ID})/sieve-data$`), (m) => `/sieve-data/${m[1]}`],
  [new RegExp(`^/projects/${ID}/trials/(${ID})$`), (m) => `/trial/${m[1]}`],
  [new RegExp(`^/projects/(${ID})$`), (m) => `/project/${m[1]}`],
  [/^\/trials$/, () => '/trial'],
  [new RegExp(`^/trials/(${ID})$`), (m) => `/trial/${m[1]}`],
  [/^\/dashboard$/, () => '/'],
]

/** Sign in and sign out addresses (and the Microsoft callback): never a place to land. */
const NOT_A_TARGET = /^\/(auth|sign-in|signin|login|logout|sign-out|register|forgot-password)(\/|$)/i

const SCHEMES = new Set(['com.thermex.app', String(Constants.expoConfig?.scheme ?? 'com.thermex.app')].map((s) => s.toLowerCase()))

/** An incoming URL or path as an internal path with its query, or null when it is not this app's. */
export function parseIncoming(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  // Control characters and backslashes never belong in a link to a screen.
  if (!text || text.length > 2048 || /[\u0000-\u001f\u007f\\]/.test(text)) return null
  let rest: string
  const scheme = text.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):(.*)$/)
  if (scheme) {
    if (!SCHEMES.has(scheme[1].toLowerCase())) return null
    // com.thermex.app://project/5 and com.thermex.app:///project/5 both mean /project/5.
    rest = '/' + scheme[2].replace(/^\/+/, '')
  } else {
    if (!text.startsWith('/') || text.startsWith('//')) return null
    rest = text
  }
  const hash = rest.indexOf('#')
  if (hash >= 0) rest = rest.slice(0, hash)
  const q = rest.indexOf('?')
  let path = q >= 0 ? rest.slice(0, q) : rest
  const query = q >= 0 ? rest.slice(q + 1) : ''
  path = path.replace(/\/+$/, '') || '/'
  if (path.includes('//') || /(^|\/)\.\.?(\/|$)/.test(path)) return null
  return query ? `${path}?${query}` : path
}

/** The app screen for an internal path (web paths mapped), keeping only that screen's own query parameters; null if the app has no such screen. */
export function knownRoute(internal: string | null | undefined): string | null {
  if (!internal) return null
  const q = internal.indexOf('?')
  let path = q >= 0 ? internal.slice(0, q) : internal
  let params = new URLSearchParamsLite(q >= 0 ? internal.slice(q + 1) : '')
  if (NOT_A_TARGET.test(path)) return null
  for (const [re, to] of WEB) {
    const m = path.match(re)
    if (m) {
      const mapped = to(m)
      const mq = mapped.indexOf('?')
      path = mq >= 0 ? mapped.slice(0, mq) : mapped
      if (mq >= 0) params = new URLSearchParamsLite(mapped.slice(mq + 1))
      break
    }
  }
  const route = ROUTES.find((r) => r.re.test(path))
  if (!route) return null
  const kept = (route.query ?? []).flatMap((k) => {
    const v = params.get(k)
    return v === null || v === '' ? [] : [`${k}=${encodeURIComponent(v)}`]
  })
  return kept.length ? `${path}?${kept.join('&')}` : path
}

/** A link to a screen of this app, or null. */
export function safeTarget(raw: string | null | undefined): string | null {
  return knownRoute(parseIncoming(raw))
}

/** Minimal query parsing (URLSearchParams is not complete in every React Native runtime). */
class URLSearchParamsLite {
  private map = new Map<string, string>()
  constructor(query: string) {
    for (const part of query.split('&')) {
      if (!part) continue
      const eq = part.indexOf('=')
      const k = safeDecode(eq >= 0 ? part.slice(0, eq) : part)
      const v = safeDecode(eq >= 0 ? part.slice(eq + 1) : '')
      if (k !== null && v !== null && !this.map.has(k)) this.map.set(k, v)
    }
  }
  get(k: string) { return this.map.has(k) ? this.map.get(k)! : null }
}

function safeDecode(s: string): string | null {
  try {
    const v = decodeURIComponent(s.replace(/\+/g, ' '))
    return /[\u0000-\u001f\u007f]/.test(v) ? null : v
  } catch {
    return null
  }
}

// --- The link waiting for sign in ------------------------------------------------

let pending: string | null = null
let navigable = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export const pendingTarget = {
  get: () => pending,
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  },
  /** Remember a link to open after sign in. Not a screen: nothing is remembered. */
  remember(raw: string | null | undefined) {
    const t = safeTarget(raw)
    pending = t && t !== '/' ? t : null
    emit()
  },
  /** The remembered link, once. */
  take() {
    const t = pending
    pending = null
    if (t) emit()
    return t
  },
  clear() {
    if (pending === null) return
    pending = null
    emit()
  },
}

/** Set by the signed in navigator while it is on screen: links then open at once. */
export function setNavigable(on: boolean) {
  navigable = on
}

/**
 * Expo Router's redirectSystemPath (src/app/+native-intent.ts): what the app
 * opens for an incoming URL. Null drops it.
 * - On launch the app always opens at My work; a link to a screen is opened on
 *   top of it once the session is restored or the person signs in.
 * - Signed in, a link opens now (a path the app does not have shows not found).
 * - Signed out (or still opening), a link to a screen waits for sign in.
 */
export function routeIncoming({ path, initial }: { path: string; initial: boolean }): string | null {
  const internal = parseIncoming(path)
  if (initial) {
    pendingTarget.remember(internal)
    return '/'
  }
  if (!internal || NOT_A_TARGET.test(internal.split('?')[0])) return null
  if (navigable) return knownRoute(internal) ?? internal
  pendingTarget.remember(internal)
  return null
}
