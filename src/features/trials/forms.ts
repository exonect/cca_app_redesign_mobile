/**
 * Trial form state: one plain object per step, built from the trial as the
 * API returns it, and turned back into the PATCH body for that step only.
 * Inputs hold strings exactly as typed; the server parses and checks them.
 * Same rules as the web app (src/features/trials/forms.ts there).
 */
import { AGES, AGGREGATES, MATERIALS, SIEVE_SETS } from '@/shared/calc'
import type { Project, Trial } from '@/shared/types'

import { castIso, castParts } from './castAt'
import { num, shortDate } from './format'

export const SIEVE_MATERIALS = ['20mm', '10mm', 'river_sand', 'crushed_sand'] as const
export type SieveMaterial = (typeof SIEVE_MATERIALS)[number]
export const SIEVE_MATERIAL_LABEL: Record<SieveMaterial, string> = {
  '20mm': '20 mm', '10mm': '10 mm', river_sand: 'River sand', crushed_sand: 'Crushed sand',
}
/** Short labels for the phone segmented control, as on the board. */
export const SIEVE_MATERIAL_SHORT: Record<SieveMaterial, string> = {
  '20mm': '20 mm', '10mm': '10 mm', river_sand: 'River', crushed_sand: 'Crushed',
}

export const READING_MINUTES = ['0', '30', '60', '90', '120', '150', '180', '210', '240']

export const STEPS = [
  { n: 1, label: 'Sieve analysis', next: 'Next: mix design' },
  { n: 2, label: 'Mix design', next: 'Next: fresh concrete' },
  { n: 3, label: 'Fresh concrete', next: 'Next: cube strength' },
  { n: 4, label: 'Cube strength', next: 'Next: conclusion' },
  { n: 5, label: 'Conclusion', next: '' },
] as const
export type StepNo = 1 | 2 | 3 | 4 | 5

export const parseStep = (v: unknown): StepNo => {
  const x = Number(Array.isArray(v) ? v[0] : v)
  return (Number.isInteger(x) && x >= 1 && x <= 5 ? x : 1) as StepNo
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const blank = (v: string | undefined) => v === undefined || v.trim() === ''
export const orNull = (v: string | undefined) => (blank(v) ? null : v!.trim())
const idOrNull = (v: string) => (blank(v) ? null : Number(v))

// --- Step 1 ------------------------------------------------------------------------
export type SieveEntry = { sieve: string; retained: string }
export type SieveForm = { sieves: Record<SieveMaterial, SieveEntry[]>; proportions: Record<SieveMaterial, string> }

export function sieveForm(t: Trial): SieveForm {
  const sieves = {} as SieveForm['sieves']
  const proportions = {} as SieveForm['proportions']
  for (const m of SIEVE_MATERIALS) {
    const rows = t.sieves?.[m] ?? []
    sieves[m] = rows.length
      ? rows.map((r) => ({ sieve: String(r.sieve), retained: str(r.retained) }))
      : SIEVE_SETS[m].map((sieve) => ({ sieve, retained: '' }))
    proportions[m] = str(t.proportions?.[m])
  }
  return { sieves, proportions }
}

export function sievePayload(f: SieveForm) {
  const anyProportion = SIEVE_MATERIALS.some((m) => !blank(f.proportions[m]))
  return {
    sieves: Object.fromEntries(SIEVE_MATERIALS.map((m) => {
      const rows = f.sieves[m]
      return [m, rows.some((r) => !blank(r.retained)) ? rows.map((r) => ({ sieve: r.sieve, retained: orNull(r.retained) })) : []]
    })),
    // Blank proportions count as 0 once any is entered; the server checks the 100% total.
    proportions: anyProportion ? Object.fromEntries(SIEVE_MATERIALS.map((m) => [m, orNull(f.proportions[m]) ?? '0'])) : {},
  }
}

// --- Step 2 ------------------------------------------------------------------------
export type MaterialEntry = { ssd: string; absorption: string; moisture: string; source: string; cement_type: string }
export type MixForm = {
  cast_date: string; cast_time: string; grade_of_concrete: string; batch_size: string
  admixture_1: string; dosage_1: string; admixture_2: string; dosage_2: string
  materials: Record<string, MaterialEntry>
}

export function mixForm(t: Trial): MixForm {
  const cast = castParts(t.cast_at)
  return {
    cast_date: cast.date, cast_time: cast.time,
    grade_of_concrete: str(t.grade_of_concrete?.id),
    batch_size: str(t.batch_size),
    admixture_1: str(t.admixture_1?.id), dosage_1: str(t.dosage_1),
    admixture_2: str(t.admixture_2?.id), dosage_2: str(t.dosage_2),
    materials: Object.fromEntries(MATERIALS.map((m) => {
      const x = t.materials?.[m] ?? {}
      return [m, { ssd: str(x.ssd), absorption: str(x.absorption), moisture: str(x.moisture), source: str(x.source), cement_type: str(x.cement_type) }]
    })),
  }
}

/** Client checks that block a save (the server checks everything else). */
export function mixProblems(f: MixForm): Record<string, string> {
  const { error } = castIso(f.cast_date, f.cast_time)
  return error ? { cast_at: error } : {}
}

export function mixPayload(f: MixForm) {
  const materials: Record<string, Record<string, string | null>> = {}
  for (const m of MATERIALS) {
    if (m === 'admixture_1' || m === 'admixture_2') continue // quantity follows the dosage, set by the server
    const x = f.materials[m]
    const row: Record<string, string | null> = { ssd: orNull(x.ssd) }
    if (AGGREGATES.includes(m)) { row.absorption = orNull(x.absorption); row.moisture = orNull(x.moisture) }
    if (x.source) row.source = x.source
    if (m === 'cement' && x.cement_type) row.cement_type = x.cement_type
    if (Object.values(row).some((v) => v !== null)) materials[m] = row
  }
  const cast = castIso(f.cast_date, f.cast_time)
  return {
    // Dirty tracking compares payloads, so a half typed date counts as a change.
    cast_at: cast.error ? `invalid:${f.cast_date}|${f.cast_time}` : cast.iso,
    grade_of_concrete: idOrNull(f.grade_of_concrete),
    batch_size: orNull(f.batch_size),
    admixture_1: idOrNull(f.admixture_1), dosage_1: orNull(f.dosage_1),
    admixture_2: idOrNull(f.admixture_2), dosage_2: orNull(f.dosage_2),
    materials,
  }
}

// --- Step 3 ------------------------------------------------------------------------
export type FreshForm = {
  fresh_test: '' | 'slump' | 'flow'; readings: Record<string, string>; fresh_density: string
  bleeding: string; setting: string
}

export function freshForm(t: Trial, project?: Project): FreshForm {
  return {
    fresh_test: t.fresh_test || project?.requirement_type || 'slump',
    readings: Object.fromEntries(READING_MINUTES.map((m) => [m, str(t.fresh_readings?.[m])])),
    fresh_density: str(t.fresh_density),
    bleeding: str(t.bleeding?.id), setting: str(t.setting?.id),
  }
}

const filled = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => !blank(v)).map(([k, v]) => [k, v.trim()]))

export function freshPayload(f: FreshForm) {
  return {
    fresh_test: f.fresh_test, fresh_readings: filled(f.readings), fresh_density: orNull(f.fresh_density),
    bleeding: idOrNull(f.bleeding), setting: idOrNull(f.setting),
  }
}

// --- Step 4 ------------------------------------------------------------------------
export type CubeEntry = { weight: string; load: string }
export const CUBES_PER_AGE = 3

export function cubeRows(t: Trial, age: string): CubeEntry[] {
  const saved = t.cube_sets.find((c) => c.age === age)?.cubes ?? []
  const rows = saved.map((c) => ({ weight: str(c.weight), load: str(c.load) }))
  while (rows.length < CUBES_PER_AGE) rows.push({ weight: '', load: '' })
  return rows
}

export const cubePayload = (rows: CubeEntry[]) => ({ cubes: rows.map((r) => ({ weight: orNull(r.weight), load: orNull(r.load) })) })

export const AGE_ORDER = Object.keys(AGES)
export const sortAges = (ages: Iterable<string>) => [...new Set(ages)].filter((a) => a in AGES).sort((a, b) => AGE_ORDER.indexOf(a) - AGE_ORDER.indexOf(b))

/** '28 days' -> '28d', '12 Hr' -> '12h' (same rule as the server). */
export function ageKey(value: string | null | undefined): string | null {
  const m = /^\s*(\d+)\s*(h|hr|hrs|hour|hours|d|day|days)\b/i.exec(value ?? '')
  if (!m) return null
  const key = `${m[1]}${m[2].toLowerCase().startsWith('h') ? 'h' : 'd'}`
  return key in AGES ? key : null
}

// --- Step 5 ------------------------------------------------------------------------
export const SIGNATORIES = [
  { name: 'signatory_rd', sign: 'signature_rd', label: 'Thermax R&D' },
  { name: 'signatory_site_qc', sign: 'signature_site_qc', label: 'Site QC in charge' },
  { name: 'signatory_sales', sign: 'signature_sales', label: 'Thermax Sales Person' },
] as const

export type ConclusionForm = {
  remarks: string
  signatory_sales: string; signatory_site_qc: string; signatory_rd: string
  /** PNG data URIs, '' when not signed. */
  signature_sales: string; signature_site_qc: string; signature_rd: string
}

export function conclusionForm(t: Trial, project?: Project): ConclusionForm {
  return {
    remarks: t.remarks ?? '',
    signatory_sales: t.signatory_sales || project?.sales_person?.name || '',
    signatory_site_qc: t.signatory_site_qc ?? '', signatory_rd: t.signatory_rd ?? '',
    signature_sales: t.signature_sales ?? '', signature_site_qc: t.signature_site_qc ?? '', signature_rd: t.signature_rd ?? '',
  }
}
export const conclusionPayload = (f: ConclusionForm) => ({ ...f })

/** The server joins its close warnings with spaces; split them back into sentences. */
export function splitWarnings(message: string) {
  return message.split(/(?<=\.)\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean)
}

// --- Project requirement ------------------------------------------------------------
export const SLUMP_TOLERANCE = 20

export function requirementTargets(p: Project | undefined) {
  const numbers = (xs: { value: string }[] | undefined) => (xs ?? []).map((x) => Number(x.value)).filter(Number.isFinite)
  const strengths = numbers(p?.compressive_strengths)
  const hours = Number(p?.retention_time?.value)
  const mm = Number(p?.slump_flow?.value)
  return {
    retention: p?.retention_time && p.slump_flow && Number.isFinite(hours) && Number.isFinite(mm)
      ? { minutes: Math.round(hours * 60), hours: p.retention_time.value, mm } : null,
    strength: strengths.length ? { value: Math.min(...strengths), age: ageKey(p?.strength_age?.value) ?? '28d' } : null,
    freshLabel: p?.requirement_type === 'flow' ? 'Flow' : 'Slump',
  }
}

// --- Progress summary -----------------------------------------------------------------
/** Which steps are complete, for the header progress bar and the step switcher. */
export function stepDone(t: Trial, p: Project | undefined): boolean[] {
  const r = t.results ?? ({} as Trial['results'])
  const sieveDone = SIEVE_MATERIALS.every((m) => r.sieves?.[m]?.complete) && (r.grading?.length ?? 0) > 0
  const target = requirementTargets(p).retention
  const at = target ? t.fresh_readings?.[String(target.minutes)] : null
  const freshDone = at !== null && at !== undefined && at !== ''
  return [sieveDone, !!r.mix?.free_wc, freshDone, !!r.cubes?.['28d']?.average, t.status === 'closed']
}

/** "28 days due 25 Nov" style note for an age that has no result yet. */
export function dueNote(castAt: string | null, age: string) {
  if (!castAt) return ''
  return `Due ${shortDate(new Date(new Date(castAt).getTime() + AGES[age][1] * 3_600_000))}`
}

export const pct = (value: number, target: number) => `${num(Math.round((value / target) * 100))}%`
