/**
 * Trial form state: one plain object per step, built from the trial as the
 * API returns it, and turned back into the PATCH body for that step only.
 * Inputs hold strings exactly as typed; the server parses and checks them.
 * Same rules as the web app (src/features/trials/forms.ts there).
 */
import { AGES, AGGREGATES, MATERIAL_LABEL, MATERIALS, SIEVE_LABEL, SIEVE_SETS } from '@/shared/calc'
import type { Project, Trial } from '@/shared/types'

import { CAST_ERRORS, castIso, castParts, isFutureDay } from './castAt'
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

// --- Number checks ------------------------------------------------------------------
/**
 * Lab inputs are typed as text. Blank means "not measured" and is always
 * fine. Anything else must be a plain number: the server either rejects
 * text it cannot read or (for some JSON fields) silently drops it, so the
 * phone stops it before saving.
 */
const NUMBER = /^-?(\d+(\.\d*)?|\.\d+)$/
export const isNumberText = (v: string | undefined) => blank(v) || NUMBER.test(v!.trim())
export const isNegative = (v: string | undefined) => !blank(v) && NUMBER.test(v!.trim()) && Number(v!.trim()) < 0
/** Not a number, or below zero: what a "0 or more" field must not hold. */
export const badNonNegative = (v: string | undefined) => !isNumberText(v) || isNegative(v)

/** Server ranges for numbers inside the JSON fields (cca/trials/api.py). */
export const LIMITS = {
  retained: 100_000, // g
  percent: 100, // proportions, absorption, moisture
  ssd: 3000, // kg/m³
  reading: 1000, // mm
  cubeWeight: 20, // kg
  cubeLoad: 3000, // kN
  materialText: 100, // cement source and type
  remarks: 1000,
} as const

/** What is wrong with a number the server reads as blank or 0 to max. */
export function rangeProblem(v: string | undefined, max: number): 'number' | 'negative' | 'max' | null {
  if (blank(v)) return null
  const t = v!.trim()
  if (!NUMBER.test(t)) return 'number'
  const x = Number(t)
  if (x < 0) return 'negative'
  return x > max ? 'max' : null
}
export const outOfRange = (v: string | undefined, max: number) => rangeProblem(v, max) !== null

/**
 * Sum of decimal texts rounded to 2 places the way the server does it
 * (Decimal quantize, half to even), as "100.00". Exact for the inputs the
 * form allows (0 to 100 each), so 33.33 + 33.33 + 33.34 is exactly 100.00.
 */
export function decimalTotal(values: (string | undefined)[]): string {
  const xs = values.map((v) => (v ?? '').trim()).filter((v) => v !== '' && NUMBER.test(v) && !v.startsWith('-'))
  const places = Math.min(12, Math.max(2, ...xs.map((x) => (x.split('.')[1] ?? '').length)))
  let sum = 0
  for (const x of xs) {
    const [w, f = ''] = x.split('.')
    sum += Number((w || '0') + f.slice(0, places).padEnd(places, '0'))
  }
  const unit = 10 ** (places - 2)
  let q = Math.floor(sum / unit)
  const r = sum - q * unit
  if (r * 2 > unit || (r * 2 === unit && q % 2 === 1)) q += 1
  return `${Math.floor(q / 100)}.${String(q % 100).padStart(2, '0')}`
}

/** Range and decimal places of a server DecimalField, as a message or null. */
export function decimalProblem(v: string, rule: { label: string; min?: number; minExclusive?: number; max?: number; decimals: number; maxDigits?: number }): string | null {
  if (blank(v)) return null
  const t = v.trim()
  if (!NUMBER.test(t)) return `Enter ${rule.label} as a number.`
  const x = Number(t)
  const frac = t.includes('.') ? t.split('.')[1].length : 0
  const range = rule.minExclusive !== undefined
    ? `more than ${rule.minExclusive}${rule.max !== undefined ? ` and up to ${rule.max}` : ''}`
    : `from ${rule.min ?? 0}${rule.max !== undefined ? ` to ${rule.max}` : ' up'}`
  if ((rule.minExclusive !== undefined && x <= rule.minExclusive) || (rule.min !== undefined && x < rule.min) || (rule.max !== undefined && x > rule.max)) {
    return `Enter ${rule.label} ${range}.`
  }
  if (frac > rule.decimals) return `Enter ${rule.label} with up to ${rule.decimals} decimal ${rule.decimals === 1 ? 'place' : 'places'}.`
  if (rule.maxDigits !== undefined) {
    const whole = String(Math.trunc(Math.abs(x))).replace(/^0$/, '')
    if (whole.length > rule.maxDigits - rule.decimals) return `Enter ${rule.label} with at most ${rule.maxDigits - rule.decimals} digits before the decimal point.`
  }
  return null
}

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

/** Client checks that block saving step 1, as on the server: retained
 * weights 0 to 100000 g; proportions each 0 to 100 and, once any is
 * entered, totalling exactly 100.00 (blank ones count as 0). */
export function sieveProblems(f: SieveForm): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of SIEVE_MATERIALS) {
    const bad = f.sieves[m].find((r) => outOfRange(r.retained, LIMITS.retained))
    if (bad) {
      const where = `Check ${SIEVE_MATERIAL_LABEL[m]} on ${SIEVE_LABEL[bad.sieve] ?? bad.sieve}.`
      out.sieves = rangeProblem(bad.retained, LIMITS.retained) === 'max'
        ? `Enter retained weights of ${LIMITS.retained} g or less. ${where}`
        : `Enter retained weights as numbers of 0 or more. ${where}`
      break
    }
  }
  const p = SIEVE_MATERIALS.find((m) => outOfRange(f.proportions[m], LIMITS.percent))
  if (p) {
    out.proportions = rangeProblem(f.proportions[p], LIMITS.percent) === 'number'
      ? `Enter the ${SIEVE_MATERIAL_LABEL[p]} proportion as a number.`
      : `Enter the ${SIEVE_MATERIAL_LABEL[p]} proportion from 0 to 100.`
  } else if (SIEVE_MATERIALS.some((m) => !blank(f.proportions[m]))) {
    const total = proportionTotal(f)
    if (total !== '100.00') out.proportions = `Proportions must total 100%. They total ${total}%.`
  }
  return out
}

export const proportionTotal = (f: SieveForm) => decimalTotal(SIEVE_MATERIALS.map((m) => f.proportions[m]))

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

const MATERIAL_RANGES = [
  ['ssd', 'SSD design', LIMITS.ssd, ' kg/m³'],
  ['absorption', 'absorption', LIMITS.percent, '%'],
  ['moisture', 'moisture', LIMITS.percent, '%'],
] as const

/** Client checks that block a save, mirroring TrialWriteSerializer: trial
 * date not after today (IST) and not cleared once started; dosage 0 to 10,
 * 2 decimals, and only with its product; batch size above 0, 3 decimals, 6
 * digits; SSD design 0 to 3000 kg/m³, absorption and moisture 0 to 100 %;
 * cement source and type up to 100 characters. */
export function mixProblems(f: MixForm, status?: Trial['status']): Record<string, string> {
  const out: Record<string, string> = {}
  const { iso, error } = castIso(f.cast_date, f.cast_time)
  if (error) out.cast_at = error
  else if (iso && isFutureDay(f.cast_date)) out.cast_at = CAST_ERRORS.future
  else if (!iso && status && status !== 'draft') out.cast_at = CAST_ERRORS.cleared
  for (const [k, label, product] of [['dosage_1', 'the dosage', 'admixture_1'], ['dosage_2', 'the second dosage', 'admixture_2']] as const) {
    const msg = decimalProblem(f[k], { label, min: 0, max: 10, decimals: 2, maxDigits: 5 })
    if (msg) out[k] = msg
    else if (!blank(f[k]) && blank(f[product])) out[k] = 'Choose the product before entering its dosage.'
  }
  const batch = decimalProblem(f.batch_size, { label: 'the batch size', minExclusive: 0, decimals: 3, maxDigits: 6 })
  if (batch) out.batch_size = batch
  for (const m of MATERIALS) {
    if (m === 'admixture_1' || m === 'admixture_2') continue // not sent; the server sets it from the dosage
    const x = f.materials[m]
    const name = MATERIAL_LABEL[m] ?? m
    for (const [k, label, max, unit] of MATERIAL_RANGES) {
      if (k !== 'ssd' && !AGGREGATES.includes(m)) continue // only aggregates send absorption and moisture
      const p = rangeProblem(x?.[k], max)
      if (p) {
        out.materials = p === 'number' ? `Enter ${name} ${label} as a number.` : `Enter ${name} ${label} from 0 to ${max}${unit}.`
        break
      }
    }
    if (out.materials) break
    const text = (['source', 'cement_type'] as const).find((k) => (x?.[k] ?? '').trim().length > LIMITS.materialText)
    if (text) {
      out.materials = `${name} ${text === 'source' ? 'source' : 'cement type'} can be up to ${LIMITS.materialText} characters.`
      break
    }
  }
  return out
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

/** Readings 0 to 1000 mm (server rule); density 1000 to 3000 kg/m³, 1 decimal. */
export function freshProblems(f: FreshForm): Record<string, string> {
  const out: Record<string, string> = {}
  const bad = READING_MINUTES.find((m) => outOfRange(f.readings[m], LIMITS.reading))
  if (bad) {
    const where = `Check ${bad === '0' ? 'the initial reading' : `${bad} min`}.`
    out.fresh_readings = rangeProblem(f.readings[bad], LIMITS.reading) === 'max'
      ? `Enter readings of ${LIMITS.reading} mm or less. ${where}`
      : `Enter readings in mm as numbers of 0 or more. ${where}`
  }
  const density = decimalProblem(f.fresh_density, { label: 'the density', min: 1000, max: 3000, decimals: 1, maxDigits: 6 })
  if (density) out.fresh_density = density
  return out
}

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

/** Server rules for one age: up to 6 cubes, weight 0 to 20 kg, load 0 to 3000 kN, blank allowed. */
export const CUBES_MAX = 6
export const badCubeWeight = (v: string) => outOfRange(v, LIMITS.cubeWeight)
export const badCubeLoad = (v: string) => outOfRange(v, LIMITS.cubeLoad)
export function cubeProblem(rows: CubeEntry[]): string | null {
  if (rows.length > CUBES_MAX) return `Enter up to ${CUBES_MAX} cubes.`
  for (const [i, r] of rows.entries()) {
    const w = rangeProblem(r.weight, LIMITS.cubeWeight)
    const l = rangeProblem(r.load, LIMITS.cubeLoad)
    if (w === 'number' || w === 'negative' || l === 'number' || l === 'negative') return `Enter weights and loads as numbers of 0 or more. Check cube ${i + 1}.`
    if (w === 'max') return `Enter a weight of ${LIMITS.cubeWeight} kg or less. Check cube ${i + 1}.`
    if (l === 'max') return `Enter a load of ${LIMITS.cubeLoad} kN or less. Check cube ${i + 1}.`
  }
  return null
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

/** Signatory names are at most 150 characters (server column); signatures at most 400,000 characters of PNG data. */
export const SIGNATORY_MAX = 150
export const SIGNATURE_MAX_CHARS = 400_000
export function conclusionProblems(f: ConclusionForm): Record<string, string> {
  const out: Record<string, string> = {}
  if (f.remarks.trim().length > LIMITS.remarks) out.remarks = `Use ${LIMITS.remarks} characters or fewer.`
  for (const s of SIGNATORIES) {
    if (f[s.name].trim().length > SIGNATORY_MAX) out[s.name] = `Use ${SIGNATORY_MAX} characters or fewer.`
    if (f[s.sign].length > SIGNATURE_MAX_CHARS) out[s.sign] = 'This signature image is too large. Clear it and sign again.'
  }
  return out
}

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
