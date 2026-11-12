// Trial screen flows: live cube strength and Save per age, start trial
// without a cast date, and closing with the confirm_close round trip.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
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
const mockQueueFiles = jest.fn(async (..._a: unknown[]) => [] as string[])
jest.mock('@/offline/trialActions', () => ({ ...jest.requireActual('@/offline/trialActions'), queueFiles: (...a: unknown[]) => mockQueueFiles(...a) }))
const mockCamera = jest.fn()
const mockLibrary = jest.fn()
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
  launchCameraAsync: (...a: unknown[]) => mockCamera(...a),
  launchImageLibraryAsync: (...a: unknown[]) => mockLibrary(...a),
  UIImagePickerControllerQualityType: { IFrame1280x720: 7 },
}))
let mockRoles: string[] = ['CT']
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ hasRole: (...r: string[]) => r.some((x) => mockRoles.includes(x)), user: { id: 1 } }) }))

let mockParams: Record<string, string> = { id: 't-1', step: '4' }
const mockSetParams = jest.fn((p: Record<string, string>) => { mockParams = { ...mockParams, ...p } })
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  usePreventRemove: jest.fn(),
  router: { setParams: (p: Record<string, string>) => mockSetParams(p), back: jest.fn(), canGoBack: () => true, replace: jest.fn(), push: (...a: unknown[]) => mockPush(...a) },
}))

const project = {
  id: 'p-1', project_name: 'Palava Phase 4 towers', requirement_type: 'slump', compressive_strengths: [{ id: 1, value: '48' }],
  strength_age: { id: 2, value: '28 days' }, retention_time: { id: 3, value: '2' }, slump_flow: { id: 4, value: '160' },
  cementitious_contents: [420], sales_person: { id: 5, name: 'Amit Kulkarni' },
} as unknown as Project

/** A step 1 that lets the other steps open: 20 mm, 10 mm and crushed sand weighed, proportions 100. */
const STEP1 = {
  sieves: {
    '20mm': [{ sieve: '20', retained: '1.2' }, { sieve: '10', retained: '3.1' }, { sieve: 'pan', retained: '0.1' }],
    '10mm': [{ sieve: '10', retained: '1.0' }, { sieve: '4.75', retained: '3.5' }, { sieve: 'pan', retained: '0.5' }],
    crushed_sand: [{ sieve: '2.36', retained: '0.2' }, { sieve: 'pan', retained: '0.75' }],
  },
  proportions: { '20mm': '35', '10mm': '25', river_sand: '0', crushed_sand: '40' },
} as unknown as Pick<Trial, 'sieves' | 'proportions'>

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
    if (path === '/auth/me/') return {}
    if (path === '/lookups/' || path === '/grading-limits/' || path === '/recipes/products/') return []
    throw new Error(`Unexpected ${opts?.method ?? 'GET'} ${path}`)
  })
}

async function open(step: number) {
  mockParams = { id: 't-1', step: String(step) }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await render(<QueryClientProvider client={qc}><TrialScreen /></QueryClientProvider>)
}

beforeEach(() => { mockApi.mockReset(); mockSetParams.mockClear(); mockPush.mockClear(); mockRoles = ['CT']; jest.useFakeTimers({ now: new Date('2026-11-04T06:00:00Z'), advanceTimers: true }) })
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
    // The actual test date (legacy "Date of Testing") goes with the results: due today, so today.
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/trials/t-1/cubes/7d/', {
      method: 'PUT', body: { cubes: [{ weight: null, load: '702' }, { weight: null, load: null }, { weight: null, load: null }], tested_on: '2026-11-04' },
    }))
    expect(await screen.findByText('7 days cube results saved')).toBeTruthy()
  })

  it('takes a typed test date and refuses one in the future (T-66)', async () => {
    serve(makeTrial(), (path, opts) => (opts?.method === 'PUT' ? makeTrial() : undefined))
    await open(4)
    const date = await screen.findByLabelText('7 days cubes, date tested, day month year')
    expect(date.props.value).toBe('04/11/2026')
    await fireEvent.changeText(screen.getByLabelText('7 days, cube 1 load in kilonewtons'), '702')
    await fireEvent.changeText(date, '05112026')
    await fireEvent.press(screen.getByRole('button', { name: 'Save 7 day results' }))
    expect(await screen.findByText('The test date cannot be in the future.')).toBeTruthy()
    await fireEvent.changeText(date, '03/11/2026')
    await fireEvent.press(screen.getByRole('button', { name: 'Save 7 day results' }))
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/trials/t-1/cubes/7d/', expect.objectContaining({
      body: expect.objectContaining({ tested_on: '2026-11-03' }),
    })))
  })

  it('deletes a saved cube set after confirming (legacy cube row delete)', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockClear()
    const after = makeTrial({ cube_sets: [], results: { ...makeTrial().results, cubes: {} } })
    serve(makeTrial(), (path, opts) => (path === '/trials/t-1/cubes/1d/' && opts?.method === 'DELETE' ? after : undefined))
    await open(4)
    await fireEvent.press(await screen.findByRole('tab', { name: /^1 day, saved/ }))
    await fireEvent.press(screen.getByRole('button', { name: 'Delete 1 day' }))
    expect(alert.mock.calls[0][0]).toBe('Delete the 1 day cube results?')
    expect(mockApi).not.toHaveBeenCalledWith('/trials/t-1/cubes/1d/', expect.objectContaining({ method: 'DELETE' }))
    const ok = (alert.mock.calls[0][2] as { text: string; onPress?: () => void }[]).find((b) => b.text === 'Delete 1 day')!
    await act(async () => { ok.onPress!() })
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/trials/t-1/cubes/1d/', { method: 'DELETE' }))
    expect(await screen.findByText('1 day cube results deleted')).toBeTruthy()
  })

  it('warns in amber about a cube weight typed in grams but still saves it', async () => {
    serve(makeTrial(), (path, opts) => (opts?.method === 'PUT' ? makeTrial() : undefined))
    await open(4)
    await fireEvent.changeText(await screen.findByLabelText('7 days, cube 1 weight in kilograms'), '8500')
    expect(screen.getByText(/8500 kg is far above the 8 to 9 kg of a 150 mm cube/)).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Save 7 day results' }))
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/trials/t-1/cubes/7d/', expect.anything()))
  })
})

describe('in progress trial', () => {
  const started = { edit: false, start: false, close: true, edit_cubes: true, delete: false, attach: true }
  it('shows the steps read only with the legacy banner', async () => {
    serve(makeTrial({ actions: started }))
    await open(3)
    expect(await screen.findByText(/This trial is in progress, so its steps are read only, as in the old app\./)).toBeTruthy()
    expect(screen.getByLabelText(/Slump at 30 minutes/)).toBeDisabled()
    expect(screen.getByLabelText('Site temperature, degrees Celsius').props.editable).toBe(false)
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })
})

describe('fresh concrete', () => {
  it('adds an SCC test from its master list and saves the number per reading time, with the site temperature (T-54, T-57)', async () => {
    const draft = makeTrial({ status: 'draft', code: null, actions: { edit: true, start: false, close: false, edit_cubes: true, delete: false, attach: true } })
    const bodies: Record<string, unknown>[] = []
    serve(draft, (path, opts) => {
      if (path === '/lookups/') return (opts as { query?: { category?: string } })?.query?.category === 'scc_v_funnel' ? [{ id: 1, value: '9 sec' }, { id: 2, value: '12 sec' }] : []
      if (path === '/trials/t-1/' && opts?.method === 'PATCH') { bodies.push(opts.body!); return draft }
      return undefined
    })
    await open(3)
    await fireEvent.press(await screen.findByLabelText(/^Add a self compacting test:/))
    await fireEvent.press(await screen.findByText('V funnel'))
    await fireEvent.press(await screen.findByLabelText(/^V funnel at 30 min:/))
    await fireEvent.press(await screen.findByText('12 sec'))
    expect(screen.getByLabelText('V funnel at 30 min: 12 sec')).toBeTruthy()
    await fireEvent.changeText(screen.getByLabelText('Site temperature, degrees Celsius'), '64')
    expect(screen.getByText('Site temperature 64 °C is above the usual 60 °C. Check it. Saved as entered.')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({ scc: { v_funnel: { 30: '12' } }, site_temp: '64' })
  })
})

describe('draft trial', () => {
  it('shows the server error when starting without a cast date and moves to mix design', async () => {
    const { ApiError } = jest.requireMock('@/api/client')
    const draft = makeTrial({ ...STEP1, status: 'draft', code: null, cast_at: null, actions: { edit: true, start: true, close: false, edit_cubes: true, delete: true, attach: true } })
    serve(draft, (path) => {
      if (path === '/trials/t-1/start/') throw new ApiError(400, 'validation_error', 'Check the fields.', { cast_at: ['Enter the trial date and time before starting. Cube test dates count from it.'] })
      return undefined
    })
    await open(1)
    expect(await screen.findByText('Draft trial')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Start trial' }))
    await waitFor(() => expect(mockSetParams).toHaveBeenCalledWith({ step: '2', why: '' }))
    expect(await screen.findByText('Enter the trial date and time before starting. Cube test dates count from it.')).toBeTruthy()
  })

  it('lists everything the server says is missing at Start, each linked to its step (legacy Create Trial rules)', async () => {
    const { ApiError } = jest.requireMock('@/api/client')
    const draft = makeTrial({ ...STEP1, status: 'draft', code: null, actions: { edit: true, start: true, close: false, edit_cubes: true, delete: false, attach: true } })
    serve(draft, (path) => {
      if (path === '/trials/t-1/start/') {
        throw new ApiError(400, 'validation_error', 'Check the fields.', {
          'materials.cement.source': ['Cement brand is required.'], site_temp: ['Site temperature is required.'], signatory_rd: ['For Thermax R&D is required.'],
        })
      }
      return undefined
    })
    await open(1)
    await fireEvent.press(await screen.findByRole('button', { name: 'Start trial' }))
    expect(await screen.findByText('The trial cannot start yet')).toBeTruthy()
    await fireEvent.press(screen.getByRole('link', { name: 'Fresh concrete: Site temperature is required.' }))
    expect(mockSetParams).toHaveBeenCalledWith({ step: '3', why: '' })
    expect(screen.getByRole('link', { name: 'Mix design: Cement brand is required.' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Conclusion: For Thermax R&D is required.' })).toBeTruthy()
  })

  it('shows where a new trial copied its sieve analysis from, in kg', async () => {
    serve(makeTrial({ status: 'draft', code: null, sieves_copied_from: 'WEST202611471902-02', actions: { edit: true, start: true, close: false, edit_cubes: true, delete: false, attach: true } }))
    await open(1)
    expect(await screen.findByText('Sieve analysis copied from WEST202611471902-02. Change it if this trial used other material.')).toBeTruthy()
    expect(screen.getByText('Retained, kg')).toBeTruthy()
    expect(screen.getAllByLabelText(/Weight retained on .*, kilograms/)).toHaveLength(9) // all eight grading sieves and the pan
  })

  it('types the admixture quantity and offers New formulation to a CT, back to this trial (T-36, C-18)', async () => {
    const draft = makeTrial({ status: 'draft', code: null, actions: { edit: true, start: false, close: false, edit_cubes: true, delete: false, attach: true } })
    serve(draft)
    await open(2)
    await fireEvent.press(await screen.findByRole('button', { name: 'New formulation' }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith({
      pathname: '/recipes/[id]',
      params: { id: 'new', for_trial: 't-1', sfdc_no: '', customer_name: '', project_name: 'Palava Phase 4 towers' },
    }))
    const { pickNewFormulation } = jest.requireActual('./newFormulation')
    await act(async () => { pickNewFormulation('t-1', 77) })
    expect(await screen.findByText('New formulation chosen as the product. Save to keep it.')).toBeTruthy()
  })

  it('hides New formulation from a Sales Person', async () => {
    mockRoles = ['SP']
    serve(makeTrial({ status: 'draft', code: null, actions: { edit: true, start: false, close: false, edit_cubes: true, delete: false, attach: true } }))
    await open(2)
    expect(await screen.findByText('Grade of concrete')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'New formulation' })).toBeNull()
  })
})

describe('closing', () => {
  const closed = () => makeTrial({ status: 'closed', outcome: 'met', outcome_label: 'Met expectation', actions: { edit: false, start: false, close: false, edit_cubes: false, delete: false, attach: false } })

  it('always asks to confirm (legacy), listing the server warnings, then closes with confirm true', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockClear()
    const bodies: Record<string, unknown>[] = []
    serve(makeTrial(), (path, opts) => {
      if (path === '/trials/t-1/close-check/') return { warnings: ['The 28 day cube result is not in yet, due 25 Nov 2026.'], checks: [] }
      if (path !== '/trials/t-1/close/') return undefined
      bodies.push(opts!.body!)
      return closed()
    })
    await open(5)
    await fireEvent.press(await screen.findByRole('button', { name: 'Close trial' }))
    expect((await screen.findAllByText('Choose a conclusion before closing the trial.')).length).toBe(2)

    await screen.findByText(/Before you close/)
    await fireEvent.press(screen.getByRole('radio', { name: 'Met expectation' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Close trial' }))
    await waitFor(() => expect(alert).toHaveBeenCalled())
    expect(bodies).toHaveLength(0) // nothing is closed before the person confirms
    const [title, message, buttons] = alert.mock.calls[0] as [string, string, { text: string; onPress?: () => void }[]]
    expect(title).toBe('Close the trial anyway?')
    expect(message).toContain('The 28 day cube result is not in yet, due 25 Nov 2026.')
    buttons.find((b) => b.text === 'Close trial')!.onPress!()
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({ outcome: 'met', remarks: '', confirm: true })
    expect(await screen.findByText('Trial closed. WEST202611471902-03, met expectation.')).toBeTruthy()
  })

  it('asks "Close this trial?" when nothing is pending', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockClear()
    serve(makeTrial(), (path) => (path === '/trials/t-1/close/' ? closed() : undefined))
    await open(5)
    await fireEvent.press(await screen.findByRole('radio', { name: 'Below expectation' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Close trial' }))
    await waitFor(() => expect(alert).toHaveBeenCalled())
    const [title, message] = alert.mock.calls[0] as [string, string]
    expect(title).toBe('Close this trial?')
    expect(message).toContain('Close Palava Phase 4 towers, trial WEST202611471902-03, as below expectation?')
  })

  it('lets an Admin or Sales Admin change the conclusion of a closed trial (T-14)', async () => {
    const bodies: Record<string, unknown>[] = []
    const shut = makeTrial({ status: 'closed', outcome: 'below', outcome_label: 'Below expectation', remarks: 'Low 7 day',
      actions: { edit: false, start: false, close: false, edit_cubes: true, delete: false, attach: true, change_conclusion: true } })
    serve(shut, (path, opts) => {
      if (path !== '/trials/t-1/conclusion/') return undefined
      bodies.push(opts!.body!)
      return { ...shut, outcome: 'met', outcome_label: 'Met expectation', remarks: '28 day met' }
    })
    await open(5)
    await fireEvent.press(await screen.findByRole('button', { name: 'Change conclusion' }))
    await fireEvent.press(screen.getByRole('radio', { name: 'Met expectation' }))
    await fireEvent.changeText(screen.getByLabelText('Remarks'), '28 day met')
    await fireEvent.press(screen.getByRole('button', { name: 'Save conclusion' }))
    await waitFor(() => expect(bodies).toEqual([{ outcome: 'met', remarks: '28 day met' }]))
    expect(await screen.findByText('Conclusion changed to met expectation.')).toBeTruthy()
  })

  it('keeps the Sales Person signatory from the project and read only (T-62)', async () => {
    serve(makeTrial({ status: 'draft', code: null, actions: { edit: true, start: true, close: false, edit_cubes: true, delete: false, attach: true } }))
    await open(5)
    const sales = await screen.findByLabelText('Thermax Sales Person, name')
    expect(sales.props.value).toBe('Amit Kulkarni')
    expect(sales.props.editable).toBe(false)
    expect(screen.getByLabelText('Site QC in charge, name').props.editable).toBe(true)
  })
})

describe('deleting', () => {
  it('lets an Admin delete a trial of any status after confirming (T-15)', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockClear()
    let deleted = false
    serve(makeTrial({ actions: { edit: false, start: false, close: true, edit_cubes: true, delete: true, attach: true } }), (path, opts) => {
      if (path === '/trials/t-1/' && opts?.method === 'DELETE') { deleted = true; return null }
      return undefined
    })
    await open(4)
    await fireEvent.press(await screen.findByRole('button', { name: 'Delete trial' }))
    const [title, , buttons] = alert.mock.calls[0] as [string, string, { text: string; onPress?: () => void }[]]
    expect(title).toBe('Delete trial WEST202611471902-03?')
    expect(deleted).toBe(false)
    await act(async () => { buttons.find((b) => b.text === 'Delete trial')!.onPress!() })
    await waitFor(() => expect(deleted).toBe(true))
  })

  it('offers no delete to others', async () => {
    serve(makeTrial())
    await open(4)
    await screen.findByText('7 day test, 4 Nov')
    expect(screen.queryByRole('button', { name: 'Delete trial' })).toBeNull()
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
    const alert = jest.spyOn(Alert, 'alert').mockClear()
    let closes = 0
    let finish: (t: Trial) => void = () => undefined
    serve(makeTrial(), (path) => {
      if (path !== '/trials/t-1/close/') return undefined
      closes += 1
      return new Promise<Trial>((resolve) => { finish = resolve })
    })
    await open(5)
    await fireEvent.press(await screen.findByRole('radio', { name: 'Met expectation' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Close trial' }))
    await waitFor(() => expect(alert).toHaveBeenCalled())
    const confirm = (alert.mock.calls[0][2] as { text: string; onPress?: () => void }[]).find((b) => b.text === 'Close trial')!
    confirm.onPress!()
    confirm.onPress!()
    await waitFor(() => expect(closes).toBe(1))
    finish(makeTrial({ status: 'closed', outcome: 'met', outcome_label: 'Met expectation', actions: { edit: false, start: false, close: false, edit_cubes: false, delete: false, attach: false } }))
    expect(await screen.findByText('Trial closed. WEST202611471902-03, met expectation.')).toBeTruthy()
    expect(closes).toBe(1)
  })

  it('reloads the trial when a save is refused because it was closed meanwhile', async () => {
    const { ApiError } = jest.requireMock('@/api/client')
    let gets = 0
    serve(makeTrial({ status: 'draft', code: null }), (path, opts) => {
      if (path === '/trials/t-1/' && !opts?.method) { gets += 1; return undefined }
      if (path === '/trials/t-1/' && opts?.method === 'PATCH') {
        throw new ApiError(409, 'not_allowed', 'Closed trials are read only. Cube results can still be added by a Sales Admin.')
      }
      return undefined
    })
    await open(3)
    await fireEvent.changeText(await screen.findByLabelText('Site temperature, degrees Celsius'), '32')
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Closed trials are read only. Cube results can still be added by a Sales Admin.')).toBeTruthy()
    await waitFor(() => expect(gets).toBeGreaterThan(1))
  })
})

describe('server errors on inputs (audit round 2)', () => {
  const draftActions = { edit: true, start: true, close: false, edit_cubes: true, delete: false, attach: true }

  it('puts a nested server error on its material row and says where it is', async () => {
    const { ApiError } = jest.requireMock('@/api/client')
    serve(makeTrial({ status: 'draft', code: null, actions: { ...draftActions, start: false } }), (path, opts) => {
      if (path === '/trials/t-1/' && opts?.method === 'PATCH') {
        throw new ApiError(400, 'invalid', 'Some fields need attention.', { materials: { cement: { ssd: ['Enter 100000 kg/m³ or less.'] } } })
      }
      return undefined
    })
    await open(2)
    await fireEvent.press(await screen.findByRole('button', { name: /^Cement, adjusted/ }))
    await fireEvent.changeText(screen.getByLabelText('Cement SSD design, kilograms per cubic metre'), '450')
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }))
    // The summary names the material and value; the row itself carries the message, even when folded.
    expect(await screen.findByText('Cement SSD design: Enter 100000 kg/m³ or less.')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Cement, adjusted .*\. Enter 100000 kg\/m³ or less\.$/ })).toBeTruthy()
    expect(screen.getByText('Not saved. Fix the highlighted fields and save again.')).toBeTruthy()
  })

  it('marks what a refused Start lists on its input, and drops each item once a save fills it in', async () => {
    const { ApiError } = jest.requireMock('@/api/client')
    const completeness = [
      { field: 'site_temp', message: 'Site temperature is required.' },
      { field: 'signatory_rd', message: 'For Thermax R&D is required.' },
    ]
    const draft = makeTrial({ status: 'draft', code: null, actions: draftActions, completeness } as Partial<Trial>)
    serve(draft, (path, opts) => {
      if (path === '/trials/t-1/start/') throw new ApiError(400, 'invalid', 'Some fields need attention.', Object.fromEntries(completeness.map((c) => [c.field, [c.message]])))
      if (path === '/trials/t-1/' && opts?.method === 'PATCH') return { ...draft, site_temp: '30', completeness: completeness.slice(1) }
      return undefined
    })
    await open(3)
    await fireEvent.press(await screen.findByRole('button', { name: 'Start trial' }))
    expect(await screen.findByRole('link', { name: 'Fresh concrete: Site temperature is required.' })).toBeTruthy()
    // The field itself says it too.
    expect(screen.getByText('Site temperature is required.')).toBeTruthy()
    await fireEvent.changeText(screen.getByLabelText('Site temperature, degrees Celsius'), '30')
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Fresh concrete: Site temperature is required.' })).toBeNull())
    expect(screen.getByRole('link', { name: 'Conclusion: For Thermax R&D is required.' })).toBeTruthy()
    expect(screen.queryByText('Site temperature is required.')).toBeNull()
  })

  it('keeps an item the phone did not know about until Start is tried again', async () => {
    const { ApiError } = jest.requireMock('@/api/client')
    const draft = makeTrial({ status: 'draft', code: null, actions: draftActions, completeness: [] } as Partial<Trial>)
    serve(draft, (path) => {
      if (path === '/trials/t-1/start/') throw new ApiError(400, 'invalid', 'Some fields need attention.', { bleeding: ['Bleeding is required.'], site_temp: ['Site temperature is required.'] })
      return undefined
    })
    await open(3)
    await fireEvent.press(await screen.findByRole('button', { name: 'Start trial' }))
    expect(await screen.findByRole('link', { name: 'Fresh concrete: Bleeding is required.' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Fresh concrete: Site temperature is required.' })).toBeTruthy()
  })

  it('offers the decimal keypad for the fresh wet density (one decimal allowed)', async () => {
    serve(makeTrial({ status: 'draft', code: null, actions: { ...draftActions, start: false } }))
    await open(3)
    expect((await screen.findByLabelText('Fresh wet density, kilograms per cubic metre')).props.keyboardType).toBe('decimal-pad')
  })
})


describe('step 1 rules (UAT, 12 Nov 2026)', () => {
  const draft = (over: Partial<Trial> = {}) => makeTrial({
    status: 'draft', code: null, actions: { edit: true, start: true, close: false, edit_cubes: true, delete: false, attach: true }, ...over,
  })
  const coarse = (w: string) => ['20', '10', '4.75', '2.36', '1.18', '0.6', '0.3', '0.15', 'pan'].map((sieve, i) => ({ sieve, retained: i === 1 ? w : '0' }))

  it('shows 0.00 in every weight and proportion, and live figures from the first weight', async () => {
    serve(draft())
    await open(1)
    const pan = await screen.findByLabelText('Weight retained on Pan, kilograms')
    expect(pan.props.value).toBe('0.00')
    expect(screen.getByLabelText('Crushed sand proportion, percent').props.value).toBe('0.00')
    await fireEvent.changeText(screen.getByLabelText('Weight retained on 20 mm, kilograms'), '10')
    await fireEvent.changeText(screen.getByLabelText('Weight retained on 10 mm, kilograms'), '30')
    expect(screen.getAllByText('75.00').length).toBeGreaterThan(0) // passing on 20 mm, before any other weight is in
  })

  it('holds Next until 20 mm, 10 mm, a sand and 100% proportions are in, saying what is missing', async () => {
    serve(draft({ sieves: { '20mm': coarse('5'), '10mm': coarse('4') } as unknown as Trial['sieves'], proportions: {} }))
    await open(1)
    mockSetParams.mockClear()
    await fireEvent.press(await screen.findByLabelText(/^Step 2, Mix design/))
    expect(await screen.findByText(
      'Fill in river sand or crushed sand to move ahead: at least one needs a total above 0.00 kg. All in grading proportions must total 100%. They total 0.00%.')).toBeTruthy()
    expect(mockSetParams).not.toHaveBeenCalledWith(expect.objectContaining({ step: '2' }))
  })

  it('sends a later step back to step 1 while step 1 is incomplete', async () => {
    serve(draft())
    await open(3)
    await waitFor(() => expect(mockSetParams).toHaveBeenCalledWith({ step: '1', why: 'sieves' }))
  })

  it('moves ahead once step 1 is complete', async () => {
    serve(draft(STEP1))
    await open(1)
    mockSetParams.mockClear()
    await fireEvent.press(await screen.findByLabelText(/^Step 2, Mix design/))
    await waitFor(() => expect(mockSetParams).toHaveBeenCalledWith({ step: '2', why: '' }))
  })

  it('does not hold a read only trial', async () => {
    serve(makeTrial({ status: 'closed', actions: { edit: false, start: false, close: false, edit_cubes: false, delete: false, attach: false } }))
    await open(3)
    expect(mockSetParams).not.toHaveBeenCalledWith({ step: '1', why: 'sieves' })
  })
})

describe('mineral admixtures (UAT, 12 Nov 2026)', () => {
  const MINERAL_LIST = ['CRYSTALLINE', 'FLYASH', 'GGBS', 'METAKOALIN'].map((value, i) => ({ id: 70 + i, value }))
  const lookups = (path: string, opts?: { query?: { category?: string } }) =>
    path === '/lookups/' && opts?.query?.category === 'mineral_admixture' ? MINERAL_LIST : undefined
  const draft = (over: Partial<Trial> = {}) => makeTrial({
    ...STEP1, status: 'draft', code: null, materials: { cement: { ssd: '300' }, water: { ssd: '160' } },
    actions: { edit: true, start: true, close: false, edit_cubes: true, delete: false, attach: true }, ...over,
  })
  const rowLabels = () => screen.getAllByRole('button').map((b) => String(b.props.accessibilityLabel ?? ''))
    .filter((l) => /, adjusted /.test(l)).map((l) => l.split(',')[0])

  it('starts the materials at cement and adds a chosen mineral admixture above it, removable', async () => {
    const t = draft()
    serve(t, (path, opts) => lookups(path, opts as never) ?? (opts?.method === 'PATCH' ? { ...t, updated_at: new Date().toISOString() } : undefined))
    await open(2)
    await waitFor(() => expect(rowLabels()[0]).toBe('Cement'))
    await fireEvent.press(await screen.findByRole('button', { name: 'Mineral admixture: not chosen' }))
    await fireEvent.press(await screen.findByText('METAKOALIN'))
    await waitFor(() => expect(rowLabels().slice(0, 2)).toEqual(['METAKOALIN', 'Cement']))
    // The new row opens: enter its SSD, then remove it.
    await fireEvent.changeText(screen.getByLabelText('METAKOALIN SSD design, kilograms per cubic metre'), '20')
    await fireEvent.press(screen.getByRole('button', { name: 'Remove METAKOALIN' }))
    await waitFor(() => expect(rowLabels()[0]).toBe('Cement'))
    // Added again, saved with its master name.
    await fireEvent.press(screen.getByRole('button', { name: 'Mineral admixture: not chosen' }))
    await fireEvent.press(await screen.findByText('FLYASH'))
    await waitFor(() => expect(rowLabels().slice(0, 2)).toEqual(['Fly ash', 'Cement']))
    await fireEvent.changeText(screen.getByLabelText('Fly ash SSD design, kilograms per cubic metre'), '80')
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/trials/t-1/', expect.objectContaining({ method: 'PATCH' })))
    const body = mockApi.mock.calls.find((c) => c[1]?.method === 'PATCH')![1].body
    expect(body.materials.fly_ash).toEqual({ ssd: '80', name: 'FLYASH' })
    expect(body.materials).not.toHaveProperty('mineral:metakoalin')
  })
})

describe('photos and videos per reading time (UAT, 12 Nov 2026)', () => {
  const started = { edit: false, start: false, close: true, edit_cubes: true, delete: false, attach: true }
  const file = (id: number, reading: string, name = `IMG_${id}.jpg`, over: Record<string, unknown> = {}) => ({
    id, original_name: name, size: 300_000, content_type: 'image/jpeg', reading, uploaded_by: 'Sneha Rao', created_at: '2026-11-04T06:00:00Z',
    kind: name.endsWith('.mp4') ? 'video' : 'image', has_thumbnail: true, processing: '', original_size: 4_000_000, ...over,
  })
  beforeEach(() => { mockQueueFiles.mockClear(); mockCamera.mockReset(); mockLibrary.mockReset() })

  it('shows a camera button with the count on each reading time and takes a photo for that time', async () => {
    serve(makeTrial({ actions: started, attachments: [file(1, '30'), file(2, '30', 'slump.mp4', { processing: 'pending' })] as Trial['attachments'] }))
    mockCamera.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///p.jpg', fileName: 'p.jpg', mimeType: 'image/jpeg', fileSize: 2_000_000, type: 'image' }] })
    await open(3)
    expect(await screen.findByLabelText('30 min photos and videos, 2')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('60 min photos and videos, none'))
    expect(await screen.findByText('Nothing for 60 min yet.')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Take photo' }))
    await waitFor(() => expect(mockQueueFiles).toHaveBeenCalledWith('t-1', [expect.objectContaining({ uri: 'file:///p.jpg', name: 'p.jpg', type: 'image/jpeg' })], '60'))
    expect(mockCamera).toHaveBeenCalledWith({ mediaTypes: ['images'], quality: 0.7 })
  })

  it('records videos up to a minute at 720p and refuses a longer one from the library', async () => {
    serve(makeTrial({ actions: started }))
    mockCamera.mockResolvedValue({ canceled: true, assets: null })
    mockLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///v.mov', fileName: 'v.mov', mimeType: 'video/quicktime', fileSize: 40_000_000, duration: 95_000, type: 'video' }] })
    await open(3)
    await fireEvent.press(await screen.findByLabelText('Initial photos and videos, none'))
    await fireEvent.press(await screen.findByRole('button', { name: 'Record video, up to 60 s' }))
    await waitFor(() => expect(mockCamera).toHaveBeenCalledWith({ mediaTypes: ['videos'], videoMaxDuration: 60, videoQuality: 7 }))
    await fireEvent.press(screen.getByRole('button', { name: 'Choose from library' }))
    expect(await screen.findByText(/v\.mov.*1 min/)).toBeTruthy()
    expect(mockQueueFiles).not.toHaveBeenCalled()
    expect(mockLibrary).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, selectionLimit: 5 }))
  })

  it('takes no more than five on a reading time', async () => {
    serve(makeTrial({ actions: started, attachments: [1, 2, 3, 4, 5].map((i) => file(i, '90')) as Trial['attachments'] }))
    await open(3)
    await fireEvent.press(await screen.findByLabelText('90 min photos and videos, 5'))
    expect(await screen.findByText(/90 min has 5 photos or videos, the most a reading time takes/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Take photo' })).toBeNull()
  })

  it('removes a photo on a draft after confirming', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockClear()
    const draft = makeTrial({ status: 'draft', code: null, actions: { edit: true, start: false, close: false, edit_cubes: true, delete: false, attach: true }, attachments: [file(7, '0')] as Trial['attachments'] })
    serve(draft, (path, opts) => (opts?.method === 'DELETE' ? {} : path === '/auth/me/' ? {} : undefined))
    await open(3)
    await fireEvent.press(await screen.findByLabelText('Initial photos and videos, 1'))
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove IMG_7.jpg' }))
    const buttons = alert.mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[]
    await act(async () => { buttons.find((b) => b.text === 'Remove')!.onPress!() })
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/trials/t-1/attachments/7/', { method: 'DELETE' }))
  })
})
