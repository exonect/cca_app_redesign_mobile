/**
 * Plain language for errors shown to people. The API client turns every
 * failed request into an ApiError carrying the backend's
 * {"error": {code, message, fields}}; anything else that reaches the screen
 * (a bug, a native module failure) gets a generic sentence, never raw text.
 * Duck typed on purpose so screens and tests need no runtime import of the
 * client.
 */

export const GENERIC = 'Something went wrong. Try again.'
export const SERVER = 'Something went wrong on the server. Try again.'
export const NOT_FOUND = 'This was not found. It may have been deleted, or you may not have access to it.'
export const NO_ACCESS = 'You do not have access to this.'

/** An error whose message was written for people (download and share failures, for example). */
export class UserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserError'
  }
}

type Shaped = { status: number; code: string; message: string; fields?: Record<string, unknown> }

export function isApiError(e: unknown): e is Shaped {
  return typeof e === 'object' && e !== null && typeof (e as Shaped).status === 'number' && typeof (e as Shaped).code === 'string'
}

export const statusOf = (e: unknown) => (isApiError(e) ? e.status : null)

/** The sentence to show for a failed request or action. */
export function errorMessage(e: unknown, fallback = GENERIC): string {
  if (isApiError(e)) {
    if (e.status >= 500) return SERVER
    if (e.status === 404) return NOT_FOUND
    if (e.status === 403) return e.message || NO_ACCESS
    // A 400 says "Some fields need attention." with the detail per field; where
    // no input shows those fields, the first field message is the useful part.
    const first = Object.values(fieldErrors(e))[0]
    if (e.status === 400 && first) return first
    return e.message || fallback
  }
  if (e instanceof UserError) return e.message
  return fallback
}

/** First message of every field in a 400 response, flattening nested shapes
 * such as {"cementitious_contents": {"0": ["..."]}} or {"sieves": [{...}]}. */
export function fieldErrors(e: unknown): Record<string, string> {
  const fields = (isApiError(e) || (typeof e === 'object' && e !== null) ? (e as { fields?: unknown }).fields : undefined)
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
    const msg = firstMessage(v)
    if (msg) out[k] = msg
  }
  return out
}

function firstMessage(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v
  if (Array.isArray(v)) {
    for (const x of v) { const m = firstMessage(x); if (m) return m }
    return null
  }
  if (typeof v === 'object') {
    for (const x of Object.values(v as Record<string, unknown>)) { const m = firstMessage(x); if (m) return m }
    return null
  }
  return String(v)
}

/**
 * Every message of a 400 response by its dotted path, for inputs inside JSON
 * fields: {"materials": {"cement": {"ssd": ["..."]}}} gives
 * "materials.cement.ssd", a list of rows is indexed ("sieves.20mm.2.retained").
 * Keys the server already sends dotted (a refused Start) stay as they are.
 */
export function fieldErrorsByPath(e: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (v: unknown, path: string) => {
    if (v === null || v === undefined) return
    if (typeof v === 'string') { if (path) out[path] ??= v; return }
    if (Array.isArray(v)) {
      if (v.every((x) => typeof x === 'string')) { if (v.length && path) out[path] ??= v[0] as string; return }
      v.forEach((x, i) => walk(x, path ? `${path}.${i}` : String(i)))
      return
    }
    if (typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, path ? `${path}.${k}` : k)
  }
  const fields = typeof e === 'object' && e !== null ? (e as { fields?: unknown }).fields : undefined
  if (fields && typeof fields === 'object' && !Array.isArray(fields)) walk(fields, '')
  return out
}

/** Errors on fields this form does not show, joined for a summary line. */
export function otherErrors(fields: Record<string, string>, shown: readonly string[]): string[] {
  return Object.entries(fields).filter(([k]) => !shown.includes(k)).map(([, v]) => v)
}
