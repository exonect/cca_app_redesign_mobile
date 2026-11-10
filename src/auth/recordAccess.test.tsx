// Record level access: a record the server now refuses (403) or no longer
// shows (404) is never drawn from the copy saved on this phone, and an edit
// screen for a record the person may not edit is not a form.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'

import { ProjectFormScreen } from '@/features/projects/ProjectFormScreen'
import { ProjectScreen } from '@/features/projects/ProjectScreen'
import { RecipeScreen } from '@/features/recipes/RecipeScreen'
import { SieveDataScreen } from '@/features/trials/SieveDataScreen'

import { NO_ACCESS_TITLE, NOT_FOUND_TITLE } from './RequireAccess'

const mockApi = jest.fn()
jest.mock('@/api/client', () => {
  class ApiError extends Error {
    status: number; code: string; fields: Record<string, string[]>
    constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; this.fields = {} }
  }
  return { ApiError, api: (...a: unknown[]) => mockApi(...a), fieldErrors: () => ({}), session: {} }
})
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'p-1' }),
  usePreventRemove: jest.fn(),
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn(), push: jest.fn(), navigate: jest.fn() },
}))
let mockRole = 'AD'
jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 1, role: mockRole, full_name: 'Test User' }, hasRole: (...r: string[]) => r.includes(mockRole) }),
}))
const { ApiError } = jest.requireMock('@/api/client')

let qc: QueryClient
const wrap = (node: ReactNode) => <QueryClientProvider client={qc}>{node}</QueryClientProvider>

/** A copy saved on the phone, and the server now answering with an error. */
function savedThenRefused(key: unknown[], saved: unknown, status: number) {
  qc.setQueryData(key, saved)
  mockApi.mockRejectedValue(new ApiError(status, status === 404 ? 'not_found' : 'permission_denied', status === 404 ? 'Not found.' : 'You do not have permission.'))
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  mockApi.mockReset()
  mockRole = 'AD'
})
afterEach(() => { qc.clear() })

describe('project', () => {
  it.each([[404, NOT_FOUND_TITLE], [403, NO_ACCESS_TITLE]])('a saved project the server answers %s for is not shown', async (status, title) => {
    // Saved copy is shown while the check is in flight only if the server has not refused it yet.
    qc.setQueryData(['project', 'p-1'], { id: 'p-1', project_name: 'Secret dam' })
    await qc.getQueryCache().find({ queryKey: ['project', 'p-1'] })!.setState({ status: 'error', error: new ApiError(status, 'x', 'x'), fetchStatus: 'idle' })
    mockApi.mockRejectedValue(new ApiError(status, 'x', 'x'))
    await render(wrap(<ProjectScreen id="p-1" />))
    expect(await screen.findByText(title)).toBeTruthy()
    expect(screen.queryByText('Secret dam')).toBeNull()
  })

  it('the edit screen shows the read only notice, not a form, when the server says no edit', async () => {
    mockRole = 'SAD'
    mockApi.mockImplementation(async (path: string) => {
      if (path === '/projects/p-1/') return { id: 'p-1', project_name: 'Dam', status: 'created', actions: { edit: false } }
      throw new Error(path)
    })
    await render(wrap(<ProjectFormScreen id="p-1" />))
    expect(await screen.findByText('You cannot edit this project')).toBeTruthy()
    expect(screen.queryByLabelText(/Customer name/)).toBeNull()
  })

  it('the edit screen for a project the server hides shows not found', async () => {
    mockApi.mockRejectedValue(new ApiError(404, 'not_found', 'Not found.'))
    await render(wrap(<ProjectFormScreen id="p-1" />))
    expect(await screen.findByText(/This was not found/)).toBeTruthy()
  })
})

describe('recipe', () => {
  it.each([[404, NOT_FOUND_TITLE], [403, NO_ACCESS_TITLE]])('a saved recipe the server answers %s for is not shown', async (status, title) => {
    qc.setQueryData(['recipe', '5'], { id: 5, product_name: 'Secret mix', components: {} })
    await qc.getQueryCache().find({ queryKey: ['recipe', '5'] })!.setState({ status: 'error', error: new ApiError(status, 'x', 'x'), fetchStatus: 'idle' })
    mockApi.mockRejectedValue(new ApiError(status, 'x', 'x'))
    await render(wrap(<RecipeScreen id="5" />))
    expect(await screen.findByText(title)).toBeTruthy()
    expect(screen.queryByText(/Secret mix/)).toBeNull()
  })
})

describe('sieve data', () => {
  it.each([404, 403])('saved sieve data the server answers %s for is not shown or editable', async (status) => {
    savedThenRefused(['sieve-data', 'p-1'], { project: 'p-1', sieves: {}, proportions: {}, source: 'SECRET-SOURCE', results: { sieves: {}, grading: [], errors: [] }, updated_at: null, updated_by: null, can_edit: true }, status)
    await qc.getQueryCache().find({ queryKey: ['sieve-data', 'p-1'] })!.setState({ status: 'error', error: new ApiError(status, 'x', 'x'), fetchStatus: 'idle' })
    await render(wrap(<SieveDataScreen />))
    expect(await screen.findByText('This project was not found, or you cannot see it.')).toBeTruthy()
    expect(screen.queryByText(/SECRET-SOURCE/)).toBeNull()
    await waitFor(() => expect(screen.queryByRole('button', { name: /Save/ })).toBeNull())
  })
})
