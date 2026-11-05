// Resuming a saved session: only the server refusing it signs the person
// out; no connection keeps it and offers Retry. Microsoft sign in that ends
// in an error says so.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'

import { api, session } from '@/api/client'

import { AuthProvider, microsoftResultMessage, useAuth } from './AuthProvider'

jest.mock('expo-auth-session', () => ({
  exchangeCodeAsync: jest.fn(), makeRedirectUri: () => 'com.thermex.app://auth', Prompt: { SelectAccount: 'select_account' },
  useAuthRequest: () => [null, null, jest.fn()], useAutoDiscovery: () => null,
}))
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }))
jest.mock('expo-constants', () => ({ expoConfig: { extra: {} } }))
jest.mock('@/api/client', () => {
  class ApiError extends Error {
    status: number; code: string; fields: Record<string, string[]>
    constructor(status: number, code: string, message: string, fields: Record<string, string[]> = {}) {
      super(message); this.status = status; this.code = code; this.fields = fields
    }
  }
  return {
    ApiError,
    api: jest.fn(),
    session: { refreshToken: jest.fn(async () => 'r1'), clear: jest.fn(async () => undefined), set: jest.fn(), onExpired: () => () => undefined },
  }
})
jest.mock('@/offline/storage', () => {
  const { memoryStorage } = jest.requireActual('@/offline/storage')
  const store = memoryStorage()
  return { memoryStorage, offlineStorage: () => store }
})
const mockApi = api as jest.MockedFunction<typeof api>
const { ApiError } = jest.requireMock('@/api/client')

function Probe() {
  const { status, error } = useAuth()
  return <Text>{`${status}|${error ?? ''}`}</Text>
}

beforeEach(() => { mockApi.mockReset(); (session.clear as jest.Mock).mockClear() })

describe('resuming a saved session', () => {
  it('keeps the session and offers retry when the server cannot be reached', async () => {
    mockApi.mockRejectedValueOnce(new ApiError(0, 'offline', 'No connection. Check your mobile data or Wi-Fi and try again.'))
    await render(<AuthProvider><Probe /></AuthProvider>)
    expect(await screen.findByText('unavailable|No connection. Check your mobile data or Wi-Fi and try again.')).toBeTruthy()
    expect(session.clear).not.toHaveBeenCalled()
  })

  it('signs out when the server refuses the session', async () => {
    mockApi.mockRejectedValueOnce(new ApiError(401, 'session_expired', 'Your session ended. Sign in again to continue.'))
    await render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(session.clear).toHaveBeenCalled())
    expect(await screen.findByText(/^signed_out\|/)).toBeTruthy()
  })

  it('signs in from a saved session', async () => {
    mockApi.mockResolvedValueOnce({ id: 1, role: 'SP' } as never)
    await render(<AuthProvider><Probe /></AuthProvider>)
    expect(await screen.findByText('signed_in|')).toBeTruthy()
  })
})

describe('Microsoft sign in result', () => {
  it('stays quiet when the person cancels and explains errors', () => {
    expect(microsoftResultMessage({ type: 'cancel' })).toBeNull()
    expect(microsoftResultMessage({ type: 'dismiss' })).toBeNull()
    expect(microsoftResultMessage({ type: 'error', params: { error: 'access_denied' } })).toMatch('cancelled or not allowed')
    expect(microsoftResultMessage({ type: 'error', params: { error: 'server_error' } })).toBe('Microsoft sign in did not finish. Try again.')
    expect(microsoftResultMessage({ type: 'locked' })).toMatch('already open')
  })
})

describe('working offline', () => {
  it('opens with the user saved on this phone when the server cannot be reached', async () => {
    const { offlineStorage } = jest.requireMock('@/offline/storage')
    await offlineStorage().write('cache.json', JSON.stringify({ v: 1, userId: 7, savedAt: Date.now(), user: { id: 7, role: 'CT', full_name: 'Sneha Rao' }, state: { queries: [], mutations: [] } }))
    mockApi.mockRejectedValue(new ApiError(0, 'offline', 'No connection.'))
    function Who() {
      const { status, user, offline } = useAuth()
      return <Text>{`${status}|${user?.full_name ?? ''}|${offline}`}</Text>
    }
    await render(<AuthProvider><Who /></AuthProvider>)
    expect(await screen.findByText('signed_in|Sneha Rao|true')).toBeTruthy()
    expect(session.clear).not.toHaveBeenCalled()
    await offlineStorage().remove('cache.json')
    mockApi.mockReset()
  })
})

describe('ID and password sign in (temporary, UAT)', () => {
  const tokens = { access: 'a1', refresh: 'r9', user: { id: 7, role: 'CT', full_name: 'Sneha Rao' } }
  function Panel() {
    const auth = useAuth()
    return (
      <>
        <Text>{`${auth.status}|${auth.user?.full_name ?? ''}|${auth.optionsState}|${auth.passwordLogin}`}</Text>
        <Text onPress={() => { void auth.signInWithPassword(' E1007 ', 'Secret#123').then((p) => { (globalThis as { lastProblem?: unknown }).lastProblem = p }) }}>sign in</Text>
        <Text onPress={() => { void auth.signOut() }}>sign out</Text>
      </>
    )
  }
  const route = (onPassword: () => Promise<unknown>) => async (path: string) => {
    if (path === '/auth/options/') return { microsoft: true, password: true }
    if (path === '/auth/password/') return onPassword()
    if (path === '/auth/sign-out/') return undefined
    throw new Error(`unexpected ${path}`)
  }

  beforeEach(() => {
    (session.refreshToken as jest.Mock).mockResolvedValue(null);
    (session.set as jest.Mock).mockClear()
  })
  afterAll(() => { (session.refreshToken as jest.Mock).mockResolvedValue('r1') })

  it('reads the options, signs in with the trimmed login and keeps the session like Microsoft sign in', async () => {
    mockApi.mockImplementation(route(async () => tokens) as never)
    await render(<AuthProvider><Panel /></AuthProvider>)
    expect(await screen.findByText('signed_out||ready|true')).toBeTruthy()
    await fireEvent.press(screen.getByText('sign in'))
    expect(await screen.findByText('signed_in|Sneha Rao|ready|true')).toBeTruthy()
    expect(mockApi).toHaveBeenCalledWith('/auth/password/', { body: { login: 'E1007', password: 'Secret#123' } })
    expect(session.set).toHaveBeenCalledWith(tokens)
    expect((globalThis as { lastProblem?: unknown }).lastProblem).toBeNull()

    // Sign out ends the session and deletes this person's saved data, as for Microsoft sign in.
    const { offlineStorage } = jest.requireMock('@/offline/storage')
    await offlineStorage().write('cache.json', JSON.stringify({ v: 1, userId: 7, savedAt: Date.now(), user: tokens.user, state: { queries: [], mutations: [] } }))
    await fireEvent.press(screen.getByText('sign out'))
    expect(await screen.findByText(/^signed_out\|\|/)).toBeTruthy()
    expect(session.clear).toHaveBeenCalled()
    expect(await offlineStorage().read('cache.json')).toBeNull()
  })

  it('stays signed out and returns the server sentence when the ID or password is wrong', async () => {
    mockApi.mockImplementation(route(async () => { throw new ApiError(400, 'invalid_credentials', 'The ID or password is not correct.') }) as never)
    await render(<AuthProvider><Panel /></AuthProvider>)
    await screen.findByText('signed_out||ready|true')
    await fireEvent.press(screen.getByText('sign in'))
    await waitFor(() => expect((globalThis as { lastProblem?: unknown }).lastProblem).toEqual({ message: 'The ID or password is not correct.', fields: {} }))
    expect(screen.getByText('signed_out||ready|true')).toBeTruthy()
    expect(session.set).not.toHaveBeenCalled()
  })

  it('marks the options as failed when the server cannot be reached', async () => {
    mockApi.mockRejectedValue(new ApiError(0, 'offline', 'No connection.'))
    await render(<AuthProvider><Panel /></AuthProvider>)
    expect(await screen.findByText('signed_out||error|false')).toBeTruthy()
  })
})
