/**
 * Temporary ID and password sign in (UAT). The server decides whether it is
 * on (GET /auth/options/); everything here mirrors the server rules and maps
 * its answers to plain sentences. Removing the feature is a server switch.
 */
import { errorMessage, fieldErrors, isApiError } from '@/api/errors'

export type AuthOptions = { microsoft: boolean; password: boolean }

/** The server's answer, or null when it is not the expected shape. */
export function parseAuthOptions(body: unknown): AuthOptions | null {
  if (!body || typeof body !== 'object') return null
  const { microsoft, password } = body as Record<string, unknown>
  if (typeof microsoft !== 'boolean' || typeof password !== 'boolean') return null
  return { microsoft, password }
}

/** Mirrors Django's minimum length validator; the server checks the rest (common, numeric, similar to the user). */
export const PASSWORD_MIN = 8
/** Server limit for a new password (set and change). */
export const PASSWORD_MAX = 128
export const PASSWORD_HINT = `At least ${PASSWORD_MIN} characters. Not only numbers, and not too close to the name or email.`

export const PASSWORD_MESSAGES = {
  signInOff: 'Sign in with ID and password is turned off. Use Microsoft sign in.',
  passwordsOff: 'Passwords are turned off on the server. Ask your CCA admin.',
  optionsFailed: 'Could not check how you can sign in. Check your connection and try again.',
  noOptions: 'Sign in is not set up on the server yet. Ask your CCA admin.',
} as const

export type SignInFields = { login?: string; password?: string }
export type SignInProblem = { message?: string; fields: SignInFields }

/** Client checks before sending: both inputs are needed (the server trims the login). */
export function checkSignIn(login: string, password: string): SignInFields {
  const f: SignInFields = {}
  if (!login.trim()) f.login = 'Enter your email or employee ID.'
  if (!password) f.password = 'Enter your password.'
  return f
}

/** What to show when password sign in fails. Invalid credentials, inactive,
 * locked and throttled come with the server's own sentence. */
export function signInProblem(e: unknown): SignInProblem {
  if (isApiError(e) && e.status === 404) return { message: PASSWORD_MESSAGES.signInOff, fields: {} }
  const all = fieldErrors(e)
  const fields: SignInFields = {}
  if (all.login) fields.login = all.login
  if (all.password) fields.password = all.password
  const other = Object.entries(all).filter(([k]) => k !== 'login' && k !== 'password').map(([, v]) => v)
  const shown = Object.keys(fields).length > 0
  // A 400 with field messages shows them by the inputs; anything else is one sentence under the form.
  const message = other[0] ?? (shown ? undefined : errorMessage(e, 'Sign in failed. Try again.'))
  return { message, fields }
}

export type NewPasswordFields = { current_password?: string; password?: string; confirm?: string }

/** Set password (Admin) and change password: new password filled, 8 to 128 characters, and typed twice the same. */
export function checkNewPassword(password: string, confirm: string, blank = 'Enter a password.'): NewPasswordFields {
  const f: NewPasswordFields = {}
  if (!password) f.password = blank
  else if (password.length < PASSWORD_MIN) f.password = `Use at least ${PASSWORD_MIN} characters.`
  else if (password.length > PASSWORD_MAX) f.password = `Use at most ${PASSWORD_MAX} characters.`
  if (password && confirm !== password) f.confirm = 'The two passwords do not match.'
  return f
}
