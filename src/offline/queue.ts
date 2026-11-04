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
 *   when replayed. The same holds when the app is killed after the server
 *   applied a change but before the queue was saved without it: it is sent
 *   again on the next replay.
 * - Failures: no connection, 5xx or 429 stop the replay and keep the change
 *   waiting (5xx gives up after a few tries, in case the server always
 *   refuses it). A timeout keeps the change waiting and skips only that
 *   trial for the rest of the replay, so one slow upload does not hold up
 *   the other trials. An answer that is not from the API (a hotel or site
 *   Wi-Fi sign in page, a proxy) counts as no connection. Any other refusal
 *   (400, 403, 404, 409, 413) marks the change as a sync problem with the
 *   server's message; later changes to the same trial wait behind it until
 *   the person retries or discards it. A new edit of the same step merges
 *   into the refused change and puts it back in line, so the person can fix
 *   it instead of discarding it.
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
  /** uri: the kept file's name in the app's files folder (see fileKeeper); older entries hold a full path, of which only the name is used. */
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
  /** After the server accepted a change: store its answer, refresh lists. Awaited
   * before the change leaves the saved queue, so the answer is saved first. */
  onSent?: (op: Op, result: unknown) => void | Promise<void>
  /** After a change left the queue (sent or discarded): clean up its file. */
  onRemoved?: (op: Op, how: 'sent' | 'discarded') => void
  uuid: () => string
  now?: () => Date
}

const DOC = 'queue.json'
/** Server errors (5xx) are retried this many times before the change becomes a sync problem. */
export const MAX_SERVER_ATTEMPTS = 5

type Verdict = 'sent' | 'retry' | 'session' | 'fail'

/** Codes the API client gives answers that did not come from the API (no API
 * error body, or a body that is not JSON): a captive portal or a proxy. */
const NOT_API = ['unexpected_response', 'bad_response']

/** The request did not reach the API, or its answer did not come back: safe to send again later. */
export function unreachable(e: unknown) {
  return isApiError(e) && (e.status === 0 || NOT_API.includes(e.code))
}

const timedOut = (e: unknown) => isApiError(e) && e.status === 0 && e.code === 'timeout'

export function classify(e: unknown, attempts: number): Exclude<Verdict, 'sent'> {
  if (e instanceof PermanentError) return 'fail'
  if (!isApiError(e)) return 'fail'
  if (unreachable(e)) return 'retry'
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
  /** Bumped on every change to the queue, so a failed save only undoes its own change. */
  private version = 0
  loaded = false

  constructor(private deps: Deps) {}

  private loading: Promise<void> | null = null

  /** Read the saved queue (once). Everything that changes the queue waits for
   * this first, so a change made at launch never overwrites the saved queue.
   * When the file cannot be read right now, this rejects and the queue stays
   * unloaded (nothing is written over it); the next call tries again. */
  load(): Promise<void> {
    this.loading ??= this.read().catch((e: unknown) => { this.loading = null; throw e })
    return this.loading
  }

  /** A document, or entries, that cannot be understood are set aside, never silently lost. */
  private async read() {
    const text = await this.deps.storage.read(DOC)
    let ops: Op[] = []
    if (text) {
      let all: unknown[] | null = null
      try {
        const doc = JSON.parse(text) as { v?: number; ops?: unknown }
        all = Array.isArray(doc.ops) ? doc.ops : []
      } catch {
        await this.deps.storage.write(`queue.unreadable.${Date.now()}.json`, text)
      }
      if (all) {
        ops = all.filter(isOp)
        const unknown = all.filter((o) => !isOp(o))
        if (unknown.length) await this.deps.storage.write(`queue.unreadable.${Date.now()}.json`, JSON.stringify({ v: 1, ops: unknown }))
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

  /** Add a change. Consecutive edits of the same trial step merge into one waiting change.
   * An edit merged into a refused change puts it back in line with the corrected content.
   * If the queue cannot be saved, the change is taken back out and the call rejects. */
  async enqueue(input: OpInput): Promise<Op> {
    if (this.userId === null) throw new Error('No signed in user for the change queue')
    await this.load()
    const mine = this.ops.filter((o) => o.trialId === input.trialId && o.userId === this.userId)
    const last = mine[mine.length - 1]
    const mergeable = last && last.id !== this.sendingId
    const merge = mergeable && ((input.kind === 'patch_trial' && last.kind === 'patch_trial')
      || (input.kind === 'put_cubes' && last.kind === 'put_cubes' && last.age === input.age))
    if (merge) {
      const before = { ...last }
      if (input.kind === 'patch_trial' && last.kind === 'patch_trial') {
        last.body = { ...last.body, ...input.body }
        last.what = input.what ?? last.what
      } else if (input.kind === 'put_cubes' && last.kind === 'put_cubes') {
        last.body = input.body
      }
      if (last.state === 'failed') {
        last.state = 'pending'
        last.attempts = 0
        delete last.error
      }
      await this.saveOrUndo(() => { Object.assign(last, before); if (!before.error) delete last.error })
      return last
    }
    const op = {
      ...input, id: this.deps.uuid(), userId: this.userId, createdAt: (this.deps.now?.() ?? new Date()).toISOString(),
      state: 'pending', attempts: 0,
    } as Op
    this.ops.push(op)
    await this.saveOrUndo(() => { this.ops = this.ops.filter((o) => o !== op) })
    return op
  }

  /** Save after a change. On failure, take the change back (unless something
   * changed the queue since, which then carries it) and save that state. */
  private async saveOrUndo(undo: () => void) {
    const saving = this.changed()
    const mine = this.version
    try {
      await saving
    } catch (e) {
      if (this.version === mine) {
        undo()
        await this.quietly(this.changed())
      }
      throw e
    }
  }

  /** Send waiting changes in order. Only one replay runs at a time. */
  flush(): Promise<FlushResult> {
    this.flushing ??= this.run().finally(() => { this.flushing = null })
    return this.flushing
  }

  get busy() { return this.flushing !== null }

  /** The oldest change of the first trial that can go, skipping trials that timed out in this replay. */
  private next(skip: Set<string>): Op | undefined {
    const seen = new Set<string>()
    for (const op of this.ops) {
      if (op.userId !== this.userId) continue
      if (seen.has(op.trialId)) continue
      seen.add(op.trialId)
      if (op.state === 'pending' && !skip.has(op.trialId)) return op
    }
    return undefined
  }

  private async run(): Promise<FlushResult> {
    const out: FlushResult = { sent: 0, failed: 0, stopped: null }
    try { await this.load() } catch { return out } // the saved queue cannot be read yet: send nothing
    if (this.userId === null) return out
    const slow = new Set<string>()
    for (let op = this.next(slow); op; op = this.next(slow)) {
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
      if (verdict === 'sent' && this.ops.includes(op)) {
        // The server's answer is stored (and saved) before the change leaves the overlay and the
        // saved queue, so screens never flash empty and a restart never shows the older values.
        try { await this.deps.onSent?.(op, result) } catch { /* a cache update must not stop the replay */ }
      }
      this.sendingId = null
      if (!this.ops.includes(op)) { this.changed(false); continue } // discarded while sending
      if (verdict === 'sent') {
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
      if (verdict === 'retry' && timedOut(error)) {
        // Slow, not refused: keep it waiting, leave this trial for now and carry on with the others.
        slow.add(op.trialId)
        continue
      }
      out.stopped = verdict === 'session' ? 'session' : unreachable(error) ? 'offline' : 'server'
      break
    }
    if (!out.stopped && slow.size) out.stopped = 'offline'
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
    if (persist) this.version += 1
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
