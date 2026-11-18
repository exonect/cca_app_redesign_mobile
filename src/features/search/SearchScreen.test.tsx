// Legacy: an empty search lists every product; trials outside your projects are not named.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

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

describe('mineral admixtures criterion (UAT, 17 Nov 2026: master list dropdown, as the old app)', () => {
  beforeEach(() => mockApi.mockReset())

  it('picks several names from the master list and searches with them', async () => {
    mockApi.mockImplementation(async (path: string, opts?: { query?: { category?: string } }) => {
      if (path === '/lookups/' && opts?.query?.category === 'mineral_admixture') {
        return ['ALCOFINE', 'CRYSTALLINE', 'FLYASH', 'GGBS', 'METAKOALIN'].map((value, i) => ({ id: 20 + i, category: 'mineral_admixture', value }))
      }
      if (path === '/lookups/') return []
      if (path === '/search/') return { criteria: {}, products: 0, trials: 0, results: [] }
      throw new Error(`unexpected ${path}`)
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    await render(<QueryClientProvider client={qc}><SearchScreen /></QueryClientProvider>)
    await fireEvent.press(screen.getByRole('button', { name: 'Edit criteria' }))
    const field = await screen.findByRole('button', { name: /^Mineral admixtures: none chosen/ })
    await waitFor(() => expect(field.props.accessibilityState?.disabled).toBeFalsy())
    await fireEvent.press(field)
    expect(screen.getAllByRole('checkbox').map((c) => c.props.accessibilityLabel)).toEqual(['ALCOFINE', 'CRYSTALLINE', 'FLYASH', 'GGBS', 'METAKOALIN'])
    await fireEvent.changeText(screen.getByLabelText('Search Mineral admixtures'), 'meta')
    await fireEvent.press(screen.getByRole('checkbox', { name: 'METAKOALIN' }))
    await fireEvent.changeText(screen.getByLabelText('Search Mineral admixtures'), '')
    await fireEvent.press(screen.getByRole('checkbox', { name: 'GGBS' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Search products' }))
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/search/', { method: 'POST', body: { mineral_admixtures: ['METAKOALIN', 'GGBS'] } }))
    expect(await screen.findByText('METAKOALIN, GGBS')).toBeTruthy()
    qc.clear()
  })
})

describe('strength criterion (UAT, 18 Nov 2026: compressive strength master list dropdown, as the old app)', () => {
  beforeEach(() => mockApi.mockReset())

  it('offers only the numbers on the list, ascending, and searches with several', async () => {
    mockApi.mockImplementation(async (path: string, opts?: { query?: { category?: string } }) => {
      if (path === '/lookups/' && opts?.query?.category === 'compressive_strength') {
        return ['20', '10', '15', 'M30'].map((value, i) => ({ id: 40 + i, category: 'compressive_strength', value }))
      }
      if (path === '/lookups/') return []
      if (path === '/search/') return { criteria: {}, products: 0, trials: 0, results: [] }
      throw new Error(`unexpected ${path}`)
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    await render(<QueryClientProvider client={qc}><SearchScreen /></QueryClientProvider>)
    await fireEvent.press(screen.getByRole('button', { name: 'Edit criteria' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Strength age: not chosen' }))
    await fireEvent.press(screen.getByText('5 days'))
    const field = await screen.findByRole('button', { name: /^Strength: none chosen/ })
    await waitFor(() => expect(field.props.accessibilityState?.disabled).toBeFalsy())
    await fireEvent.press(field)
    expect(screen.getAllByRole('checkbox').map((c) => c.props.accessibilityLabel)).toEqual(['10 N/mm²', '15 N/mm²', '20 N/mm²'])
    await fireEvent.press(screen.getByRole('checkbox', { name: '10 N/mm²' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: '20 N/mm²' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('Matches average 5 days strength of 10 to 15 N/mm², or 20 to 25 N/mm².')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Search products' }))
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/search/', { method: 'POST', body: { strength_age: '5d', strength: ['10', '20'] } }))
    qc.clear()
  })
})

describe('slump criterion (UAT, 18 Nov 2026: Slump Flow master list dropdown, as the old app)', () => {
  beforeEach(() => mockApi.mockReset())

  it('offers only the numbers on the list, ascending, and searches with the one chosen', async () => {
    mockApi.mockImplementation(async (path: string, opts?: { query?: { category?: string } }) => {
      if (path === '/lookups/' && opts?.query?.category === 'slump_flow') {
        return ['180', '160', '70', 'Collapse'].map((value, i) => ({ id: 60 + i, category: 'slump_flow', value }))
      }
      if (path === '/lookups/') return []
      if (path === '/search/') return { criteria: {}, products: 0, trials: 0, results: [] }
      throw new Error(`unexpected ${path}`)
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    await render(<QueryClientProvider client={qc}><SearchScreen /></QueryClientProvider>)
    await fireEvent.press(screen.getByRole('button', { name: 'Edit criteria' }))
    const field = await screen.findByRole('button', { name: 'Slump, mm: not chosen' })
    await waitFor(() => expect(field.props.accessibilityState?.disabled).toBeFalsy())
    await fireEvent.press(field)
    expect(screen.queryByText('Collapse mm')).toBeNull()
    expect(screen.getByText('70 mm')).toBeTruthy()
    await fireEvent.press(screen.getByText('160 mm'))
    await fireEvent.press(screen.getByRole('button', { name: 'Retained at: not chosen' }))
    await fireEvent.press(screen.getByText('2 h'))
    expect(screen.getByText('Matches 140 to 180 mm at 2 h.')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Search products' }))
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/search/', { method: 'POST', body: { slump: '160', retention_minutes: 120 } }))
    qc.clear()
  })
})

describe('W/C criteria (UAT, 18 Nov 2026: the legacy search\'s W/C ratio SSD and W/C ratio corrected dropdowns)', () => {
  beforeEach(() => mockApi.mockReset())

  it('offers each master list, numbers only and ascending, and searches with both', async () => {
    mockApi.mockImplementation(async (path: string, opts?: { query?: { category?: string } }) => {
      const cat = opts?.query?.category
      if (path === '/lookups/' && (cat === 'wc_ratio_ssd' || cat === 'wc_ratio_corrected')) {
        return ['0.40', '0.38', '0.37', 'NA'].map((value, i) => ({ id: 80 + i, category: cat, value }))
      }
      if (path === '/lookups/') return []
      if (path === '/search/') return { criteria: {}, products: 0, trials: 0, results: [] }
      throw new Error(`unexpected ${path}`)
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    await render(<QueryClientProvider client={qc}><SearchScreen /></QueryClientProvider>)
    await fireEvent.press(screen.getByRole('button', { name: 'Edit criteria' }))
    const ssd = await screen.findByRole('button', { name: /^W\/C ratio, SSD: none chosen/ })
    await waitFor(() => expect(ssd.props.accessibilityState?.disabled).toBeFalsy())
    await fireEvent.press(ssd)
    expect(screen.getAllByRole('checkbox').map((c) => c.props.accessibilityLabel)).toEqual(['0.37', '0.38', '0.40'])
    await fireEvent.press(screen.getByRole('checkbox', { name: '0.38' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('Matches a free W/C (SSD) of 0.36 to 0.4.')).toBeTruthy()

    const corrected = screen.getByRole('button', { name: 'W/C ratio, corrected: Any W/C ratio' })
    await waitFor(() => expect(corrected.props.accessibilityState?.disabled).toBeFalsy())
    await fireEvent.press(corrected)
    expect(screen.queryByText('NA')).toBeNull()
    await fireEvent.press(screen.getByText('0.37'))
    expect(screen.getByText(/Matches a corrected W\/C of 0.35 to 0.39\. CCA trials only/)).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Search products' }))
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/search/', { method: 'POST', body: { wc: ['0.38'], wc_corrected: '0.37' } }))
    qc.clear()
  })
})
