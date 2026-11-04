// Editing a recipe and leaving without saving asks first, like the project form.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Alert } from 'react-native'

import type { Recipe } from '@/shared/types'

import { RecipeForm } from './RecipeScreen'

const mockApi = jest.fn()
const mockPreventRemove = jest.fn((_dirty: boolean, _cb?: unknown) => jest.fn())
jest.mock('@/api/client', () => ({ api: (...a: unknown[]) => mockApi(...a), ApiError: class extends Error {}, fieldErrors: () => ({}), session: {} }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true, navigate: jest.fn() },
  usePreventRemove: (dirty: boolean, cb?: unknown) => mockPreventRemove(dirty, cb),
}))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, full_name: 'Ravi CT', emp_id: 'E2' }, hasRole: (...r: string[]) => r.includes('CT') }) }))

const recipe: Recipe = {
  id: 9, family: 'neutrol', family_label: 'Neutrol', product_name: 'Neutrol 585', version: 1, label: 'Neutrol 585 V1', formulation_name: '',
  sfdc_no: '', formulator: 1, formulator_name: 'Ravi CT', location: 3, location_name: 'Pune', customer_name: '', project_name: '',
  status: 'active', status_label: 'Active', components: { R101: '40.00', J000: '60.00' }, total: '100.00', created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z',
}

beforeEach(() => {
  mockApi.mockReset(); mockPreventRemove.mockClear()
  mockApi.mockImplementation(async (path: string) => (path === '/lookups/' ? [] : Promise.reject(new Error(`unexpected ${path}`))))
})

it('asks before leaving with unsaved changes', async () => {
  const onDone = jest.fn()
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } })
  await render(<QueryClientProvider client={qc}><RecipeForm recipe={recipe} onDone={onDone} /></QueryClientProvider>)
  expect(mockPreventRemove.mock.calls.at(-1)?.[0]).toBe(false)
  await fireEvent.changeText(screen.getByLabelText('Quantity of R101, percent'), '41')
  expect(mockPreventRemove.mock.calls.at(-1)?.[0]).toBe(true)
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))
  expect(alert).toHaveBeenCalledWith('Leave without saving?', 'This recipe has changes that are not saved yet.', expect.any(Array))
  expect(onDone).not.toHaveBeenCalled()
  const leave = (alert.mock.calls[0][2] as { text: string; onPress?: () => void }[]).find((b) => b.text === 'Leave without saving')!
  leave.onPress!()
  expect(onDone).toHaveBeenCalled()
  alert.mockRestore()
  qc.clear()
})

it('leaves straight away when nothing changed', async () => {
  const onDone = jest.fn()
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } })
  await render(<QueryClientProvider client={qc}><RecipeForm recipe={recipe} onDone={onDone} /></QueryClientProvider>)
  await fireEvent.changeText(screen.getByLabelText('Product name'), 'Neutrol 586')
  await fireEvent.changeText(screen.getByLabelText('Product name'), 'Neutrol 585')
  expect(mockPreventRemove.mock.calls.at(-1)?.[0]).toBe(false)
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))
  expect(alert).not.toHaveBeenCalled()
  expect(onDone).toHaveBeenCalled()
  alert.mockRestore()
  qc.clear()
})
