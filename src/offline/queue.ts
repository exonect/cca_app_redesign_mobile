/**
 * The outbox: every trial change made while offline (or while earlier
 * changes to the same trial are still waiting) is stored here, in order, in
 * a JSON document in the app's document directory, and replayed against the
 * API when the server can be reached.
 *
 * Rules
 * - Order: changes replay in the order they were made. Per trial only the
 *   oldest waiting change may be sent, so a trial's changes never overtake
 *   each other; different trials do not wait for each other.
 * - Durable: the document is rewritten after every change to the queue
 *   (written to a temporary file and moved into place). A change that was
 *   being sent when the app died is simply sent again.
 * - Safe to resend: a new trial carries an id made on the phone, a file a
 *   client_id; start, PATCH and PUT cubes are idempotent on the server. So a
 *   change that reached the server but whose answer was lost does no harm
 *   when replayed.
 * - Failures: no connection, a timeout, 5xx or 429 stop the replay and keep
 *   the change waiting (5xx gives up after a few tries, in case the server
 *   always refuses it). Any other refusal (400, 403, 404, 409, 413) marks the
 *   change as a sync problem with the server's message; later changes to the
 *   same trial wait behind it until the person retries or discards it.
 *   An ended session stops the replay until the person signs in again.
 * - Per user: each change records who made it; only the signed in person's
 *   changes are shown or sent.
 */
import { errorMessage, fieldErrors, isApiError } from '@/api/errors'

import type { Storage } from './storage'

export type SyncError = { status: number; code: string; message: string; fields: Record<string, string> }

type OpBase = {
  /** Queue entry id. */
  id: string
  userId: number
  trialId: string
  createdAt: string
  /** pending: waiting to be sent; failed: the server refused it (a sync problem). */
  state: 'pending' | 'failed'
  attempts: number
  error?: SyncError
}

export type CubesBody = { cubes: { weight: string | null; load: string | null }[] }

export type OpInput =
  | { kind: 'create_trial'; trialId: string; project: string; projectName: string; customerName: string }
  | { kind: 'patch_trial'; trialId: string; body: Record<string, unknown>; what?: string }
  | { kind: 'put_cubes'; trialId: string; age: string; body: CubesBody }
  | { kind: 'start_trial'; trialId: string }
  | { kind: 'upload_attachment'; trialId: string; clientId: string; name: string; type: string; size: number | null; uri: string }

export type Op = OpBase & OpInput
export type OpKind = Op['kind']

/** A refusal that must not be retried automatically (a photo that is no longer on the phone, for example). */
export class PermanentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PermanentError'
  }
}

export type FlushResult = { sent: number; failed: number; stopped: null | 'offline' | 'session' | 'server' }

type Deps = {
  storage: Storage
  send: (op: Op) => Promise<unknown>
  /** After the server accepted a change: store its answer, refresh lists. */
  onSent?: (op: Op, result: unknown) => void
  /** After a change left the queue (sent or discarded): clean up its file. */
  onRemoved?: (op: Op, how: 'sent' | 'discarded') => void
  uuid: () => string
  now?: () => Date
}

const DOC = 'queue.json'
/** Server errors (5xx) are retried this many times before the change becomes a sync problem. */
export const MAX_SERVER_ATTEMPTS = 5

type Verdict = 'sent' | 'retry' | 'session' | 'fail'

export function classify(e: unknown, attempts: number): Exclude<Verdict, 'sent'> {
  if (e instanceof PermanentError) return 'fail'
  if (!isApiError(e)) return 'fail'
  if (e.status === 0) return 'retry'
  if (e.status === 401) return 'session'
  if (e.status >= 500 || e.status === 429 || e.status === 408) return attempts >= MAX_SERVER_ATTEMPTS ? 'fail' : 'retry'
  return 'fail'
}

export function toSyncError(e: unknown): SyncError {
  if (e instanceof PermanentError) return { status: 0, code: 'permanent', message: e.message, fields: {} }
  if (isApiError(e)) {
    return { status: e.status, code: e.code, message: errorMessage(e, 'The server refused this change.'), fields: fieldErrors(e) }
  }
  return { status: 0, code: 'error', message: 'This change could not be sent. Try again.', fields: {} }
}

export class Outbox {
  private ops: Op[] = []
  private userId: number | null = null
  private sendingId: string | null = null
  private flushing: Promise<FlushResult> | null = null
  private writing: Promise<void> = Promise.resolve()
  private listeners = new Set<() => void>()
  private snapshot: Op[] = []
  loaded = false

  constructor(private deps: Deps) {}

  private loading: Promise<void> | null = null

  /** Read the saved queue (once). Everything that changes the queue waits for
   * this first, so a change made at launch never overwrites the saved queue. */
  load(): Promise<void> {
    this.loading ??= this.read()
    return this.loading
  }

  /** A document that cannot be read is set aside, never silently lost. */
  private async read() {
    const text = await this.deps.storage.read(DOC).catch(() => null)
    let ops: Op[] = []
    if (text) {
      try {
        const doc = JSON.parse(text) as { v?: number; ops?: unknown }
        ops = Array.isArray(doc.ops) ? (doc.ops as Op[]).filter(isOp) : []
      } catch {
        await this.deps.storage.write(`queue.unreadable.${Date.now()}.json`, text)
      }
    }
    this.ops = ops
    this.loaded = true
    this.changed(false)
  }

  setUser(id: number | null) {
    if (this.userId === id) return
    this.userId = id
    this.changed(false)
  }

  get user() { return this.userId }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  /** The signed in person's changes, oldest first (same array until something changes). */
  getSnapshot = () => this.snapshot

  /** Id of the change being sent right now, if any. */
  get inFlight() { return this.sendingId }

  forTrial(trialId: string) {
    return this.snapshot.filter((o) => o.trialId === trialId)
  }

  hasWaiting(trialId: string) {
    return this.snapshot.some((o) => o.trialId === trialId)
  }

  /** Add a change. Consecutive edits of the same trial step merge into one waiting change. */
  async enqueue(input: OpInput): Promise<Op> {
    if (this.userId === null) throw new Error('No signed in user for the change queue')
    await this.load()
    const mine = this.ops.filter((o) => o.trialId === input.trialId && o.userId === this.userId)
    const last = mine[mine.length - 1]
    const mergeable = last && last.state === 'pending' && last.id !== this.sendingId
    if (mergeable && input.kind === 'patch_trial' && last.kind === 'patch_trial') {
      last.body = { ...last.body, ...input.body }
      last.what = input.what ?? last.what
      await this.changed()
      return last
    }
    if (mergeable && input.kind === 'put_cubes' && last.kind === 'put_cubes' && last.age === input.age) {
      last.body = input.body
      await this.changed()
      return last
    }
    const op = {
      ...input, id: this.deps.uuid(), userId: this.userId, createdAt: (this.deps.now?.() ?? new Date()).toISOString(),
      state: 'pending', attempts: 0,
    } as Op
    this.ops.push(op)
    await this.changed()
    return op
  }

  /** Send waiting changes in order. Only one replay runs at a time. */
  flush(): Promise<FlushResult> {
    this.flushing ??= this.run().finally(() => { this.flushing = null })
    return this.flushing
  }

  get busy() { return this.flushing !== null }

  private next(): Op | undefined {
    const seen = new Set<string>()
    for (const op of this.ops) {
      if (op.userId !== this.userId) continue
      if (seen.has(op.trialId)) continue
      seen.add(op.trialId)
      if (op.state === 'pending') return op
    }
    return undefined
  }

  private async run(): Promise<FlushResult> {
    const out: FlushResult = { sent: 0, failed: 0, stopped: null }
    await this.load().catch(() => undefined)
    if (this.userId === null) return out
    for (let op = this.next(); op; op = this.next()) {
      this.sendingId = op.id
      this.changed(false)
      let verdict: Verdict
      let result: unknown
      let error: unknown
      try {
        result = await this.deps.send(op)
        verdict = 'sent'
      } catch (e) {
        error = e
        verdict = classify(e, op.attempts + 1)
      }
      this.sendingId = null
      if (!this.ops.includes(op)) { this.changed(false); continue } // discarded while sending
      if (verdict === 'sent') {
        // The server's answer is stored before the change leaves the overlay, so screens never flash empty.
        try { this.deps.onSent?.(op, result) } catch { /* a cache update must not stop the replay */ }
        this.ops = this.ops.filter((o) => o !== op)
        await this.quietly(this.changed())
        out.sent += 1
        this.deps.onRemoved?.(op, 'sent')
        continue
      }
      op.attempts += 1
      if (verdict === 'fail') {
        op.state = 'failed'
        op.error = toSyncError(error)
        out.failed += 1
        await this.quietly(this.changed())
        continue
      }
      await this.quietly(this.changed())
      out.stopped = verdict === 'session' ? 'session' : isApiError(error) && error.status === 0 ? 'offline' : 'server'
      break
    }
    return out
  }

  /** Put a sync problem back in line (it goes out on the next replay). */
  async retry(id: string) {
    await this.load()
    const op = this.ops.find((o) => o.id === id && o.userId === this.userId)
    if (!op || op.state !== 'failed') return false
    op.state = 'pending'
    op.attempts = 0
    delete op.error
    await this.changed()
    return true
  }

  /** Drop a change. Dropping a new trial drops every change made to it. */
  async discard(id: string) {
    await this.load()
    const op = this.ops.find((o) => o.id === id && o.userId === this.userId)
    if (!op || op.id === this.sendingId) return []
    const gone = op.kind === 'create_trial'
      ? this.ops.filter((o) => o.trialId === op.trialId && o.userId === op.userId && o.id !== this.sendingId)
      : [op]
    this.ops = this.ops.filter((o) => !gone.includes(o))
    await this.changed()
    gone.forEach((o) => this.deps.onRemoved?.(o, 'discarded'))
    return gone
  }

  private changed(persist = true): Promise<void> {
    this.snapshot = this.userId === null ? [] : this.ops.filter((o) => o.userId === this.userId).map((o) => ({ ...o }))
    this.listeners.forEach((l) => l())
    if (!persist) return Promise.resolve()
    const text = JSON.stringify({ v: 1, ops: this.ops })
    // Writes go one after another so an older state never lands last. A
    // failed write (no space left) rejects for the caller; the chain goes on.
    const write = this.writing.then(() => this.deps.storage.write(DOC, text))
    this.writing = write.catch(() => undefined)
    return write
  }

  /** Inside a replay a failed write must not stop the replay; the next write saves the state again. */
  private quietly(p: Promise<void>) { return p.catch(() => undefined) }
}

const KINDS: OpKind[] = ['create_trial', 'patch_trial', 'put_cubes', 'start_trial', 'upload_attachment']
function isOp(x: unknown): x is Op {
  const o = x as Op
  return !!o && typeof o === 'object' && typeof o.id === 'string' && typeof o.trialId === 'string'
    && typeof o.userId === 'number' && KINDS.includes(o.kind) && (o.state === 'pending' || o.state === 'failed')
}
