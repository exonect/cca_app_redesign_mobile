// An Admin cannot change their own role or deactivate themselves (server rule),
// so those controls are not offered on their own user.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import type { User } from '@/shared/types'

import { UsersScreen } from './UsersScreen'

const mockApi = jest.fn()
jest.mock('@/api/client', () => ({
  api: (...a: unknown[]) => mockApi(...a),
  ApiError: class extends Error {},
  fieldErrors: () => ({}),
  session: {},
}))
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true, navigate: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
let mockPasswordLogin = false
jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 1, full_name: 'Neha Admin' }, hasRole: (...r: string[]) => r.includes('AD'), passwordLogin: mockPasswordLogin, reloadOptions: jest.fn() }),
}))

const user = (over: Partial<User>): User => ({
  id: 1, email: 'neha@thermaxglobal.com', emp_id: 'E1001', first_name: 'Neha', last_name: 'Admin', full_name: 'Neha Admin', role: 'AD',
  role_label: 'Admin', region: null, region_name: null, manager: null, manager_name: null, is_active: true, last_login: null,
  manager_source: 'none', entra_manager_email: null, ...over,
})
const me = user({})
const other = user({ id: 2, email: 'ravi@thermaxglobal.com', emp_id: 'E1002', first_name: 'Ravi', last_name: 'Kumar', full_name: 'Ravi Kumar', role: 'CT', role_label: 'CT' })

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } })

beforeEach(() => {
  mockApi.mockReset()
  mockApi.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (path === '/users/' && !opts?.method) return { count: 2, next: null, previous: null, results: [me, other] }
    if (path === '/lookups/') return []
    if (path === '/users/1/' && opts?.method === 'PATCH') return me
    throw new Error(`unexpected ${path}`)
  })
})

it('locks the role and hides Deactivate on the signed in Admin, and does not send a role for them', async () => {
  const qc = newClient()
  await render(<QueryClientProvider client={qc}><UsersScreen /></QueryClientProvider>)
  expect(await screen.findByRole('button', { name: 'Deactivate Ravi Kumar' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Deactivate Neha Admin' })).toBeNull()

  await fireEvent.press(screen.getByRole('button', { name: 'Edit Neha Admin' }))
  expect(await screen.findByText('You cannot change your own role. Ask another Admin.')).toBeTruthy()
  expect(screen.queryByRole('radio', { name: /^Sales Person\./ })).toBeNull()
  await fireEvent.press(screen.getByRole('button', { name: 'Save user' }))
  await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/users/1/', expect.objectContaining({ method: 'PATCH' })))
  const body = mockApi.mock.calls.find(([p, o]) => p === '/users/1/' && o?.method === 'PATCH')![1].body
  expect(body).not.toHaveProperty('role')
  qc.clear()
})

it('still offers the role choice on other users', async () => {
  const qc = newClient()
  await render(<QueryClientProvider client={qc}><UsersScreen /></QueryClientProvider>)
  await fireEvent.press(await screen.findByRole('button', { name: 'Edit Ravi Kumar' }))
  expect(await screen.findByRole('radio', { name: /^Sales Person\./ })).toBeTruthy()
  expect(screen.queryByText('You cannot change your own role. Ask another Admin.')).toBeNull()
  qc.clear()
})

describe('manager source (set in CCA or from Entra ID)', () => {
  const fromEntra = { ...other, manager: 1, manager_name: 'Neha Admin', manager_source: 'entra', entra_manager_email: null } as User

  it('shows where the manager comes from, read only, and keeps an Entra manager when saving other fields', async () => {
    mockApi.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === '/users/' && !opts?.method) return { count: 2, next: null, previous: null, results: [me, fromEntra] }
      if (path === '/lookups/') return []
      if (path === '/users/2/' && opts?.method === 'PATCH') return fromEntra
      throw new Error(`unexpected ${path}`)
    })
    const qc = newClient()
    await render(<QueryClientProvider client={qc}><UsersScreen /></QueryClientProvider>)
    await fireEvent.press(await screen.findByRole('button', { name: 'Edit Ravi Kumar' }))
    expect(await screen.findByText(/^Manager source: From Entra ID/)).toBeTruthy()
    await fireEvent.changeText(screen.getByLabelText('Last name'), 'Kumar')
    await fireEvent.press(screen.getByRole('button', { name: 'Save user' }))
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/users/2/', expect.objectContaining({ method: 'PATCH' })))
    const body = mockApi.mock.calls.find(([p, o]) => p === '/users/2/' && o?.method === 'PATCH')![1].body
    // Sending manager would turn it into an app setting that overrides Entra ID.
    expect(body).not.toHaveProperty('manager')
    expect(body).toMatchObject({ last_name: 'Kumar' })
    qc.clear()
  })

  it('words each source', () => {
    const { managerSourceNote } = jest.requireActual('./UsersScreen')
    expect(managerSourceNote({ manager_source: 'app' })).toBe('Set in CCA by an Admin. Entra ID does not change it.')
    expect(managerSourceNote({ manager_source: 'none', entra_manager_email: 'boss@thermaxglobal.com' }))
      .toBe('No manager in CCA or Entra ID. Entra ID lists boss@thermaxglobal.com, who is not a CCA user.')
    expect(managerSourceNote({})).toBeNull()
  })
})

describe('Set password (temporary ID and password sign in)', () => {
  afterEach(() => { mockPasswordLogin = false })

  it('is not offered while ID and password sign in is off', async () => {
    const qc = newClient()
    await render(<QueryClientProvider client={qc}><UsersScreen /></QueryClientProvider>)
    await screen.findByRole('button', { name: 'Edit Ravi Kumar' })
    expect(screen.queryByRole('button', { name: 'Set password for Ravi Kumar' })).toBeNull()
    qc.clear()
  })

  it('sets a password for a user and confirms it by name', async () => {
    mockPasswordLogin = true
    const base = mockApi.getMockImplementation()!
    mockApi.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) =>
      path === '/users/2/set-password/' ? undefined : base(path, opts))
    const qc = newClient()
    await render(<QueryClientProvider client={qc}><UsersScreen /></QueryClientProvider>)
    await fireEvent.press(await screen.findByRole('button', { name: 'Set password for Ravi Kumar' }))
    await fireEvent.changeText(screen.getByLabelText('New password'), 'Kiln#Batch42')
    await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'Kiln#Batch42')
    await fireEvent.press(screen.getByRole('button', { name: 'Set password' }))
    expect(await screen.findByText('Password set for Ravi Kumar')).toBeTruthy()
    expect(mockApi).toHaveBeenCalledWith('/users/2/set-password/', { body: { password: 'Kiln#Batch42' } })
    qc.clear()
  })
})
