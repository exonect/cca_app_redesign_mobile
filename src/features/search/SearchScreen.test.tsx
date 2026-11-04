// Legacy: an empty search lists every product; trials outside your projects are not named.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react-native'

import { SearchScreen } from './SearchScreen'

const mockApi = jest.fn()
jest.mock('@/api/client', () => ({ api: (...a: unknown[]) => mockApi(...a), ApiError: class extends Error {}, fieldErrors: () => ({}), session: {} }))
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true, navigate: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, full_name: 'Rahul Patil' }, hasRole: () => false }) }))

const match = { id: 1, source: 'trial', trial: null, label: '', date: '2026-08-18', project: '', customer: '', free_wc: '0.38', cementitious: '420', dosage: '0.90', strength_28d: '52.80', restricted: true }

it('lists every product with no criteria and hides other projects', async () => {
  mockApi.mockImplementation(async (path: string) => {
    if (path === '/search/') return { criteria: {}, products: 1, trials: 1, results: [{ product: 'Neutrol 585 V2', family: 'neutrol', recipe: 7, trials: 1, met: 1, best_28d: '52.80', typical_dosage: '0.90', matches: [match] }] }
    throw new Error(`unexpected ${path}`)
  })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  await render(<QueryClientProvider client={qc}><SearchScreen /></QueryClientProvider>)
  expect(mockApi).not.toHaveBeenCalled()
  await fireEvent.press(screen.getByRole('button', { name: 'List every product' }))
  expect(await screen.findByText('Trial outside your projects')).toBeTruthy()
  expect(mockApi).toHaveBeenCalledWith('/search/', { method: 'POST', body: {} })
  expect(screen.getByText(/no criteria, every product listed/)).toBeTruthy()
  qc.clear()
})
