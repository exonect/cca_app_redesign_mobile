// Offline states in the interface: the bar, the per trial chip and the sync
// problems list with Retry and Discard.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'

import { SyncScreen } from '@/features/sync/SyncScreen'

import { resetConnectivity, setNetwork } from './connectivity'
import { outbox } from './outbox'
import { barText, OfflineBar, SyncChip } from './ui'

const mockApi = jest.fn()
jest.mock('@/api/client', () => ({ api: (...a: unknown[]) => mockApi(...a), UPLOAD_TIMEOUT_MS: 1 }))
jest.mock('./storage', () => {
  const { memoryStorage } = jest.requireActual('./storage')
  const store = memoryStorage()
  return { memoryStorage, offlineStorage: () => store, fileKeeper: { keep: jest.fn(), drop: jest.fn() } }
})
let mockUuid = 0
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockUuid}` }))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
const mockPush = jest.fn()
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), canGoBack: () => true, replace: jest.fn() } }))

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields: Record<string, string[]> = {}) { super(message) }
}

const wrap = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
  qc.setQueryData(['trial', 't1'], { id: 't1', code: 'WEST-0042', project_name: 'Palava' })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(async () => {
  mockApi.mockReset()
  mockPush.mockReset()
  resetConnectivity()
  outbox.setUser(7)
  await outbox.load()
  for (const op of [...outbox.getSnapshot()]) await outbox.discard(op.id)
})

describe('bar text', () => {
  it('covers offline, problems, waiting and all synced', () => {
    expect(barText(false, 0, 0, false)?.text).toBe('Offline. Changes you make are saved on this phone.')
    expect(barText(false, 3, 0, false)?.text).toBe('Offline. 3 changes waiting to sync.')
    expect(barText(true, 3, 1, false)?.text).toBe('1 change could not sync. Tap to review.')
    expect(barText(true, 1, 0, true)?.text).toBe('Syncing. 1 change waiting to sync.')
    expect(barText(true, 0, 0, false)).toBeNull()
  })
})

describe('offline bar', () => {
  it('says offline with the number of changes waiting, and opens the sync list', async () => {
    await act(async () => { setNetwork({ isConnected: false }) })
    await outbox.enqueue({ kind: 'patch_trial', trialId: 't1', body: { remarks: 'a' } })
    await outbox.enqueue({ kind: 'start_trial', trialId: 't1' })
    await wrap(<OfflineBar />)
    const bar = await screen.findByText('Offline. 2 changes waiting to sync.')
    await fireEvent.press(bar)
    expect(mockPush).toHaveBeenCalledWith('/sync')
  })

  it('shows nothing when online with nothing waiting', async () => {
    await wrap(<OfflineBar />)
    expect(screen.toJSON()).toBeNull()
  })

  it('marks a trial with changes on the phone', async () => {
    await act(async () => { setNetwork({ isConnected: false }) })
    await wrap(<SyncChip trialId="t1" />)
    expect(screen.queryByText('Not synced yet')).toBeNull()
    await act(async () => { await outbox.enqueue({ kind: 'patch_trial', trialId: 't1', body: { remarks: 'a' } }) })
    expect(await screen.findByText('Not synced yet')).toBeTruthy()
  })
})

describe('sync list', () => {
  async function refused() {
    mockApi.mockRejectedValueOnce(new ApiError(400, 'invalid', 'Some fields need attention.', { dosage_1: ['Enter the dosage from 0 to 10.'] }))
    await outbox.enqueue({ kind: 'patch_trial', trialId: 't1', body: { dosage_1: '22' }, what: 'Mix design' })
    await outbox.flush()
  }

  it('lists a refused change with the server message, and retries it', async () => {
    await refused()
    await wrap(<SyncScreen />)
    expect(await screen.findByText('Mix design changes')).toBeTruthy()
    expect(screen.getByText('WEST-0042')).toBeTruthy()
    expect(screen.getByText('Enter the dosage from 0 to 10.')).toBeTruthy()
    mockApi.mockResolvedValueOnce({ id: 't1' })
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Everything is synced')).toBeTruthy()
  })

  it('discards a refused change after confirming', async () => {
    const alert = jest.spyOn(Alert, 'alert')
    await refused()
    await wrap(<SyncScreen />)
    await fireEvent.press(await screen.findByRole('button', { name: 'Discard' }))
    const [title, , buttons] = alert.mock.calls[0] as [string, string, { text: string; onPress?: () => void }[]]
    expect(title).toBe('Discard this change?')
    await act(async () => { buttons.find((b) => b.text === 'Discard')!.onPress!() })
    expect(await screen.findByText('Everything is synced')).toBeTruthy()
    expect(outbox.getSnapshot()).toEqual([])
  })

  it('lists changes waiting while offline, with Sync now off', async () => {
    await act(async () => { setNetwork({ isConnected: false }) })
    await outbox.enqueue({ kind: 'create_trial', trialId: 'n1', project: 'p1', projectName: 'Palava', customerName: 'Konkan' })
    await outbox.enqueue({ kind: 'put_cubes', trialId: 'n1', age: '28d', body: { cubes: [] } })
    await wrap(<SyncScreen />)
    expect(await screen.findByText('New trial for Palava')).toBeTruthy()
    expect(screen.getByText('28 days cube results')).toBeTruthy()
    expect(screen.getAllByText('Draft trial, Palava')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Sync now, needs a connection' })).toBeDisabled()
  })
})
