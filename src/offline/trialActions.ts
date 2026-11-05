/**
 * Trial changes as the screens make them. Online, with nothing waiting for
 * the trial, a change goes straight to the server as before (so field
 * errors show on the form). Offline, when the request cannot reach the
 * server, or when earlier changes to the same trial are still waiting, it
 * joins the queue and the screen shows the trial with the change applied.
 */
import type { QueryClient } from '@tanstack/react-query'

import type { PickedFile } from '@/features/trials/attachments'
import { asFields, localCompleteness } from '@/features/trials/forms'
import type { Project, Trial } from '@/shared/types'

import { isOnline } from './connectivity'
import { kick, labelsFrom, newId, outbox, sendOp, storeResult } from './outbox'
import { trialView } from './overlay'
import { unreachable, type OpInput } from './queue'
import { fileKeeper } from './storage'

export type Saved = { trial: Trial; queued: boolean }

/** The trial as this phone shows it now. */
export function currentView(qc: QueryClient, trialId: string): Trial | undefined {
  return trialView(qc.getQueryData<Trial>(['trial', trialId]), outbox.forTrial(trialId), labelsFrom(qc))
}

/** The last change of each trial still being saved, so the next one waits for it. */
const saving = new Map<string, Promise<unknown>>()

/** A trial's changes go one after another: a direct save that times out (and
 * so joins the queue) must never land behind a later save of the same trial,
 * or the queue would replay the older value over the newer one. */
function sendOrQueue(qc: QueryClient, op: OpInput): Promise<Saved> {
  const run = (saving.get(op.trialId) ?? Promise.resolve()).catch(() => undefined).then(() => saveNow(qc, op))
  saving.set(op.trialId, run)
  const done = () => { if (saving.get(op.trialId) === run) saving.delete(op.trialId) }
  run.then(done, done)
  return run
}

/** The server's answer to a step edit on a trial that has started (legacy: only drafts are edited). */
export const STARTED_READ_ONLY = 'A trial in progress cannot be edited. You can add cube results and files, and close it.'
const notAllowed = (message: string) => Object.assign(new Error(message), { status: 409, code: 'not_allowed', message, fields: {} })

async function saveNow(qc: QueryClient, op: OpInput): Promise<Saved> {
  // Waiting changes must be known (the saved queue read) before deciding to send directly.
  await outbox.load().catch(() => undefined)
  // Step edits only while the trial is a draft: never send or queue one for a trial
  // that has started (on the server, or by a start waiting on this phone).
  if (op.kind === 'patch_trial') {
    const view = currentView(qc, op.trialId)
    if (view?.status === 'in_progress' || view?.status === 'closed') {
      throw notAllowed(view.status === 'closed' ? 'Closed trials are read only.' : STARTED_READ_ONLY)
    }
  }
  if (isOnline() && !outbox.hasWaiting(op.trialId)) {
    try {
      const trial = (await sendOp(op)) as Trial
      return { trial, queued: false }
    } catch (e) {
      if (!unreachable(e) || outbox.user === null) throw e
    }
  }
  await outbox.enqueue(op)
  kick()
  return { trial: currentView(qc, op.trialId)!, queued: true }
}

export const saveTrialPatch = (qc: QueryClient, trialId: string, body: Record<string, unknown>, what?: string) =>
  sendOrQueue(qc, { kind: 'patch_trial', trialId, body, what })

export const saveCubes = (qc: QueryClient, trialId: string, age: string,
  body: { cubes: { weight: string | null; load: string | null }[]; tested_on?: string }) =>
  sendOrQueue(qc, { kind: 'put_cubes', trialId, age, body })

/** Delete one age's saved cube set (legacy cube row delete), now or when back online.
 * It rides the cube queue entry of that age, so a later save of the age replaces it. */
export const deleteCubes = (qc: QueryClient, trialId: string, age: string) =>
  sendOrQueue(qc, { kind: 'put_cubes', trialId, age, body: { cubes: [], remove: true } })

/** Start: the server refuses an incomplete trial (legacy Create Trial rules), so a
 * start that would be queued is checked on the phone first, on the trial with its
 * waiting changes; one that still fails on sync becomes a sync problem. */
export const CAST_NEEDED = 'Enter the trial date and time before starting. Cube test dates count from it.'
export const START_INCOMPLETE = 'The trial cannot start yet. Fill in what is listed.'
export async function startTrial(qc: QueryClient, trial: Trial): Promise<Saved> {
  if (!isOnline() || outbox.hasWaiting(trial.id)) {
    const missing = localCompleteness(currentView(qc, trial.id) ?? trial)
    if (missing.length) {
      const fields = asFields(missing)
      if (fields.cast_at) fields.cast_at = [CAST_NEEDED]
      const message = fields.cast_at && missing.length === 1 ? CAST_NEEDED : START_INCOMPLETE
      throw Object.assign(new Error(message), { status: 400, code: 'invalid', message, fields })
    }
  }
  return sendOrQueue(qc, { kind: 'start_trial', trialId: trial.id })
}

/** A new draft trial with an id made on the phone, so it exists before the server sees it.
 * Its trial date and time default to now (legacy T-33), sent with the create so a
 * trial made offline keeps the time it was made on the phone, not the sync time. */
export async function createTrial(qc: QueryClient, project: Pick<Project, 'id' | 'project_name' | 'customer_name'>, now = new Date()): Promise<Saved> {
  const castAt = new Date(Math.floor(now.getTime() / 1000) * 1000).toISOString().replace('.000Z', 'Z')
  const op: OpInput = { kind: 'create_trial', trialId: newId(), project: project.id, projectName: project.project_name, customerName: project.customer_name, castAt }
  const saved = await sendOrQueue(qc, op)
  if (!saved.queued) storeResult(qc, op, saved.trial)
  return saved
}

/** Photos and files: copied into the app's document directory first, then
 * uploaded in order with a client_id, now or when back online. */
export async function queueFiles(trialId: string, files: PickedFile[], reading = ''): Promise<string[]> {
  const problems: string[] = []
  for (const f of files) {
    const clientId = newId()
    let uri: string
    try {
      uri = await fileKeeper.keep(f.uri, clientId, f.name)
    } catch {
      problems.push(`${f.name}: there is no room to keep it on this phone. Free some space and try again.`)
      continue
    }
    try {
      await outbox.enqueue({ kind: 'upload_attachment', trialId, clientId, name: f.name, type: f.type, size: f.size ?? null, uri, ...(reading ? { reading } : {}) })
    } catch {
      await fileKeeper.drop(uri)
      problems.push(`${f.name}: it could not be saved on this phone. Try again.`)
    }
  }
  kick()
  return problems
}

/** Close needs the server's checks and warnings, so it waits for the trial's changes to sync first. */
export const CLOSE_OFFLINE = 'Closing a trial needs a connection, because the server checks the results first. Your changes are saved on this phone. Close the trial when you are back online.'
export const CLOSE_WAITING = 'This trial has changes that have not synced yet. Close it once they have synced.'

export async function readyToClose(trialId: string): Promise<string | null> {
  if (!isOnline()) return CLOSE_OFFLINE
  if (!outbox.hasWaiting(trialId)) return null
  await outbox.flush().catch(() => undefined)
  if (!isOnline()) return CLOSE_OFFLINE
  return outbox.hasWaiting(trialId) ? CLOSE_WAITING : null
}
