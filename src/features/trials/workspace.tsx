/**
 * Trial screen plumbing shared by the five steps: the loaded trial and
 * project, a PATCH helper that stores the server's answer, a registry of
 * unsaved work (so Save, Next, the step switcher and the leave guard can
 * save or warn about whatever the current step holds), and a short status
 * message line in the footer in place of the web toasts.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { api, ApiError, fieldErrors } from '@/api/client'
import type { Project, Trial } from '@/shared/types'

import type { StepNo } from './forms'

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

/** Message for a failed save: the server's own message when it is not about fields. */
export function saveError(e: unknown, fields: Record<string, string>) {
  if (e instanceof ApiError && Object.keys(fields).length === 0) return e.message
  return NOT_SAVED
}

/**
 * Form state for one step. `init` builds the form from the trial, `payload`
 * turns it into the PATCH body with only this step's fields, `validate`
 * catches what must not be sent (an unreadable date). Dirty compares
 * payloads, so typing a value back to what was saved clears the warning.
 */
export function useStepForm<F>(key: string, init: (t: Trial) => F, payload: (f: F) => Record<string, unknown>,
  validate?: (f: F) => Record<string, string>) {
  const { trial, accept, notify } = useWorkspace()
  const [form, setForm] = useState<F>(() => init(trial))
  const [baseline, setBaseline] = useState<F>(form)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const dirty = !same(payload(form), payload(baseline))

  const m = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<Trial>(`/trials/${trial.id}/`, { method: 'PATCH', body }),
  })

  const save = useCallback(async () => {
    const local = validate?.(form) ?? {}
    setErrors(local)
    if (Object.keys(local).length) { notify({ tone: 'error', text: NOT_SAVED }); return false }
    try {
      const t = await m.mutateAsync(payload(form))
      accept(t)
      const next = init(t)
      setForm(next)
      setBaseline(next)
      return true
    } catch (e) {
      const f = fieldErrors(e)
      setErrors(f)
      notify({ tone: 'error', text: saveError(e, f) })
      return false
    }
  }, [m, payload, form, accept, init, notify, validate])

  useSaver(key, dirty, save)

  return { form, setForm, dirty, errors, setErrors, saving: m.isPending, save }
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
