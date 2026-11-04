/**
 * Trial screen plumbing shared by the five steps: the loaded trial and
 * project, a PATCH helper that stores the server's answer, a registry of
 * unsaved work (so Save, Next, the step switcher and the leave guard can
 * save or warn about whatever the current step holds), and a short status
 * message line in the footer in place of the web toasts.
 */
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { fieldErrors } from '@/api/client'
import { errorMessage, isApiError, otherErrors, statusOf } from '@/api/errors'
import { isOnline } from '@/offline/connectivity'
import { outbox } from '@/offline/outbox'
import { saveTrialPatch } from '@/offline/trialActions'
import type { Project, Trial } from '@/shared/types'

import { STEPS, type StepNo } from './forms'

type Saver = { dirty: boolean; save: () => Promise<boolean> }
export type Notice = { tone: 'ok' | 'error' | 'info'; text: string } | null

export type WorkspaceValue = {
  trial: Trial
  project: Project | undefined
  step: StepNo
  /** The trial header, rendered by each step inside its own Screen. */
  header: ReactNode
  /** Store a trial the server returned (after PATCH, PUT cubes, start, close). */
  accept: (t: Trial) => void
  report: (key: string, saver: Saver) => void
  remove: (key: string) => void
  dirty: boolean
  isDirty: () => boolean
  saving: boolean
  saveAll: () => Promise<boolean>
  goTo: (n: StepNo, force?: boolean) => void
  next: () => Promise<void>
  startTrial: () => Promise<void>
  starting: boolean
  castError: string | null
  setCastError: (msg: string | null) => void
  notice: Notice
  notify: (n: Notice) => void
}

export const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside the trial screen')
  return ctx
}

/** Registry of unsaved work, owned by the screen. */
export function useSaverRegistry() {
  const savers = useRef(new Map<string, Saver>())
  const [dirty, setDirty] = useState(false)
  const sync = useCallback(() => setDirty([...savers.current.values()].some((s) => s.dirty)), [])
  const report = useCallback((key: string, saver: Saver) => { savers.current.set(key, saver); sync() }, [sync])
  const remove = useCallback((key: string) => { savers.current.delete(key); sync() }, [sync])
  const isDirty = useCallback(() => [...savers.current.values()].some((s) => s.dirty), [])
  const saveAll = useCallback(async () => {
    for (const s of [...savers.current.values()]) {
      if (s.dirty && !(await s.save())) return false
    }
    return true
  }, [])
  return { dirty, isDirty, saveAll, report, remove }
}

/** Register this component's unsaved work with the screen. */
export function useSaver(key: string, dirty: boolean, save: () => Promise<boolean>) {
  const { report, remove } = useWorkspace()
  const saveRef = useRef(save)
  useLayoutEffect(() => { saveRef.current = save })
  useEffect(() => { report(key, { dirty, save: () => saveRef.current() }) }, [key, dirty, report])
  useEffect(() => () => remove(key), [key, remove])
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export const NOT_SAVED = 'Not saved. Fix the highlighted fields and save again.'

/** "Mix design saved", or that it is saved on the phone while the trial has changes waiting to sync. */
export function savedNotice(trialId: string, text: string): Notice {
  return outbox.hasWaiting(trialId) ? { tone: 'info', text: queuedNote(text) } : { tone: 'ok', text }
}

/** Said after a change was kept on the phone instead of reaching the server. */
export const queuedNote = (what = 'Saved') => (isOnline()
  ? `${what} on this phone. It is syncing now.`
  : `${what} on this phone. It will sync when you are back online.`)

/** Message for a failed save: the server's own message when it is not about
 * fields, and the message itself when it is about a field this step does not
 * show (so it is never a "fix the highlighted fields" with nothing highlighted). */
export function saveError(e: unknown, fields: Record<string, string>, shown?: readonly string[]) {
  if (Object.keys(fields).length === 0) return isApiError(e) ? errorMessage(e) : errorMessage(e, 'Not saved. Try again.')
  const hidden = shown ? otherErrors(fields, shown) : []
  return hidden.length ? `Not saved. ${hidden[0]}` : NOT_SAVED
}

/**
 * Form state for one step. `init` builds the form from the trial, `payload`
 * turns it into the PATCH body with only this step's fields, `validate`
 * catches what must not be sent (an unreadable date). Dirty compares
 * payloads, so typing a value back to what was saved clears the warning.
 */
export function useStepForm<F>(key: string, init: (t: Trial) => F, payload: (f: F) => Record<string, unknown>,
  validate?: (f: F) => Record<string, string>, shown?: readonly string[]) {
  const { trial, accept, notify, step } = useWorkspace()
  const qc = useQueryClient()
  const reload = useReloadTrial(trial.id)
  const [form, setForm] = useState<F>(() => init(trial))
  const [baseline, setBaseline] = useState<F>(form)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const dirty = !same(payload(form), payload(baseline))

  const save = useCallback(async () => {
    const local = validate?.(form) ?? {}
    setErrors(local)
    if (Object.keys(local).length) { notify({ tone: 'error', text: NOT_SAVED }); return false }
    setSaving(true)
    try {
      // Online: straight to the server. Offline: kept on the phone and synced later.
      const { trial: t, queued } = await saveTrialPatch(qc, trial.id, payload(form), STEPS[step - 1].label)
      if (queued) notify({ tone: 'info', text: queuedNote() })
      else accept(t)
      const next = init(t)
      setForm(next)
      setBaseline(next)
      return true
    } catch (e) {
      const f = fieldErrors(e)
      setErrors(f)
      notify({ tone: 'error', text: saveError(e, f, shown) })
      reload(e)
      return false
    } finally {
      setSaving(false)
    }
  }, [qc, trial.id, step, payload, form, accept, init, notify, validate, shown, reload])

  useSaver(key, dirty, save)

  return { form, setForm, dirty, errors, setErrors, saving, save }
}

export function useAccept(id: string) {
  const qc = useQueryClient()
  return useCallback((t: Trial) => {
    qc.setQueryData(['trial', id], t)
    qc.invalidateQueries({ queryKey: ['trials'] })
    qc.invalidateQueries({ queryKey: ['project', t.project] })
    qc.invalidateQueries({ queryKey: ['trial', id, 'close-check'] })
  }, [qc, id])
}

/** After a refused save (409 closed or not allowed, 404 deleted, 403) the
 * trial on screen is out of date: reload it so the steps turn read only. */
export function useReloadTrial(id: string) {
  const qc = useQueryClient()
  return useCallback((e: unknown) => {
    const status = statusOf(e)
    if (status === 409 || status === 404 || status === 403) void qc.invalidateQueries({ queryKey: ['trial', id] })
  }, [qc, id])
}
