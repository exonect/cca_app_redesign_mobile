// The change queue: order, durability across restarts, replay with the ids
// made on the phone, and what each kind of failure does.
import { classify, MAX_SERVER_ATTEMPTS, Outbox, PermanentError, type Op } from './queue'
import { memoryStorage } from './storage'

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields: Record<string, string[]> = {}) { super(message) }
}
const offline = () => new ApiError(0, 'offline', 'No connection.')

function setup(send: (op: Op) => Promise<unknown> = async () => ({ ok: true }), storage = memoryStorage()) {
  let n = 0
  const sent: Op[] = []
  const removed: [string, string][] = []
  const box = new Outbox({
    storage,
    send: async (op) => { sent.push(JSON.parse(JSON.stringify(op))); return send(op) },
    onRemoved: (op, how) => removed.push([op.id, how]),
    uuid: () => `q${++n}`,
    now: () => new Date('2026-11-04T06:00:00Z'),
  })
  box.setUser(7)
  return { box, sent, removed, storage }
}

const create = (trialId = 't1') => ({ kind: 'create_trial' as const, trialId, project: 'p1', projectName: 'Palava', customerName: 'Konkan' })
const patch = (trialId: string, body: Record<string, unknown>, what?: string) => ({ kind: 'patch_trial' as const, trialId, body, what })

describe('order', () => {
  it('replays changes in the order they were made, across trials', async () => {
    const { box, sent } = setup()
    await box.enqueue(create('t1'))
    await box.enqueue(patch('t2', { remarks: 'a' }))
    await box.enqueue({ kind: 'start_trial', trialId: 't1' })
    await box.enqueue({ kind: 'put_cubes', trialId: 't2', age: '7d', body: { cubes: [{ weight: '8.1', load: '400' }] } })
    const r = await box.flush()
    expect(r).toEqual({ sent: 4, failed: 0, stopped: null })
    expect(sent.map((o) => `${o.kind}:${o.trialId}`)).toEqual(['create_trial:t1', 'patch_trial:t2', 'start_trial:t1', 'put_cubes:t2'])
    expect(box.getSnapshot()).toEqual([])
  })

  it('merges back to back edits of a trial into one change, later fields winning', async () => {
    const { box } = setup()
    await box.enqueue(patch('t1', { batch_size: '0.04', dosage_1: '0.8' }, 'Mix design'))
    await box.enqueue(patch('t1', { dosage_1: '0.9' }, 'Mix design'))
    await box.enqueue({ kind: 'put_cubes', trialId: 't1', age: '7d', body: { cubes: [] } })
    await box.enqueue({ kind: 'put_cubes', trialId: 't1', age: '7d', body: { cubes: [{ weight: '8', load: '1' }] } })
    await box.enqueue(patch('t1', { remarks: 'x' }))
    const ops = box.getSnapshot()
    expect(ops).toHaveLength(3)
    expect(ops[0]).toMatchObject({ kind: 'patch_trial', body: { batch_size: '0.04', dosage_1: '0.9' } })
    expect(ops[1]).toMatchObject({ kind: 'put_cubes', body: { cubes: [{ weight: '8', load: '1' }] } })
  })

  it('does not merge into a change that is being sent', async () => {
    let release!: () => void
    const { box, sent } = setup((op) => (op.kind === 'patch_trial' && !release ? new Promise((r) => { release = () => r({}) }) : Promise.resolve({})))
    await box.enqueue(patch('t1', { remarks: 'first' }))
    const flushing = box.flush()
    await Promise.resolve()
    await box.enqueue(patch('t1', { remarks: 'second' }))
    expect(box.getSnapshot()).toHaveLength(2)
    release()
    await flushing
    expect(sent.map((o) => (o as Extract<Op, { kind: 'patch_trial' }>).body.remarks)).toEqual(['first', 'second'])
  })

  it('runs one replay at a time', async () => {
    const { box, sent } = setup()
    await box.enqueue(patch('t1', { remarks: 'a' }))
    await Promise.all([box.flush(), box.flush(), box.flush()])
    expect(sent).toHaveLength(1)
  })
})

describe('durability', () => {
  it('keeps waiting changes across a restart and replays them', async () => {
    const storage = memoryStorage()
    const first = setup(async () => { throw offline() }, storage)
    await first.box.enqueue(create('t1'))
    await first.box.enqueue(patch('t1', { remarks: 'on site' }))
    await first.box.flush()

    // App killed; a new start reads the same document.
    const second = setup(undefined, storage)
    second.box.setUser(null)
    await second.box.load()
    second.box.setUser(7)
    expect(second.box.getSnapshot().map((o) => o.kind)).toEqual(['create_trial', 'patch_trial'])
    await second.box.flush()
    expect(second.sent.map((o) => o.kind)).toEqual(['create_trial', 'patch_trial'])
    expect(JSON.parse(storage.docs['queue.json']).ops).toEqual([])
  })

  it('resends a change whose answer was lost, with the same trial id and client_id', async () => {
    const storage = memoryStorage()
    let calls = 0
    const { box, sent } = setup(async () => { calls += 1; if (calls <= 2) throw new ApiError(0, 'timeout', 'Too slow.'); return {} }, storage)
    await box.enqueue(create('a1b2'))
    await box.enqueue({ kind: 'upload_attachment', trialId: 'a1b2', clientId: 'c-9', name: 'cube.jpg', type: 'image/jpeg', size: 10, uri: 'file:///doc/c-9.jpg' })
    await box.flush() // timeout: may or may not have arrived
    await box.flush() // again
    await box.flush() // arrives
    const creates = sent.filter((o) => o.kind === 'create_trial')
    expect(creates.length).toBe(3)
    expect(new Set(creates.map((o) => o.trialId))).toEqual(new Set(['a1b2']))
    const upload = sent.find((o) => o.kind === 'upload_attachment') as Extract<Op, { kind: 'upload_attachment' }>
    expect(upload.clientId).toBe('c-9')
    expect(box.getSnapshot()).toEqual([])
  })

  it('sets an unreadable queue document aside instead of losing it', async () => {
    const storage = memoryStorage({ 'queue.json': '{not json' })
    const { box } = setup(undefined, storage)
    await box.load()
    expect(box.getSnapshot()).toEqual([])
    expect(Object.keys(storage.docs).some((k) => k.startsWith('queue.unreadable.'))).toBe(true)
  })

  it('keeps changes queued before the saved queue was read, after it', async () => {
    const storage = memoryStorage({ 'queue.json': JSON.stringify({ v: 1, ops: [{ id: 'old', kind: 'start_trial', trialId: 't1', userId: 7, createdAt: '', state: 'pending', attempts: 0 }] }) })
    const { box } = setup(undefined, storage)
    await box.enqueue(patch('t1', { remarks: 'new' }))
    await box.load()
    expect(box.getSnapshot().map((o) => o.id)).toEqual(['old', 'q1'])
  })

  it('reports a change it could not store on the phone', async () => {
    const storage = memoryStorage()
    storage.write = async () => { throw new Error('disk full') }
    const { box } = setup(undefined, storage)
    await expect(box.enqueue(patch('t1', { remarks: 'x' }))).rejects.toThrow('disk full')
  })
})

describe('failures', () => {
  it('stops on no connection and keeps the change waiting', async () => {
    const { box } = setup(async () => { throw offline() })
    await box.enqueue(patch('t1', { remarks: 'x' }))
    await box.enqueue(patch('t2', { remarks: 'y' }))
    const r = await box.flush()
    expect(r.stopped).toBe('offline')
    expect(box.getSnapshot().map((o) => [o.state, o.attempts])).toEqual([['pending', 1], ['pending', 0]])
  })

  it('makes a refused change a sync problem with the server message, holds that trial and carries on with others', async () => {
    const { box, sent } = setup(async (op) => {
      if (op.kind === 'patch_trial' && op.trialId === 't1') throw new ApiError(400, 'invalid', 'Some fields need attention.', { dosage_1: ['Enter the dosage from 0 to 10.'] })
      return {}
    })
    await box.enqueue(patch('t1', { dosage_1: '22' }, 'Mix design'))
    await box.enqueue({ kind: 'start_trial', trialId: 't1' })
    await box.enqueue(patch('t2', { remarks: 'fine' }))
    const r = await box.flush()
    expect(r).toEqual({ sent: 1, failed: 1, stopped: null })
    expect(sent.map((o) => `${o.kind}:${o.trialId}`)).toEqual(['patch_trial:t1', 'patch_trial:t2'])
    const [problem, held] = box.getSnapshot()
    expect(problem).toMatchObject({ state: 'failed', error: { status: 400, message: 'Enter the dosage from 0 to 10.', fields: { dosage_1: 'Enter the dosage from 0 to 10.' } } })
    expect(held).toMatchObject({ kind: 'start_trial', state: 'pending' })
  })

  it('retries a sync problem when asked', async () => {
    let refuse = true
    const { box } = setup(async () => { if (refuse) throw new ApiError(409, 'closed', 'This trial is closed.'); return {} })
    const op = await box.enqueue(patch('t1', { remarks: 'x' }))
    await box.flush()
    expect(box.getSnapshot()[0].state).toBe('failed')
    refuse = false
    expect(await box.retry(op.id)).toBe(true)
    await box.flush()
    expect(box.getSnapshot()).toEqual([])
  })

  it('discarding a new trial discards every change made to it, and cleans up files', async () => {
    const { box, removed } = setup(async (op) => { if (op.kind === 'create_trial') throw new ApiError(403, 'forbidden', 'You no longer work on this project.'); return {} })
    const c = await box.enqueue(create('t1'))
    await box.enqueue({ kind: 'upload_attachment', trialId: 't1', clientId: 'c1', name: 'a.jpg', type: 'image/jpeg', size: 1, uri: 'file:///a' })
    await box.enqueue(patch('t2', { remarks: 'kept' }))
    await box.flush()
    const gone = await box.discard(c.id)
    expect(gone.map((o) => o.kind)).toEqual(['create_trial', 'upload_attachment'])
    expect(removed.filter(([, how]) => how === 'discarded')).toHaveLength(2)
    expect(box.getSnapshot()).toEqual([])
  })

  it('stops when the session has ended, keeping everything', async () => {
    const { box } = setup(async () => { throw new ApiError(401, 'session_expired', 'Your session ended.') })
    await box.enqueue(patch('t1', { remarks: 'x' }))
    expect((await box.flush()).stopped).toBe('session')
    expect(box.getSnapshot()[0].state).toBe('pending')
  })

  it('retries server errors a few times, then reports them', async () => {
    const { box } = setup(async () => { throw new ApiError(502, 'server_error', 'Something went wrong on the server.') })
    await box.enqueue(patch('t1', { remarks: 'x' }))
    for (let i = 1; i < MAX_SERVER_ATTEMPTS; i++) expect((await box.flush()).stopped).toBe('server')
    expect((await box.flush()).failed).toBe(1)
    expect(box.getSnapshot()[0].state).toBe('failed')
  })

  it('classifies errors', () => {
    expect(classify(offline(), 1)).toBe('retry')
    expect(classify(new ApiError(0, 'timeout', 't'), 9)).toBe('retry')
    expect(classify(new ApiError(429, 'throttled', 't'), 1)).toBe('retry')
    expect(classify(new ApiError(404, 'not_found', 'gone'), 1)).toBe('fail')
    expect(classify(new ApiError(401, 'session_expired', 'x'), 1)).toBe('session')
    expect(classify(new PermanentError('file gone'), 1)).toBe('fail')
    expect(classify(new TypeError('bug'), 1)).toBe('fail')
  })
})

describe('per user', () => {
  it('shows and sends only the signed in person\'s changes', async () => {
    const storage = memoryStorage()
    const { box, sent } = setup(undefined, storage)
    await box.enqueue(patch('t1', { remarks: 'mine' }))
    box.setUser(8)
    expect(box.getSnapshot()).toEqual([])
    await box.flush()
    expect(sent).toEqual([])
    box.setUser(7)
    expect(box.getSnapshot()).toHaveLength(1)
  })

  it('needs a signed in person to queue anything', async () => {
    const { box } = setup()
    box.setUser(null)
    await expect(box.enqueue(patch('t1', {}))).rejects.toThrow()
  })
})
