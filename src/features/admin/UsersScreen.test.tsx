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
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, full_name: 'Neha Admin' }, hasRole: (...r: string[]) => r.includes('AD') }) }))

const user = (over: Partial<User>): User => ({
  id: 1, email: 'neha@thermaxglobal.com', emp_id: 'E1', first_name: 'Neha', last_name: 'Admin', full_name: 'Neha Admin', role: 'AD',
  role_label: 'Admin', region: null, region_name: null, manager: null, manager_name: null, is_active: true, last_login: null, ...over,
})
const me = user({})
const other = user({ id: 2, email: 'ravi@thermaxglobal.com', emp_id: 'E2', first_name: 'Ravi', last_name: 'CT', full_name: 'Ravi CT', role: 'CT', role_label: 'CT' })

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
  expect(await screen.findByRole('button', { name: 'Deactivate Ravi CT' })).toBeTruthy()
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
  await fireEvent.press(await screen.findByRole('button', { name: 'Edit Ravi CT' }))
  expect(await screen.findByRole('radio', { name: /^Sales Person\./ })).toBeTruthy()
  expect(screen.queryByText('You cannot change your own role. Ask another Admin.')).toBeNull()
  qc.clear()
})
