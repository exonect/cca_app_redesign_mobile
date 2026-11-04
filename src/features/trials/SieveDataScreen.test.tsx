// The project's sieve data without a trial (legacy "Add sieve data", T-07),
// and the legacy completeness rules worked out on the phone (T-30).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import type { SieveData, Trial } from '@/shared/types'

import { localCompleteness } from './forms'
import { SieveDataScreen } from './SieveDataScreen'

const mockApi = jest.fn()
jest.mock('@/api/client', () => ({
  ApiError: class extends Error {},
  api: (...a: unknown[]) => mockApi(...a),
  fieldErrors: () => ({}),
  session: {},
}))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'p-1' }),
  usePreventRemove: jest.fn(),
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn(), push: jest.fn() },
}))

const data: SieveData = {
  project: 'p-1', sieves: {}, proportions: {}, source: 'WEST202611471902-02',
  results: { sieves: {}, grading: [], errors: [] }, updated_at: null, updated_by: null, can_edit: true,
}

function serve(d: SieveData, onPut?: (body: unknown) => SieveData) {
  mockApi.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (path === '/trials/sieve-data/p-1/' && opts?.method === 'PUT') return onPut!(opts.body)
    if (path === '/trials/sieve-data/p-1/') return d
    if (path === '/projects/p-1/') return { id: 'p-1', project_name: 'Palava towers' }
    if (path === '/grading-limits/') return []
    throw new Error(`Unexpected ${path}`)
  })
}

async function open() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
  await render(<QueryClientProvider client={qc}><SieveDataScreen /></QueryClientProvider>)
}

beforeEach(() => { mockApi.mockReset() })

describe('sieve data', () => {
  it('saves the project sieve analysis that new trials start from', async () => {
    const bodies: unknown[] = []
    serve(data, (body) => { bodies.push(body); return { ...data, updated_at: '2026-11-04T06:00:00Z', updated_by: 'Sneha Rao' } })
    await open()
    expect(await screen.findByText(/This is the sieve analysis last saved with trial WEST202611471902-02\./)).toBeTruthy()
    await fireEvent.changeText(screen.getByLabelText('Weight retained on 10 mm, kilograms'), '3.6')
    await fireEvent.press(screen.getByRole('button', { name: 'Save sieve data' }))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({ sieves: { '20mm': expect.arrayContaining([{ sieve: '10', retained: '3.6' }]) }, proportions: {} })
    expect(await screen.findByText('Sieve data saved. New trials of this project start from it.')).toBeTruthy()
  })

  it('is read only for someone who does not run trials on the project', async () => {
    serve({ ...data, can_edit: false })
    await open()
    expect((await screen.findByLabelText('Weight retained on 10 mm, kilograms')).props.editable).toBe(false)
    expect(screen.queryByRole('button', { name: 'Save sieve data' })).toBeNull()
  })
})

describe('completeness on the phone (same rules as the server)', () => {
  const base = {
    sieves: {}, proportions: {}, cast_at: null, batch_size: null, admixture_1: null, dosage_1: null, grade_of_concrete: null,
    materials: {}, fresh_readings: {}, scc: {}, site_temp: null, fresh_density: null, bleeding: null,
    signatory_rd: '', signatory_site_qc: '', signatory_sales: '', signature_rd: '', signature_site_qc: '', signature_sales: '',
  } as unknown as Trial

  it('lists everything the legacy Create Trial form required', () => {
    expect(localCompleteness(base).map((n) => n.field)).toEqual([
      'sieves', 'proportions', 'cast_at', 'batch_size', 'admixture_1', 'dosage_1', 'grade_of_concrete',
      'materials.cement.source', 'materials.cement.cement_type', 'materials.cement.ssd', 'materials.water.ssd',
      'materials.20mm.source', 'materials.river_sand.source', 'fresh_readings', 'site_temp', 'fresh_density', 'bleeding',
      'signatory_rd', 'signatory_site_qc', 'signatory_sales',
    ])
  })

  it('needs equal 10 and 20 mm sources, sources on filled rows and a reading on an added SCC test', () => {
    const t = {
      ...base,
      materials: { '20mm': { ssd: '546', source: 'Quarry A' }, '10mm': { ssd: '300', source: 'Quarry B' }, fly_ash: { ssd: '80' }, crushed_sand: { source: 'M sand' } },
      scc: { v_funnel: { 0: null } }, signature_rd: 'data:image/png;base64,AAA',
    } as unknown as Trial
    const notes = Object.fromEntries(localCompleteness(t).map((n) => [n.field, n.message]))
    expect(notes['materials.20mm.source']).toBe('20 mm and 10 mm sources are not equal.')
    expect(notes['materials.fly_ash.source']).toBe('Fly ash: mineral admixture source is required.')
    expect(notes['materials.crushed_sand.ssd']).toBe('Crushed sand: SSD design should be more than zero.')
    expect(notes['scc.v_funnel']).toBe('V funnel: at least one reading is required.')
    expect(notes.signatory_rd).toBeUndefined() // a drawn signature counts
  })
})
