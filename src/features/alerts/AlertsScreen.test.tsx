// Opening an unread alert marks it read; if that fails, the list says so.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react-native'

import type { Notification } from '@/shared/types'

import { AlertsScreen } from './AlertsScreen'

const mockApi = jest.fn()
const mockPush = jest.fn()
const mockNavigate = jest.fn()
jest.mock('@/api/client', () => ({ api: (...a: unknown[]) => mockApi(...a), ApiError: class extends Error {}, fieldErrors: () => ({}), session: {} }))
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), back: jest.fn(), canGoBack: () => true, navigate: (...a: unknown[]) => mockNavigate(...a) } }))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, full_name: 'Rahul Patil' }, hasRole: () => false }) }))

const alert: Notification = {
  id: 7, event: 'ct_assigned', title: 'CT assigned', message: 'Ravi will run the trials.', project: 'p1', project_name: 'Baner podium',
  trial_id: null, link: '/projects/p1', actor_name: 'Neha Admin', is_read: false, read_at: null, created_at: new Date().toISOString(),
}

it('opens the alert and shows an error when marking it read fails', async () => {
  mockApi.mockImplementation(async (path: string) => {
    if (path === '/notifications/') return { count: 1, next: null, previous: null, results: [alert] }
    if (path === '/notifications/unread-count/') return { unread: 1 }
    if (path === '/notifications/7/read/') throw { status: 503, code: 'server_error', message: 'Down', fields: {} }
    throw new Error(`unexpected ${path}`)
  })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } })
  await render(<QueryClientProvider client={qc}><AlertsScreen /></QueryClientProvider>)
  await fireEvent.press(await screen.findByRole('link', { name: /^Unread\. CT assigned/ }))
  expect(mockPush).toHaveBeenCalledWith('/project/p1')
  expect(await screen.findByText('"CT assigned" could not be marked as read. Something went wrong on the server. Try again.')).toBeTruthy()
  qc.clear()
})

it('an alert whose link names no screen of the app goes to My work', async () => {
  mockPush.mockReset()
  mockApi.mockImplementation(async (path: string) => {
    if (path === '/notifications/') return { count: 1, next: null, previous: null, results: [{ ...alert, is_read: true, link: 'https://evil.example/x' }] }
    if (path === '/notifications/unread-count/') return { unread: 0 }
    throw new Error(`unexpected ${path}`)
  })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } })
  await render(<QueryClientProvider client={qc}><AlertsScreen /></QueryClientProvider>)
  await fireEvent.press(await screen.findByRole('link', { name: /CT assigned/ }))
  expect(mockPush).not.toHaveBeenCalled()
  expect(mockNavigate).toHaveBeenCalledWith('/')
  qc.clear()
})
