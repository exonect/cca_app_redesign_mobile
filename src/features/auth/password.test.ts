// Temporary ID and password sign in: server answers mapped to plain sentences, and the client checks.
import { checkNewPassword, checkSignIn, parseAuthOptions, PASSWORD_MESSAGES, signInProblem } from './password'

const apiError = (status: number, code: string, message: string, fields: Record<string, unknown> = {}) => ({ status, code, message, fields })

describe('sign in options', () => {
  it('reads the server answer and refuses anything else', () => {
    expect(parseAuthOptions({ microsoft: true, password: false })).toEqual({ microsoft: true, password: false })
    expect(parseAuthOptions({ microsoft: true })).toBeNull()
    expect(parseAuthOptions({ microsoft: 'yes', password: true })).toBeNull()
    expect(parseAuthOptions(null)).toBeNull()
    expect(parseAuthOptions('<html>')).toBeNull()
  })
})

describe('password sign in checks', () => {
  it('needs both inputs; a login of only spaces counts as empty', () => {
    expect(checkSignIn('', '')).toEqual({ login: 'Enter your email or employee ID.', password: 'Enter your password.' })
    expect(checkSignIn('   ', 'secret123')).toEqual({ login: 'Enter your email or employee ID.' })
    expect(checkSignIn(' E1001 ', 'x')).toEqual({})
  })

  it('shows the server sentence for wrong credentials, inactive, locked and throttled', () => {
    expect(signInProblem(apiError(400, 'invalid_credentials', 'The ID or password is not correct.'))).toEqual({ message: 'The ID or password is not correct.', fields: {} })
    expect(signInProblem(apiError(403, 'inactive', 'Your account is not active. Ask an Admin.')).message).toBe('Your account is not active. Ask an Admin.')
    // The fifth wrong attempt itself answers locked, also for a login that matches no account.
    expect(signInProblem(apiError(429, 'locked', 'Too many wrong attempts. Try again in 15 minutes.')).message).toBe('Too many wrong attempts. Try again in 15 minutes.')
    expect(signInProblem(apiError(429, 'throttled', 'Too many attempts. Wait a minute and try again.')).message).toBe('Too many attempts. Wait a minute and try again.')
  })

  it('explains offline, server errors and a switched off feature plainly', () => {
    expect(signInProblem(apiError(0, 'offline', 'No connection. Check your mobile data or Wi-Fi and try again.')).message).toMatch(/^No connection/)
    expect(signInProblem(apiError(500, 'server_error', 'Traceback...')).message).toBe('Something went wrong on the server. Try again.')
    expect(signInProblem(apiError(404, 'not_found', 'Not found.')).message).toBe(PASSWORD_MESSAGES.signInOff)
    expect(signInProblem(new Error('boom')).message).toBe('Sign in failed. Try again.')
  })

  it('puts field errors by their inputs', () => {
    expect(signInProblem(apiError(400, 'validation_error', 'Some fields need attention.', { login: ['This field may not be blank.'] })))
      .toEqual({ message: undefined, fields: { login: 'This field may not be blank.' } })
    expect(signInProblem(apiError(400, 'validation_error', 'Some fields need attention.', { non_field_errors: ['Something else.'] })))
      .toEqual({ message: 'Something else.', fields: {} })
  })
})

describe('new password checks', () => {
  it('needs 8 to 128 characters typed the same twice', () => {
    expect(checkNewPassword('', '')).toEqual({ password: 'Enter a password.' })
    expect(checkNewPassword('short', 'short')).toEqual({ password: 'Use at least 8 characters.' })
    expect(checkNewPassword('x'.repeat(129), 'x'.repeat(129))).toEqual({ password: 'Use at most 128 characters.' })
    expect(checkNewPassword('x'.repeat(128), 'x'.repeat(128))).toEqual({})
    expect(checkNewPassword('longenough1', 'longenough2')).toEqual({ confirm: 'The two passwords do not match.' })
    expect(checkNewPassword('longenough1', 'longenough1')).toEqual({})
  })
})
