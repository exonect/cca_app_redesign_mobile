// Trial screen flows: live cube strength and Save per age, start trial
// without a cast date, and closing with the confirm_close round trip.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'

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
  }
})
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)

let mockParams: Record<string, string> = { id: 't-1', step: '4' }
const mockSetParams = jest.fn((p: Record<string, string>) => { mockParams = { ...mockParams, ...p } })
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  usePreventRemove: jest.fn(),
  router: { setParams: (p: Record<string, string>) => mockSetParams(p), back: jest.fn(), canGoBack: () => true, replace: jest.fn(), push: jest.fn() },
}))

const project = {
  id: 'p-1', project_name: 'Palava Phase 4 towers', requirement_type: 'slump', compressive_strengths: [{ id: 1, value: '48' }],
  strength_age: { id: 2, value: '28 days' }, retention_time: { id: 3, value: '2' }, slump_flow: { id: 4, value: '160' },
  cementitious_contents: [420], sales_person: { id: 5, name: 'Amit Kulkarni' },
} as unknown as Project

function makeTrial(over: Partial<Trial> = {}): Trial {
  return {
    id: 't-1', code: 'WEST202611471902-03', project: 'p-1', project_name: 'Palava Phase 4 towers', customer_name: 'Konkan Ready Mix',
    status: 'in_progress', status_label: 'In progress', outcome: '', outcome_label: '', product: 'Neutrol 585', grade: 'M40',
    cast_at: '2026-10-28T10:00:00+05:30', free_wc: '0.38', strength_28d: null, created_by_name: 'Sneha Rao', created_at: '', updated_at: '',
    grade_of_concrete: null, sieves: {}, proportions: {}, batch_size: '0.04', admixture_1: null, dosage_1: null, admixture_2: null, dosage_2: null,
    materials: {}, fresh_test: 'slump', fresh_readings: {}, fresh_density: null, bleeding: null, setting: null, scc: {},
    remarks: '', signatory_sales: '', signatory_site_qc: '', signatory_rd: '', signature_sales: '', signature_site_qc: '', signature_rd: '',
    started_at: null, closed_at: null, cementitious_kg: null, attachments: [],
    results: { sieves: {}, grading: [], mix: null, cubes: { '1d': { rows: [], average: '12.40', due_at: null } }, checks: [], errors: [] },
    cube_sets: [{ age: '1d', age_label: '1 day', cubes: [{ weight: '8.4', load: '279' }], average: '12.40', tested_on: null }],
    actions: { edit: true, start: false, close: true, edit_cubes: true, delete: false, attach: true },
    ...over,
  }
}

function serve(trial: Trial, extra: (path: string, opts?: { method?: string; body?: Record<string, unknown> }) => unknown = () => undefined) {
  mockApi.mockImplementation(async (path: string, opts?: { method?: string; body?: Record<string, unknown> }) => {
    const r = await extra(path, opts)
    if (r !== undefined) return r
    if (path === '/trials/t-1/' && !opts?.method) return trial
    if (path === '/projects/p-1/') return project
    if (path === '/trials/t-1/close-check/') return { warnings: [], checks: [] }
    if (path === '/lookups/' || path === '/grading-limits/' || path === '/recipes/products/') return []
    throw new Error(`Unexpected ${opts?.method ?? 'GET'} ${path}`)
  })
}

async function open(step: number) {
  mockParams = { id: 't-1', step: String(step) }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await render(<QueryClientProvider client={qc}><TrialScreen /></QueryClientProvider>)
}

beforeEach(() => { mockApi.mockReset(); mockSetParams.mockClear(); jest.useFakeTimers({ now: new Date('2026-11-04T06:00:00Z'), advanceTimers: true }) })
afterEach(() => { jest.useRealTimers() })

describe('cube strength', () => {
  it('opens on the age due today and shows live strength, average and % of target', async () => {
    serve(makeTrial())
    await open(4)
    expect(await screen.findByText('7 day test, 4 Nov')).toBeTruthy()
    await fireEvent.changeText(screen.getByLabelText('7 days, cube 1 load in kilonewtons'), '702')
    await fireEvent.changeText(screen.getByLabelText('7 days, cube 2 load in kilonewtons'), '688')
    await fireEvent.changeText(screen.getByLabelText('7 days, cube 3 load in kilonewtons'), '715')
    expect(screen.getByTestId('str-7d-0')).toHaveTextContent('31.20')
    expect(screen.getByTestId('avg-7d')).toHaveTextContent('31.19')
    expect(screen.getByTestId('pct-7d')).toHaveTextContent('65% of the 28 day target')
  })

  it('saves one age with PUT and shows the server average', async () => {
    const saved = makeTrial({
      cube_sets: [...makeTrial().cube_sets, { age: '7d', age_label: '7 days', cubes: [{ weight: null, load: '702.00' }, { weight: null, load: null }, { weight: null, load: null }], average: '31.20', tested_on: null }],
      results: { ...makeTrial().results, cubes: { ...makeTrial().results.cubes, '7d': { rows: [], average: '31.20', due_at: null } } },
    })
    serve(makeTrial(), (path, opts) => (opts?.method === 'PUT' ? saved : undefined))
    await open(4)
    await fireEvent.changeText(await screen.findByLabelText('7 days, cube 1 load in kilonewtons'), '702')
    await fireEvent.press(screen.getByRole('button', { name: 'Save 7 day results' }))
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/trials/t-1/cubes/7d/', {
      method: 'PUT', body: { cubes: [{ weight: null, load: '702' }, { weight: null, load: null }, { weight: null, load: null }] },
    }))
    expect(await screen.findByText('7 days cube results saved')).toBeTruthy()
  })
})

describe('draft trial', () => {
  it('shows the server error when starting without a cast date and moves to mix design', async () => {
    const { ApiError } = jest.requireMock('@/api/client')
    const draft = makeTrial({ status: 'draft', code: null, cast_at: null, actions: { edit: true, start: true, close: false, edit_cubes: true, delete: true, attach: true } })
    serve(draft, (path) => {
      if (path === '/trials/t-1/start/') throw new ApiError(400, 'validation_error', 'Check the fields.', { cast_at: ['Enter the trial date and time before starting. Cube test dates count from it.'] })
      return undefined
    })
    await open(1)
    expect(await screen.findByText('Draft trial')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Start trial' }))
    await waitFor(() => expect(mockSetParams).toHaveBeenCalledWith({ step: '2' }))
    expect(await screen.findByText('Enter the trial date and time before starting. Cube test dates count from it.')).toBeTruthy()
  })
})

describe('closing', () => {
  it('asks to confirm when the server answers confirm_close and resends with confirm true', async () => {
    const { ApiError } = jest.requireMock('@/api/client')
    const alert = jest.spyOn(Alert, 'alert')
    const bodies: Record<string, unknown>[] = []
    serve(makeTrial(), (path, opts) => {
      if (path !== '/trials/t-1/close/') return undefined
      bodies.push(opts!.body!)
      if (!opts!.body!.confirm) throw new ApiError(409, 'confirm_close', 'The 28 day cube result is not in yet, due 25 Nov 2026. A Sales Admin can add it after closing.')
      return makeTrial({ status: 'closed', outcome: 'met', outcome_label: 'Met expectation', actions: { edit: false, start: false, close: false, edit_cubes: false, delete: false, attach: false } })
    })
    await open(5)
    await fireEvent.press(await screen.findByRole('button', { name: 'Close trial' }))
    expect((await screen.findAllByText('Choose a conclusion before closing the trial.')).length).toBe(2)

    await fireEvent.press(screen.getByRole('radio', { name: 'Met expectation' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Close trial' }))
    await waitFor(() => expect(alert).toHaveBeenCalled())
    const [title, message, buttons] = alert.mock.calls[0] as [string, string, { text: string; onPress?: () => void }[]]
    expect(title).toBe('Close the trial anyway?')
    expect(message).toContain('The 28 day cube result is not in yet, due 25 Nov 2026.')
    buttons.find((b) => b.text === 'Close trial')!.onPress!()
    await waitFor(() => expect(bodies).toHaveLength(2))
    expect(bodies[0]).toEqual({ outcome: 'met', remarks: '' })
    expect(bodies[1]).toEqual({ outcome: 'met', remarks: '', confirm: true })
    expect(await screen.findByText('Trial closed. WEST202611471902-03, met expectation.')).toBeTruthy()
  })
})

describe('error handling', () => {
  it('stops cube text before saving and says which cube', async () => {
    serve(makeTrial())
    await open(4)
    await fireEvent.changeText(await screen.findByLabelText('7 days, cube 2 load in kilonewtons'), '7O2')
    await fireEvent.press(screen.getByRole('button', { name: 'Save 7 day results' }))
    expect(await screen.findAllByText(/Check cube 2\./)).not.toHaveLength(0)
    expect(mockApi).not.toHaveBeenCalledWith('/trials/t-1/cubes/7d/', expect.anything())
  })

  it('closes once however often Close trial is tapped', async () => {
    let closes = 0
    let finish: (t: Trial) => void = () => undefined
    serve(makeTrial(), (path) => {
      if (path !== '/trials/t-1/close/') return undefined
      closes += 1
      return new Promise<Trial>((resolve) => { finish = resolve })
    })
    await open(5)
    await fireEvent.press(await screen.findByRole('radio', { name: 'Met expectation' }))
    const button = screen.getByRole('button', { name: 'Close trial' })
    await fireEvent.press(button)
    await fireEvent.press(button)
    await waitFor(() => expect(closes).toBe(1))
    finish(makeTrial({ status: 'closed', outcome: 'met', outcome_label: 'Met expectation', actions: { edit: false, start: false, close: false, edit_cubes: false, delete: false, attach: false } }))
    expect(await screen.findByText('Trial closed. WEST202611471902-03, met expectation.')).toBeTruthy()
    expect(closes).toBe(1)
  })

  it('reloads the trial when a save is refused because it was closed meanwhile', async () => {
    const { ApiError } = jest.requireMock('@/api/client')
    let gets = 0
    serve(makeTrial(), (path, opts) => {
      if (path === '/trials/t-1/' && !opts?.method) { gets += 1; return undefined }
      if (path === '/trials/t-1/' && opts?.method === 'PATCH') {
        throw new ApiError(409, 'not_allowed', 'Closed trials are read only. Cube results can still be added by a Sales Admin.')
      }
      return undefined
    })
    await open(3)
    await fireEvent.changeText(await screen.findByLabelText(/Slump at 30 minutes/), '150')
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Closed trials are read only. Cube results can still be added by a Sales Admin.')).toBeTruthy()
    await waitFor(() => expect(gets).toBeGreaterThan(1))
  })
})
