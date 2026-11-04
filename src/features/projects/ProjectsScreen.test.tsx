import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react-native'

import { api } from '@/api/client'

import { ProjectsScreen } from './ProjectsScreen'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() },
  useLocalSearchParams: () => ({}),
}))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 1, full_name: 'Subrata Dey', region_name: 'West' }, hasRole: (...r: string[]) => r.includes('SAD') }),
}))
jest.mock('@/api/client', () => ({ api: jest.fn() }))
const mockApi = api as jest.MockedFunction<typeof api>

const row = {
  id: 'p1', status: 'created', status_label: 'Created', project_name: 'Baner podium', customer_name: 'Mula Concrete', sfdc_no: '490233',
  region: null, city: { id: 2, value: 'Pune' }, sales_person: { id: 3, name: 'Rahul Patil' }, ct: null, trial_count: 0, potential_cr: '0.90',
  created_at: '2025-01-05T10:00:00Z', updated_at: '2026-11-03T10:00:00Z',
}

it('lists projects newest created first, shows the created date and searches Sales Person and CT', async () => {
  mockApi.mockImplementation(async (path: string) => {
    if (path === '/projects/pipeline/') return { stages: [], projects: 1, potential_cr: '0.90' } as never
    return { count: 1, next: null, previous: null, results: [row] } as never
  })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  await render(<QueryClientProvider client={qc}><ProjectsScreen /></QueryClientProvider>)
  expect(await screen.findByText(/created 5 Jan 2025/)).toBeTruthy()
  await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/projects/', expect.objectContaining({
    query: expect.objectContaining({ ordering: '-created_at' }),
  })))
  expect(screen.getByPlaceholderText('Search project, customer, SFDC, Sales Person or CT')).toBeTruthy()
  qc.clear()
})
