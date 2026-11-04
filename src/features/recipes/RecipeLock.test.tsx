// A recipe used by a trial is locked: the detail says so and offers Create
// new version, which opens the form prefilled and saves a new version.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import type { RecipeWithLock } from '@/shared/typesExt'

import { RecipeScreen } from './RecipeScreen'

const mockApi = jest.fn()
const mockReplace = jest.fn()
jest.mock('@/api/client', () => ({ api: (...a: unknown[]) => mockApi(...a), ApiError: class extends Error {}, fieldErrors: () => ({}), session: {} }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn(), canGoBack: () => true, navigate: jest.fn() },
  usePreventRemove: () => jest.fn(),
}))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
let mockRole = 'AD'  // only an Admin edits recipes (legacy)
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, full_name: 'Ravi CT', emp_id: 'E2' }, hasRole: (...r: string[]) => r.includes(mockRole) }) }))

const recipe: RecipeWithLock = {
  id: 9, family: 'neutrol', family_label: 'Neutrol', product_name: 'Neutrol 585', version: 3, label: 'Neutrol 585 V3', formulation_name: 'N-585',
  sfdc_no: '123456', formulator: 1, formulator_name: 'Ravi CT', location: 3, location_name: 'Pune', customer_name: 'Konkan', project_name: 'Palava',
  status: 'active', status_label: 'Active', components: { R101: '40.00', J000: '60.00' }, total: '100.00', created_at: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-01T10:00:00Z', locked: true, trial_count: 4,
}

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } })

beforeEach(() => {
  mockRole = 'AD'
  mockApi.mockReset()
  mockApi.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (path === '/recipes/9/' && !opts?.method) return recipe
    if (path === '/lookups/') return [{ id: 3, value: 'Pune' }]
    if (path === '/recipes/' && opts?.method === 'POST') return { ...recipe, id: 10, version: 4, locked: false, trial_count: 0 }
    if (path === '/recipes/9/' && opts?.method === 'PATCH') return { ...recipe, status: 'on_hold', status_label: 'On hold' }
    throw new Error(`unexpected ${path}`)
  })
})

it('shows a locked recipe as locked, with Create new version instead of Edit', async () => {
  await render(<QueryClientProvider client={client()}><RecipeScreen id="9" /></QueryClientProvider>)
  expect(await screen.findByText(/^Used in 4 trials, so it is locked\./)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Edit recipe' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Create new version' })).toBeTruthy()
})

it('still lets a locked recipe go on hold', async () => {
  await render(<QueryClientProvider client={client()}><RecipeScreen id="9" /></QueryClientProvider>)
  await fireEvent.press(await screen.findByRole('button', { name: 'Put on hold' }))
  await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/recipes/9/', { method: 'PATCH', body: { status: 'on_hold' } }))
})

it('opens the form prefilled and saves a new version through POST with the confirmation', async () => {
  await render(<QueryClientProvider client={client()}><RecipeScreen id="9" /></QueryClientProvider>)
  await fireEvent.press(await screen.findByRole('button', { name: 'Create new version' }))
  expect(await screen.findByText('New version of Neutrol 585')).toBeTruthy()
  expect(screen.getByLabelText('Product name').props.value).toBe('Neutrol 585')
  expect(screen.getByLabelText('Quantity of R101, percent').props.value).toBe('40.00')
  await fireEvent.changeText(screen.getByLabelText('Quantity of R101, percent'), '42')
  await fireEvent.press(screen.getByRole('button', { name: 'Save recipe' }))
  await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/recipes/', expect.objectContaining({ method: 'POST' })))
  const body = mockApi.mock.calls.find(([p, o]) => p === '/recipes/' && o?.method === 'POST')![1].body
  expect(body).toMatchObject({ product_name: 'Neutrol 585', family: 'neutrol', location: 3, confirm_new_version: true, components: { R101: '42' } })
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/recipes/10'))
})

it('shows a CT the recipe read only (legacy: CTs had View only)', async () => {
  mockRole = 'CT'
  await render(<QueryClientProvider client={client()}><RecipeScreen id="9" /></QueryClientProvider>)
  expect(await screen.findByText('Only an Admin can change recipes or their status.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Create new version' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Put on hold' })).toBeNull()
})
