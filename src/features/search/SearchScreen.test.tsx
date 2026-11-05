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

describe('sieve analysis criterion (client decision 5 Nov 2026: as the web)', () => {
  const ok = { criteria: {}, products: 0, trials: 0, results: [] }
  const renderScreen = async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    await render(<QueryClientProvider client={qc}><SearchScreen /></QueryClientProvider>)
    await fireEvent.press(screen.getByRole('button', { name: 'Edit criteria' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Add sieve analysis' }))
    return qc
  }
  beforeEach(() => mockApi.mockReset())

  it('computes the all in grading on decimal keypads and searches with it', async () => {
    mockApi.mockImplementation(async (path: string) => {
      if (path === '/search/') return ok
      throw new Error(`unexpected ${path}`)
    })
    const qc = await renderScreen()
    expect(screen.getByLabelText('20 mm proportion, %').props.keyboardType).toBe('decimal-pad')
    expect(screen.getByLabelText('Crushed sand passing 150 µm, %').props.keyboardType).toBe('decimal-pad')
    await fireEvent.changeText(screen.getByLabelText('20 mm proportion, %'), '40')
    await fireEvent.changeText(screen.getByLabelText('Crushed sand proportion, %'), '60')
    await fireEvent.changeText(screen.getByLabelText('20 mm passing 20 mm, %'), '95')
    await fireEvent.changeText(screen.getByLabelText('Crushed sand passing 20 mm, %'), '100')
    await fireEvent.changeText(screen.getByLabelText('Crushed sand passing 600 µm, %'), '45.5')
    expect(screen.getByLabelText('All in passing 20 mm, 98.00%')).toBeTruthy()
    expect(screen.getByLabelText('All in passing 600 µm, 27.30%')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Search products' }))
    expect(await screen.findByText('No past trials match all of these criteria')).toBeTruthy()
    expect(mockApi).toHaveBeenCalledWith('/search/', {
      method: 'POST',
      body: { grading: { 20: '98.00', 10: '0.00', 4.75: '0.00', 2.36: '0.00', 1.18: '0.00', 0.6: '27.30', 0.3: '0.00', 0.15: '0.00' } },
    })
    expect(screen.getByText('All in grading, exact')).toBeTruthy()
    qc.clear()
  })

  it('refuses a combined grading over 100% before asking the server and marks the sieve', async () => {
    const qc = await renderScreen()
    await fireEvent.changeText(screen.getByLabelText('20 mm proportion, %'), '70')
    await fireEvent.changeText(screen.getByLabelText('Crushed sand proportion, %'), '60')
    await fireEvent.changeText(screen.getByLabelText('20 mm passing 20 mm, %'), '100')
    await fireEvent.changeText(screen.getByLabelText('Crushed sand passing 20 mm, %'), '100')
    await fireEvent.press(screen.getByRole('button', { name: 'Search products' }))
    expect(screen.getByText(/The combined passing on the 20 mm sieve is 130.00%, over 100%/)).toBeTruthy()
    expect(screen.getByLabelText('All in passing 20 mm, 130.00%, needs attention')).toBeTruthy()
    expect(mockApi).not.toHaveBeenCalledWith('/search/', expect.anything())
    // Fixing the entry clears the message.
    await fireEvent.changeText(screen.getByLabelText('20 mm proportion, %'), '40')
    expect(screen.queryByText(/over 100%/)).toBeNull()
    qc.clear()
  })

  it('marks a cell above 100 and keeps the search from running', async () => {
    const qc = await renderScreen()
    await fireEvent.changeText(screen.getByLabelText('10 mm passing 4.75 mm, %'), '120')
    await fireEvent.press(screen.getByRole('button', { name: 'Search products' }))
    expect(screen.getByText('Enter the 10 mm passing the 4.75 mm sieve as a percent from 0 to 100.')).toBeTruthy()
    expect(screen.getByText('1 criterion needs attention.')).toBeTruthy()
    expect(mockApi).not.toHaveBeenCalledWith('/search/', expect.anything())
    qc.clear()
  })

  it('lays a refused grading (400) on the sieve it is about', async () => {
    mockApi.mockImplementation(async (path: string) => {
      if (path === '/search/') {
        throw Object.assign(new Error('Some fields need attention.'), {
          status: 400, code: 'invalid', fields: { grading: ['Enter the percent passing the 4.75 mm sieve from 0 to 100.'] },
        })
      }
      throw new Error(`unexpected ${path}`)
    })
    const qc = await renderScreen()
    await fireEvent.changeText(screen.getByLabelText('River sand proportion, %'), '100')
    await fireEvent.changeText(screen.getByLabelText('River sand passing 4.75 mm, %'), '99')
    await fireEvent.press(screen.getByRole('button', { name: 'Search products' }))
    expect(await screen.findByText('Enter the percent passing the 4.75 mm sieve from 0 to 100.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Fix criteria' }))
    // The sheet opens on the sieve analysis with the server message and the 4.75 mm All in value marked.
    expect(screen.getByLabelText('All in passing 4.75 mm, 99.00%, needs attention')).toBeTruthy()
    expect(screen.getAllByText('Enter the percent passing the 4.75 mm sieve from 0 to 100.').length).toBeGreaterThan(1)
    expect(screen.getByRole('button', { name: 'Hide sieve analysis' })).toBeTruthy()
    qc.clear()
  })

  it('shows a server failure with Try again', async () => {
    mockApi.mockImplementation(async (path: string) => {
      if (path === '/search/') throw Object.assign(new Error('boom'), { status: 500, code: 'server_error', fields: {} })
      throw new Error(`unexpected ${path}`)
    })
    const qc = await renderScreen()
    await fireEvent.changeText(screen.getByLabelText('River sand proportion, %'), '100')
    await fireEvent.changeText(screen.getByLabelText('River sand passing 4.75 mm, %'), '99')
    await fireEvent.press(screen.getByRole('button', { name: 'Search products' }))
    expect(await screen.findByText('Something went wrong on the server. Try again.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Fix criteria' })).toBeNull()
    qc.clear()
  })
})
