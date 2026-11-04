// Trial changes from the screens: straight to the server when online, kept
// on the phone (and shown) when not, and replayed later with the same ids.
import { QueryClient } from '@tanstack/react-query'

import type { Trial } from '@/shared/types'

import { resetConnectivity, setNetwork } from './connectivity'
import { bindQueryClient, outbox } from './outbox'
import { trialView } from './overlay'
import { fileKeeper, offlineStorage } from './storage'
import { CLOSE_OFFLINE, CLOSE_WAITING, createTrial, queueFiles, readyToClose, saveCubes, saveTrialPatch, startTrial } from './trialActions'

const mockApi = jest.fn()
jest.mock('@/api/client', () => ({
  api: (...a: unknown[]) => mockApi(...a),
  UPLOAD_TIMEOUT_MS: 300_000,
}))
jest.mock('./storage', () => {
  const { memoryStorage } = jest.requireActual('./storage')
  const store = memoryStorage()
  return {
    memoryStorage,
    offlineStorage: () => store,
    fileKeeper: {
      keep: jest.fn(async (_uri: string, clientId: string, name: string) => `${clientId}.${name.split('.').pop()}`),
      // Where the app's folder is now (it moves when iOS updates the app).
      uriOf: (stored: string) => `file:///now/cca-offline/files/${stored.slice(stored.lastIndexOf('/') + 1)}`,
      drop: jest.fn(async () => undefined),
    },
  }
})
let mockUuid = 0
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockUuid}` }))
jest.mock('expo-file-system', () => ({ File: class { get exists() { return true } } }))

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields: Record<string, string[]> = {}) { super(message) }
}

const project = { id: 'p1', project_name: 'Palava towers', customer_name: 'Konkan' }
const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
bindQueryClient(qc)

/** Signed in as user 7 with an empty queue. */
async function freshQueue() {
  outbox.setUser(7)
  await outbox.load()
  for (const op of [...outbox.getSnapshot()]) await outbox.discard(op.id)
}

beforeEach(async () => {
  mockApi.mockReset()
  qc.clear()
  resetConnectivity()
  await freshQueue()
})

const goOffline = () => setNetwork({ isConnected: false, isInternetReachable: false })

describe('online', () => {
  it('saves straight to the server and queues nothing', async () => {
    mockApi.mockResolvedValueOnce({ id: 't1', remarks: 'ok' })
    const r = await saveTrialPatch(qc, 't1', { remarks: 'ok' }, 'Conclusion')
    expect(r).toEqual({ trial: { id: 't1', remarks: 'ok' }, queued: false })
    expect(mockApi).toHaveBeenCalledWith('/trials/t1/', { method: 'PATCH', body: { remarks: 'ok' } })
    expect(outbox.getSnapshot()).toEqual([])
  })

  it('passes a server refusal to the form, not the queue', async () => {
    mockApi.mockRejectedValueOnce(new ApiError(400, 'invalid', 'Some fields need attention.', { dosage_1: ['Enter the dosage from 0 to 10.'] }))
    await expect(saveTrialPatch(qc, 't1', { dosage_1: '22' })).rejects.toMatchObject({ status: 400 })
    expect(outbox.getSnapshot()).toEqual([])
  })

  it('keeps the change on the phone when the request cannot reach the server', async () => {
    const server = trialView(undefined, [{ kind: 'create_trial', trialId: 't1', project: 'p1', projectName: 'P', customerName: 'C', id: 'x', userId: 7, createdAt: '', state: 'pending', attempts: 0 }])!
    qc.setQueryData(['trial', 't1'], server)
    mockApi.mockRejectedValue(new ApiError(0, 'timeout', 'Too slow.'))
    const r = await saveCubes(qc, 't1', '7d', { cubes: [{ weight: '8.4', load: '700' }] })
    expect(r.queued).toBe(true)
    expect(r.trial.cube_sets[0]).toMatchObject({ age: '7d', cubes: [{ weight: '8.4', load: '700' }] })
    expect(outbox.getSnapshot()).toMatchObject([{ kind: 'put_cubes', trialId: 't1', age: '7d' }])
  })

  it('creates a trial with an id made on the phone', async () => {
    mockApi.mockImplementation(async (_path: string, opts: { body: { id: string } }) => ({ id: opts.body.id, project: 'p1', status: 'draft' }))
    const r = await createTrial(qc, project)
    expect(mockApi).toHaveBeenCalledWith('/trials/', { body: { id: r.trial.id, project: 'p1' } })
    expect(r.queued).toBe(false)
    expect(qc.getQueryData(['trial', r.trial.id])).toMatchObject({ id: r.trial.id })
  })
})

describe('offline', () => {
  it('creates a draft trial, edits, starts and records cubes on the phone, then replays them in order with the same ids', async () => {
    goOffline()
    const { trial, queued } = await createTrial(qc, project)
    expect(queued).toBe(true)
    expect(trial).toMatchObject({ project: 'p1', project_name: 'Palava towers', status: 'draft' })
    await saveTrialPatch(qc, trial.id, { cast_at: '2026-11-04T10:00:00+05:30', batch_size: '0.04' }, 'Mix design')
    const started = await startTrial(qc, { ...trial, cast_at: '2026-11-04T10:00:00+05:30' })
    expect(started.trial.status).toBe('in_progress')
    await saveCubes(qc, trial.id, '1d', { cubes: [{ weight: '8.4', load: '280' }] })
    expect(mockApi).not.toHaveBeenCalled()
    expect(outbox.getSnapshot().map((o) => o.kind)).toEqual(['create_trial', 'patch_trial', 'start_trial', 'put_cubes'])

    mockApi.mockImplementation(async (path: string) => ({ id: trial.id, project: 'p1', path, attachments: [] }))
    resetConnectivity()
    await outbox.flush()
    expect(mockApi.mock.calls.map(([path, opts]) => `${opts?.method ?? 'POST'} ${path}`)).toEqual([
      'POST /trials/', `PATCH /trials/${trial.id}/`, `POST /trials/${trial.id}/start/`, `PUT /trials/${trial.id}/cubes/1d/`,
    ])
    expect(mockApi.mock.calls[0][1]).toEqual({ body: { id: trial.id, project: 'p1' } })
    expect(outbox.getSnapshot()).toEqual([])
    expect(qc.getQueryData<Trial & { path: string }>(['trial', trial.id])?.path).toBe(`/trials/${trial.id}/cubes/1d/`)
  })

  it('will not queue a start without the trial date (the server would refuse it)', async () => {
    goOffline()
    const { trial } = await createTrial(qc, project)
    await expect(startTrial(qc, trial)).rejects.toMatchObject({ fields: { cast_at: [expect.stringContaining('trial date')] } })
  })

  it('keeps photos in the app and uploads them with a client_id when back online', async () => {
    goOffline()
    const problems = await queueFiles('t9', [{ uri: 'file:///cache/ImagePicker/x.jpg', name: 'Photo_1.jpg', type: 'image/jpeg', size: 1200 }])
    expect(problems).toEqual([])
    const [op] = outbox.getSnapshot()
    // Only the kept file's name is stored: the app's folder path changes when iOS updates the app.
    expect(op).toMatchObject({ kind: 'upload_attachment', name: 'Photo_1.jpg', uri: `${(op as { clientId: string }).clientId}.jpg` })
    resetConnectivity()
    mockApi.mockResolvedValueOnce({ id: 31, client_id: (op as { clientId: string }).clientId, original_name: 'Photo_1.jpg' })
    qc.setQueryData(['trial', 't9'], { id: 't9', attachments: [] })
    const append = jest.spyOn(FormData.prototype, 'append')
    await outbox.flush()
    // The file is read from where the app's folder is now, worked out at send time.
    expect(append).toHaveBeenCalledWith('file', expect.objectContaining({ uri: `file:///now/cca-offline/files/${(op as { clientId: string }).clientId}.jpg` }))
    append.mockRestore()
    const [path, opts] = mockApi.mock.calls[0]
    expect(path).toBe('/trials/t9/attachments/')
    expect((opts.form as FormData).get('client_id')).toBe((op as { clientId: string }).clientId)
    expect(qc.getQueryData<Trial>(['trial', 't9'])?.attachments).toMatchObject([{ id: 31 }])
  })

  it('queues behind earlier changes even once online, so a trial\'s changes keep their order', async () => {
    goOffline()
    await saveTrialPatch(qc, 't1', { remarks: 'a' })
    resetConnectivity()
    mockApi.mockResolvedValue({ id: 't1' })
    const second = await saveTrialPatch(qc, 't1', { batch_size: '0.05' })
    expect(second.queued).toBe(true)
    await outbox.flush()
    // One merged PATCH, sent by the replay, never a direct PATCH that could overtake the first.
    expect(mockApi.mock.calls).toEqual([['/trials/t1/', { method: 'PATCH', body: { remarks: 'a', batch_size: '0.05' } }]])
  })
})

describe('saving twice', () => {
  it('a save that timed out never replays its older value over a later save of the same trial', async () => {
    let timeOutFirst!: () => void
    mockApi.mockImplementationOnce(() => new Promise((_, reject) => { timeOutFirst = () => reject(new ApiError(0, 'timeout', 'Too slow.')) }))
    mockApi.mockResolvedValue({ id: 't1' })
    const first = saveTrialPatch(qc, 't1', { remarks: 'old' })
    const second = saveTrialPatch(qc, 't1', { remarks: 'new' })
    await new Promise((r) => setTimeout(r, 0))
    timeOutFirst()
    await first
    await second // waited for the first (now queued and replayed), so it lands after it
    await outbox.flush()
    const bodies = mockApi.mock.calls.map(([, opts]) => opts.body.remarks)
    expect(bodies[0]).toBe('old')
    expect(bodies[bodies.length - 1]).toBe('new')
    expect(outbox.getSnapshot()).toEqual([])
  })

  it('keeps a save on the phone when a Wi-Fi sign in page answers instead of the server', async () => {
    mockApi.mockRejectedValueOnce(new ApiError(200, 'bad_response', 'Something went wrong on the server.'))
    goOffline() // no replay right away
    resetConnectivity()
    mockApi.mockRejectedValue(new ApiError(0, 'offline', 'No connection.'))
    const r = await saveTrialPatch(qc, 't1', { remarks: 'x' })
    expect(r.queued).toBe(true)
    expect(outbox.getSnapshot()).toMatchObject([{ kind: 'patch_trial', body: { remarks: 'x' } }])
  })

  it('removes a kept photo and leaves nothing queued when the queue cannot be stored', async () => {
    const store = offlineStorage()
    const write = store.write
    store.write = async () => { throw new Error('ENOSPC') }
    try {
      const problems = await queueFiles('t9', [{ uri: 'file:///cache/x.jpg', name: 'x.jpg', type: 'image/jpeg', size: 1 }])
      expect(problems).toEqual(['x.jpg: it could not be saved on this phone. Try again.'])
    } finally {
      store.write = write
    }
    expect(outbox.getSnapshot()).toEqual([])
    expect(fileKeeper.drop).toHaveBeenCalledWith(expect.stringMatching(/\.jpg$/))
  })
})

describe('closing', () => {
  it('needs a connection', async () => {
    goOffline()
    expect(await readyToClose('t1')).toBe(CLOSE_OFFLINE)
  })

  it('syncs the trial\'s changes first, and waits if they do not go through', async () => {
    goOffline()
    await saveTrialPatch(qc, 't1', { remarks: 'a' })
    resetConnectivity()
    mockApi.mockRejectedValueOnce(new ApiError(409, 'closed', 'This trial is closed.'))
    expect(await readyToClose('t1')).toBe(CLOSE_WAITING)
    await outbox.discard(outbox.getSnapshot()[0].id)
    expect(await readyToClose('t1')).toBeNull()
  })
})
