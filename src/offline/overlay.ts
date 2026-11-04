/**
 * What a trial looks like on this phone: the last copy from the server with
 * the changes still waiting to sync laid on top, in order. Recomputed on
 * every read, so a refetch from the server never hides a waiting change,
 * and a change that syncs simply moves from the overlay into the server copy.
 *
 * Results (strengths, W/C, checks) are worked out by the server, so they
 * stay as the server last sent them until the change syncs.
 */
import type { Project, Ref, Trial, TrialListItem, TrialStatus } from '@/shared/types'

import type { Op } from './queue'

/** PATCH fields sent as an id that the API returns expanded as {id, value}. */
const REF_FIELDS = ['grade_of_concrete', 'admixture_1', 'admixture_2', 'bleeding', 'setting'] as const

/** Labels for ids the phone has cached (lookups, products), so an offline choice shows its name. */
export type LabelFor = (field: string, id: number) => string | undefined

const AGE_LABEL: Record<string, string> = {
  '12h': '12 hours', '16h': '16 hours', '18h': '18 hours', '20h': '20 hours',
  '1d': '1 day', '3d': '3 days', '5d': '5 days', '7d': '7 days', '28d': '28 days',
}

export function applyPatch(t: Trial, body: Record<string, unknown>, labelFor?: LabelFor): Trial {
  const next: Record<string, unknown> = { ...t }
  for (const [k, v] of Object.entries(body)) {
    if ((REF_FIELDS as readonly string[]).includes(k)) {
      const id = v === null || v === undefined || v === '' ? null : Number(v)
      const current = t[k as (typeof REF_FIELDS)[number]] as Ref | null
      next[k] = id === null ? null : { id, value: current?.id === id ? current.value : labelFor?.(k, id) ?? '' }
    } else {
      next[k] = v
    }
  }
  const out = next as Trial
  // The list fields that show on cards follow the edit too.
  if ('admixture_1' in body) out.product = out.admixture_1?.value || null
  if ('grade_of_concrete' in body) out.grade = out.grade_of_concrete?.value || null
  return out
}

export function applyCubes(t: Trial, age: string, cubes: { weight: string | null; load: string | null }[], testedOn?: string, remove?: boolean): Trial {
  const sets = t.cube_sets.filter((c) => c.age !== age)
  if (remove) {
    const { [age]: _gone, ...cubesLeft } = t.results?.cubes ?? {}
    return { ...t, cube_sets: sets, results: { ...t.results, cubes: cubesLeft } }
  }
  const old = t.cube_sets.find((c) => c.age === age)
  sets.push({ age, age_label: old?.age_label ?? AGE_LABEL[age] ?? age, cubes, average: null, tested_on: testedOn ?? old?.tested_on ?? null })
  return { ...t, cube_sets: sets }
}

export function applyStart(t: Trial): Trial {
  if (t.status !== 'draft') return t
  return {
    ...t, status: 'in_progress', status_label: 'In progress',
    started_at: t.started_at ?? new Date().toISOString(),
    // Steps are read only once started (legacy edit rule); cubes, files and close stay open.
    actions: { ...t.actions, edit: false, start: false, close: t.actions.edit, edit_cubes: t.actions.edit || t.actions.edit_cubes },
  }
}

const EMPTY_RESULTS: Trial['results'] = { sieves: {}, grading: [], mix: null, cubes: {}, checks: [], errors: [] }

/** A trial made on this phone that the server has not seen yet. */
export function draftTrial(op: Extract<Op, { kind: 'create_trial' }>, project?: Pick<Project, 'project_name' | 'customer_name'>): Trial {
  return {
    id: op.trialId, code: null, project: op.project,
    project_name: project?.project_name ?? op.projectName, customer_name: project?.customer_name ?? op.customerName,
    status: 'draft' as TrialStatus, status_label: 'Draft', outcome: '', outcome_label: '', product: null, grade: null,
    cast_at: null, free_wc: null, strength_28d: null, created_by_name: null, created_at: op.createdAt, updated_at: op.createdAt,
    grade_of_concrete: null, sieves: {}, proportions: {}, batch_size: null, admixture_1: null, dosage_1: null, admixture_2: null, dosage_2: null,
    materials: {}, fresh_test: '', fresh_readings: {}, fresh_density: null, bleeding: null, setting: null, scc: {},
    remarks: '', signatory_sales: '', signatory_site_qc: '', signatory_rd: '', signature_sales: '', signature_site_qc: '', signature_rd: '',
    started_at: null, closed_at: null, results: EMPTY_RESULTS, cementitious_kg: null, cube_sets: [], attachments: [],
    actions: { edit: true, start: true, close: false, edit_cubes: true, delete: false, attach: true },
  }
}

/** The trial as this phone shows it: server copy (or the phone made draft) plus waiting changes. */
export function trialView(server: Trial | undefined, ops: Op[], labelFor?: LabelFor): Trial | undefined {
  const create = ops.find((o): o is Extract<Op, { kind: 'create_trial' }> => o.kind === 'create_trial')
  let t = server ?? (create ? draftTrial(create) : undefined)
  if (!t) return undefined
  for (const op of ops) {
    if (op.kind === 'patch_trial') t = applyPatch(t, op.body, labelFor)
    else if (op.kind === 'put_cubes') t = applyCubes(t, op.age, op.body.cubes, op.body.tested_on, op.body.remove)
    else if (op.kind === 'start_trial') t = applyStart(t)
  }
  return t
}

/** List rows for trials made on this phone, for the project's trial list. */
export function draftListItems(ops: Op[], projectId: string, labelFor?: LabelFor): TrialListItem[] {
  const ids = [...new Set(ops.filter((o) => o.kind === 'create_trial' && o.project === projectId).map((o) => o.trialId))]
  return ids.map((id) => trialView(undefined, ops.filter((o) => o.trialId === id), labelFor)!).filter(Boolean)
}

/** A list row with this phone's waiting changes laid on top. */
export function listItemView<T extends TrialListItem>(row: T, ops: Op[]): T {
  const mine = ops.filter((o) => o.trialId === row.id)
  if (!mine.length) return row
  let out: T = row
  for (const op of mine) {
    if (op.kind === 'start_trial' && out.status === 'draft') out = { ...out, status: 'in_progress', status_label: 'In progress' }
    if (op.kind === 'patch_trial' && typeof op.body.cast_at === 'string' && !op.body.cast_at.startsWith('invalid')) out = { ...out, cast_at: op.body.cast_at }
  }
  return out
}
