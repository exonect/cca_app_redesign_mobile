// The trial screen without a connection: saves stay on the phone and say
// so, the trial shows "Not synced yet", closing explains it needs a
// connection, and a trial that was never opened says it is not on the phone.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { resetConnectivity, setNetwork } from '@/offline/connectivity'
import { bindQueryClient, outbox } from '@/offline/outbox'
import { CLOSE_OFFLINE } from '@/offline/trialActions'
import type { Project, Trial } from '@/shared/types'

import { TrialScreen } from './TrialScreen'

const mockApi = jest.fn()
jest.mock('@/api/client', () => {
  class ApiError extends Error {
    status: number; code: string; fields: Record<string, string[]>
    constructor(status: number, code: string, message: string, fields: Record<string, string[]> = {}) {
      super(message); this.status = status; this.code = code; this.fields = fields
    }
  }
  return {
    ApiError,
    api: (...a: unknown[]) => mockApi(...a),
    fieldErrors: (e: { fields?: Record<string, string[]> }) => Object.fromEntries(Object.entries(e?.fields ?? {}).map(([k, v]) => [k, v[0]])),
    session: { accessToken: () => 'tok', baseUrl: 'http://api' },
    UPLOAD_TIMEOUT_MS: 300_000,
  }
})
jest.mock('@/offline/storage', () => {
  const { memoryStorage } = jest.requireActual('@/offline/storage')
  const store = memoryStorage()
  return { memoryStorage, offlineStorage: () => store, fileKeeper: { keep: jest.fn(), drop: jest.fn() } }
})
let mockUuid = 0
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockUuid}` }))
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ hasRole: () => false, user: { id: 7 } }) }))

let mockParams: Record<string, string> = { id: 't-1', step: '4' }
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  usePreventRemove: jest.fn(),
  router: { setParams: jest.fn(), back: jest.fn(), canGoBack: () => true, replace: jest.fn(), push: jest.fn() },
}))

const project = {
  id: 'p-1', project_name: 'Palava Phase 4 towers', requirement_type: 'slump', compressive_strengths: [{ id: 1, value: '48' }],
  strength_age: { id: 2, value: '28 days' }, retention_time: { id: 3, value: '2' }, slump_flow: { id: 4, value: '160' },
  cementitious_contents: [420], sales_person: { id: 5, name: 'Amit Kulkarni' },
} as unknown as Project

const trial = {
  id: 't-1', code: 'WEST202611471902-03', project: 'p-1', project_name: 'Palava Phase 4 towers', customer_name: 'Konkan Ready Mix',
  status: 'in_progress', status_label: 'In progress', outcome: '', outcome_label: '', product: 'Neutrol 585', grade: 'M40',
  cast_at: '2026-10-28T10:00:00+05:30', free_wc: '0.38', strength_28d: null, created_by_name: 'Sneha Rao', created_at: '', updated_at: '',
  grade_of_concrete: null, sieves: {}, proportions: {}, batch_size: '0.04', admixture_1: null, dosage_1: null, admixture_2: null, dosage_2: null,
  materials: {}, fresh_test: 'slump', fresh_readings: {}, fresh_density: null, bleeding: null, setting: null, scc: {},
  remarks: '', signatory_sales: '', signatory_site_qc: '', signatory_rd: '', signature_sales: '', signature_site_qc: '', signature_rd: '',
  started_at: null, closed_at: null, cementitious_kg: null, attachments: [],
  results: { sieves: {}, grading: [], mix: null, cubes: {}, checks: [], errors: [] },
  cube_sets: [], actions: { edit: true, start: false, close: true, edit_cubes: true, delete: false, attach: true },
} as unknown as Trial

let qc: QueryClient

async function open(step: number, cached = true) {
  mockParams = { id: 't-1', step: String(step) }
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  bindQueryClient(qc)
  if (cached) {
    qc.setQueryData(['trial', 't-1'], trial)
    qc.setQueryData(['project', 'p-1'], project)
  }
  await render(<QueryClientProvider client={qc}><TrialScreen /></QueryClientProvider>)
}

beforeEach(async () => {
  mockApi.mockReset()
  resetConnectivity()
  outbox.setUser(7)
  await outbox.load()
  for (const op of [...outbox.getSnapshot()]) await outbox.discard(op.id)
  await act(async () => { setNetwork({ isConnected: false, isInternetReachable: false }) })
  jest.useFakeTimers({ now: new Date('2026-11-04T06:00:00Z'), advanceTimers: true })
})
afterEach(() => { jest.useRealTimers() })

it('keeps cube results on the phone, says so, and marks the trial not synced yet', async () => {
  await open(4)
  await fireEvent.changeText(await screen.findByLabelText('7 days, cube 1 load in kilonewtons'), '702')
  await fireEvent.press(screen.getByRole('button', { name: 'Save 7 day results' }))
  expect(await screen.findByText('7 days cube results saved on this phone. It will sync when you are back online.')).toBeTruthy()
  expect(screen.getByText('Not synced yet: 1 change saved on this phone will sync when you are back online.')).toBeTruthy()
  expect(mockApi).not.toHaveBeenCalled()
  expect(outbox.getSnapshot()).toMatchObject([{ kind: 'put_cubes', trialId: 't-1', age: '7d' }])

  // Back online: the change replays and the note goes.
  mockApi.mockResolvedValue({ ...trial, cube_sets: [{ age: '7d', age_label: '7 days', cubes: [{ weight: null, load: '702.00' }], average: '31.20', tested_on: null }] })
  await act(async () => { resetConnectivity(); await outbox.flush() })
  expect(mockApi).toHaveBeenCalledWith('/trials/t-1/cubes/7d/', {
    method: 'PUT', body: { cubes: [{ weight: null, load: '702' }, { weight: null, load: null }, { weight: null, load: null }], tested_on: '2026-11-04' },
  })
  await waitFor(() => expect(screen.queryByText(/Not synced yet/)).toBeNull())
})

it('explains that closing needs a connection', async () => {
  await open(5)
  expect(await screen.findByText('Closing needs a connection. Everything else on this trial can be saved offline.')).toBeTruthy()
  await fireEvent.press(screen.getByRole('radio', { name: 'Met expectation' }))
  await fireEvent.press(screen.getByRole('button', { name: 'Close trial' }))
  expect(await screen.findByText(CLOSE_OFFLINE)).toBeTruthy()
  expect(mockApi).not.toHaveBeenCalledWith('/trials/t-1/close/', expect.anything())
})

it('says when a trial is not saved on the phone', async () => {
  await open(1, false)
  expect(await screen.findByText(/You are offline and this trial is not saved on this phone/)).toBeTruthy()
})

it('opens a trial made on this phone before the server has it', async () => {
  await outbox.enqueue({ kind: 'create_trial', trialId: 'local-9', project: 'p-1', projectName: 'Palava Phase 4 towers', customerName: 'Konkan' })
  mockParams = { id: 'local-9', step: '1' }
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  qc.setQueryData(['project', 'p-1'], project)
  await render(<QueryClientProvider client={qc}><TrialScreen /></QueryClientProvider>)
  expect(await screen.findByText('Draft trial')).toBeTruthy()
  expect(screen.getByText('Not synced yet: 1 change saved on this phone will sync when you are back online.')).toBeTruthy()
  expect(mockApi).not.toHaveBeenCalled()
})

it('stops an offline Start that the server would refuse and lists what is missing, linked to each step', async () => {
  const draft = { ...trial, status: 'draft', code: null, actions: { ...trial.actions, start: true, close: false } } as unknown as Trial
  mockParams = { id: 't-1', step: '1' }
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  bindQueryClient(qc)
  qc.setQueryData(['trial', 't-1'], draft)
  qc.setQueryData(['project', 'p-1'], project)
  await render(<QueryClientProvider client={qc}><TrialScreen /></QueryClientProvider>)
  await fireEvent.press(await screen.findByRole('button', { name: 'Start trial' }))
  expect(await screen.findByText('The trial cannot start yet')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Fresh concrete: Site temperature is required.' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Sieve analysis: All in grading proportions must total 100%.' })).toBeTruthy()
  expect(outbox.getSnapshot()).toEqual([])
  expect(mockApi).not.toHaveBeenCalled()
})
