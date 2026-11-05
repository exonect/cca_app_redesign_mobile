// More screen: Change password shows only while ID and password sign in is on (server switch).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react-native'

import { MoreScreen } from './MoreScreen'

const mockApi = jest.fn()
jest.mock('@/api/client', () => ({ api: (...a: unknown[]) => mockApi(...a) }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }))
jest.mock('expo-constants', () => ({ expoConfig: { version: '2.0.0', extra: {} } }))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('@/offline/outbox', () => ({ useSyncCounts: () => ({ waiting: 0, problems: 0 }) }))
let mockPasswordLogin = false
jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 7, role: 'CT', full_name: 'Sneha Rao', email: 'sneha@thermaxglobal.com' }, hasRole: (...r: string[]) => r.includes('CT'), signOut: jest.fn(), passwordLogin: mockPasswordLogin, reloadOptions: jest.fn() }),
}))

const wrap = () => <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: Infinity } } })}><MoreScreen /></QueryClientProvider>

it('hides Change password while ID and password sign in is off', async () => {
  mockPasswordLogin = false
  await render(wrap())
  expect(screen.queryByText('Change password')).toBeNull()
})

it('changes the password and confirms it', async () => {
  mockPasswordLogin = true
  mockApi.mockResolvedValueOnce(undefined)
  await render(wrap())
  await fireEvent.press(screen.getByRole('link', { name: 'Change password, ID and password sign in' }))
  await fireEvent.changeText(screen.getByLabelText('Current password'), 'Old#Pass99')
  await fireEvent.changeText(screen.getByLabelText('New password'), 'Kiln#Batch42')
  await fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'Kiln#Batch42')
  await fireEvent.press(screen.getByRole('button', { name: 'Change password' }))
  expect(await screen.findByText('Password changed')).toBeTruthy()
  expect(mockApi).toHaveBeenCalledWith('/auth/change-password/', { body: { current_password: 'Old#Pass99', new_password: 'Kiln#Batch42' } })
})
