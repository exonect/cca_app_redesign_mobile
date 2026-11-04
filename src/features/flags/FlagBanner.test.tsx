// Flagged data: everyone sees the banner; Admin and Sales Admin can Accept
// or Correct, and a value the server refuses shows its message on the field.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import type { RecordFlag } from '@/shared/typesExt'

import { FlagBanner } from './FlagBanner'

const mockApi = jest.fn()
let mockRoles: string[] = ['SAD']
jest.mock('@/api/client', () => ({
  api: (...a: unknown[]) => mockApi(...a),
  fieldErrors: (e: { fields?: Record<string, string[]> }) => Object.fromEntries(Object.entries(e?.fields ?? {}).map(([k, v]) => [k, v[0]])),
}))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ hasRole: (...r: string[]) => r.some((x) => mockRoles.includes(x)) }) }))

const flags: RecordFlag[] = [{ id: 41, field: 'dosage_1', field_label: 'Dosage', value: '22', reason: 'Dosage 22% is outside the expected 0 to 10%.' }]
const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } })
const show = (f: RecordFlag[] | undefined = flags) => render(<QueryClientProvider client={qc}><FlagBanner flags={f} refresh={[['trial', 't1']]} what="trial" /></QueryClientProvider>)

beforeEach(() => { mockApi.mockReset(); mockRoles = ['SAD'] })

it('shows nothing without open flags', async () => {
  await show([])
  expect(screen.toJSON()).toBeNull()
})

it('is read only for other roles', async () => {
  mockRoles = ['CT']
  await show()
  expect(screen.getByText('1 value on this trial is flagged. An Admin or Sales Admin will check it.')).toBeTruthy()
  expect(screen.getByText('Dosage 22% is outside the expected 0 to 10%.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Accept/ })).toBeNull()
})

it('accepts a value as it is', async () => {
  const invalidate = jest.spyOn(qc, 'invalidateQueries')
  mockApi.mockResolvedValueOnce({ id: 41, status: 'accepted' })
  await show()
  await fireEvent.press(screen.getByRole('button', { name: 'Accept Dosage as 22' }))
  await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/data-flags/41/accept/', { method: 'POST', body: {} }))
  expect(await screen.findByText('Dosage kept as 22.')).toBeTruthy()
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trial', 't1'] })
})

it('corrects a value, showing the server\'s message when it breaks the rule', async () => {
  mockApi.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 400, code: 'invalid', message: 'x', fields: { value: ['Enter the dosage from 0 to 10.'] } }))
  mockApi.mockResolvedValueOnce({ id: 41, status: 'corrected' })
  await show()
  await fireEvent.press(screen.getByRole('button', { name: 'Correct Dosage' }))
  const input = await screen.findByLabelText('Dosage')
  await fireEvent.changeText(input, '12')
  await fireEvent.press(screen.getByRole('button', { name: 'Save value' }))
  expect(await screen.findByText('Enter the dosage from 0 to 10.')).toBeTruthy()
  await fireEvent.changeText(screen.getByLabelText('Dosage'), '2.2')
  await fireEvent.press(screen.getByRole('button', { name: 'Save value' }))
  await waitFor(() => expect(mockApi).toHaveBeenLastCalledWith('/data-flags/41/correct/', { method: 'POST', body: { value: '2.2' } }))
  expect(await screen.findByText('Dosage corrected to 2.2.')).toBeTruthy()
})

describe('a flag on a whole object', () => {
  const proportions: RecordFlag = {
    id: 52, field: 'proportions', field_label: 'Proportions', value: '20 mm 34, 10 mm 22, river sand 10, crushed sand 30', reason: 'Proportions total 96%, not 100%.',
    value_json: { '20mm': '34', '10mm': '22', river_sand: '10', crushed_sand: '30' },
    value_labels: { '20mm': '20 mm', '10mm': '10 mm', river_sand: 'River sand', crushed_sand: 'Crushed sand' },
  }

  it('edits one number per key with a live total and sends the same shape', async () => {
    mockApi.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 400, code: 'invalid', message: 'x', fields: { value: { river_sand: ['Enter a number.'] } } }))
    mockApi.mockResolvedValueOnce({ id: 52, status: 'corrected' })
    await show([proportions])
    await fireEvent.press(screen.getByRole('button', { name: 'Correct Proportions' }))
    expect(await screen.findByLabelText('Total 96.00 percent')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Save value' }))
    expect(await screen.findByText('Proportions must total 100%. They total 96.00%.')).toBeTruthy()
    expect(mockApi).not.toHaveBeenCalled()

    await fireEvent.changeText(screen.getByLabelText('River sand'), '14')
    expect(screen.getByLabelText('Total 100.00 percent')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Save value' }))
    expect(await screen.findByText('Enter a number.')).toBeTruthy() // the server's message on its row
    await fireEvent.press(screen.getByRole('button', { name: 'Save value' }))
    await waitFor(() => expect(mockApi).toHaveBeenLastCalledWith('/data-flags/52/correct/', {
      method: 'POST', body: { value: { '20mm': '34', '10mm': '22', river_sand: '14', crushed_sand: '30' } },
    }))
    expect(await screen.findByText('Proportions corrected.')).toBeTruthy()
  })

  it('never sends the J000 balance of a composition, and adds and removes cementitious contents', async () => {
    const helpers = jest.requireActual('./objectValue')
    const comp = { id: 1, field: 'components', field_label: 'Composition', value: '', reason: '', value_json: { J101: '50', J205: '40', J000: '10' }, value_labels: { J000: 'J000 (balance)' } }
    const rows = helpers.initialRows(comp, 'components')
    expect(rows.at(-1)).toMatchObject({ key: 'J000', balance: true })
    expect(helpers.payload('components', rows)).toEqual({ J101: '50', J205: '40' })
    expect(helpers.totals('components', rows)).toMatchObject({ total: '100.00', balance: '10.00' })

    mockApi.mockResolvedValueOnce({ id: 60, status: 'corrected' })
    await show([{ id: 60, field: 'cementitious_contents', field_label: 'Cementitious contents', value: '400, 4500', reason: 'Too high.', value_json: [400, 4500], value_labels: null }])
    await fireEvent.press(screen.getByRole('button', { name: 'Correct Cementitious contents' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove cementitious content 2' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Add content' }))
    await fireEvent.changeText(screen.getByLabelText('Cementitious content 2'), '450')
    await fireEvent.press(screen.getByRole('button', { name: 'Save value' }))
    await waitFor(() => expect(mockApi).toHaveBeenLastCalledWith('/data-flags/60/correct/', { method: 'POST', body: { value: ['400', '450'] } }))
  })

  it('reads nested server errors by path', () => {
    const { deepFieldErrors } = jest.requireActual('./objectValue')
    expect(deepFieldErrors({ fields: { value: { river_sand: ['Enter a number.'], '1': ['Too high.'] } } })).toEqual({ 'value.river_sand': 'Enter a number.', 'value.1': 'Too high.' })
    expect(deepFieldErrors({ fields: { value: ['Proportions must total 100%.'] } })).toEqual({ value: 'Proportions must total 100%.' })
  })
})
