// The API client: resume through refresh, offline vs rejected refresh,
// timeouts, plain messages for 5xx and unreadable answers, and secure
// storage failures that must not break signing in or out.
import * as SecureStore from 'expo-secure-store'

import { api, ApiError, fieldErrors, MESSAGES, session } from './client'
import { SERVER } from './errors'

jest.mock('expo-constants', () => ({ expoConfig: { extra: { apiBase: 'http://api' } } }))
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>()
  return {
    __store: store,
    setItemAsync: jest.fn(async (k: string, v: string) => { store.set(k, v) }),
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    deleteItemAsync: jest.fn(async (k: string) => { store.delete(k) }),
  }
})
const secure = SecureStore as unknown as { __store: Map<string, string> } & Record<'setItemAsync' | 'getItemAsync' | 'deleteItemAsync', jest.Mock>

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response
const text = (status: number) => ({ ok: status >= 200 && status < 300, status, json: async () => { throw new SyntaxError('Unexpected token <') } }) as unknown as Response

const fetchMock = jest.fn()
beforeEach(async () => {
  fetchMock.mockReset()
  globalThis.fetch = fetchMock as unknown as typeof fetch
  await session.clear()
  secure.__store.clear()
  secure.setItemAsync.mockClear(); secure.getItemAsync.mockClear(); secure.deleteItemAsync.mockClear()
})

describe('session refresh', () => {
  it('refreshes for /auth/me/ so a saved session resumes after a restart', async () => {
    secure.__store.set('cca.refresh', 'r1')
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: 'not_authenticated', message: 'Sign in.', fields: {} } }))
      .mockResolvedValueOnce(json(200, { access: 'a2', refresh: 'r2' }))
      .mockResolvedValueOnce(json(200, { id: 1 }))
    await expect(api('/auth/me/')).resolves.toEqual({ id: 1 })
    expect(String(fetchMock.mock.calls[1][0])).toBe('http://api/auth/refresh/')
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer a2')
    expect(secure.__store.get('cca.refresh')).toBe('r2')
  })

  it('keeps the session when the refresh cannot reach the server', async () => {
    secure.__store.set('cca.refresh', 'r1')
    const expired = jest.fn()
    const off = session.onExpired(expired)
    fetchMock.mockResolvedValueOnce(json(401, {})).mockRejectedValueOnce(new TypeError('Network request failed'))
    await expect(api('/projects/')).rejects.toMatchObject({ status: 0, code: 'offline', message: MESSAGES.offline })
    expect(expired).not.toHaveBeenCalled()
    expect(secure.__store.get('cca.refresh')).toBe('r1')
    off()
  })

  it('signs out with a plain message when the server refuses the refresh', async () => {
    secure.__store.set('cca.refresh', 'r1')
    const expired = jest.fn()
    const off = session.onExpired(expired)
    fetchMock.mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(401, { detail: 'Token is blacklisted' }))
    await expect(api('/projects/')).rejects.toMatchObject({ status: 401, code: 'session_expired', message: MESSAGES.expired })
    expect(expired).toHaveBeenCalledTimes(1)
    expect(secure.__store.has('cca.refresh')).toBe(false)
    off()
  })

  it('never refreshes for sign in itself', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { error: { code: 'authentication_failed', message: 'No active user with that email.', fields: {} } }))
    await expect(api('/auth/dev/', { body: { email: 'x@y.z' } })).rejects.toMatchObject({ status: 401, message: 'No active user with that email.' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('errors', () => {
  it('never shows server text for a 5xx, JSON or not', async () => {
    fetchMock.mockResolvedValueOnce(json(500, { error: { code: 'server_error', message: 'Traceback (most recent call last)', fields: {} } }))
    await expect(api('/x/')).rejects.toMatchObject({ status: 500, message: SERVER })
    fetchMock.mockResolvedValueOnce(text(502))
    await expect(api('/x/')).rejects.toMatchObject({ status: 502, message: SERVER })
  })

  it('names a proxy 413 and 429 plainly', async () => {
    fetchMock.mockResolvedValueOnce(text(413))
    await expect(api('/x/')).rejects.toMatchObject({ status: 413, message: MESSAGES.tooLarge })
    fetchMock.mockResolvedValueOnce(text(429))
    await expect(api('/x/')).rejects.toMatchObject({ status: 429, message: MESSAGES.throttled })
  })

  it('marks an answer without the API error shape (a Wi-Fi sign in page, a proxy) so it is not taken as a refusal', async () => {
    fetchMock.mockResolvedValueOnce(text(403))
    await expect(api('/x/')).rejects.toMatchObject({ status: 403, code: 'unexpected_response', message: MESSAGES.failed })
    fetchMock.mockResolvedValueOnce(text(200))
    await expect(api('/x/')).rejects.toMatchObject({ status: 200, code: 'bad_response' })
  })

  it('treats an unreadable success body as a server problem, not a crash', async () => {
    fetchMock.mockResolvedValueOnce(text(200))
    await expect(api('/x/')).rejects.toBeInstanceOf(ApiError)
  })

  it('gives up after the time limit with a timeout message', async () => {
    jest.useFakeTimers()
    fetchMock.mockImplementationOnce(() => new Promise(() => undefined))
    const p = api('/slow/', { timeoutMs: 1000 })
    jest.advanceTimersByTime(1001)
    await expect(p).rejects.toMatchObject({ status: 0, code: 'timeout', message: MESSAGES.timeout })
    jest.useRealTimers()
  })

  it('flattens nested field errors to one message per field', () => {
    const e = new ApiError(400, 'invalid', 'Some fields need attention.', {
      cementitious_contents: { 0: ['Ensure this value is greater than or equal to 100.'] } as unknown as string[],
      sieves: [{ retained: ['A valid number is required.'] }] as unknown as string[],
      email: ['A user with this email already exists.'],
    })
    expect(fieldErrors(e)).toEqual({
      cementitious_contents: 'Ensure this value is greater than or equal to 100.',
      sieves: 'A valid number is required.',
      email: 'A user with this email already exists.',
    })
  })
})

describe('secure storage failures', () => {
  it('signs in and out even when the keychain refuses', async () => {
    secure.setItemAsync.mockRejectedValueOnce(new Error('User interaction is not allowed.'))
    await expect(session.set({ access: 'a', refresh: 'r' })).resolves.toBeUndefined()
    secure.getItemAsync.mockRejectedValueOnce(new Error('keystore'))
    await expect(session.refreshToken()).resolves.toBe('r')
    secure.deleteItemAsync.mockRejectedValueOnce(new Error('keystore'))
    await expect(session.clear()).resolves.toBeUndefined()
    expect(session.accessToken()).toBeNull()
  })
})
