/**
 * Trial form state: one plain object per step, built from the trial as the
 * API returns it, and turned back into the PATCH body for that step only.
 * Inputs hold strings exactly as typed; the server parses and checks them.
 * Same rules as the web app (src/features/trials/forms.ts there).
 */
import { fieldErrors, fieldErrorsByPath } from '@/api/errors'
import { AGES, AGGREGATES, analyse, isExtraMineral, isMineral, materialLabel, materialOrder, MATERIALS, mineralKey, SIEVE_LABEL, SIEVE_SETS } from '@/shared/calc'
import type { FieldNote, Project, Trial } from '@/shared/types'

import { CAST_ERRORS, castIso, castParts, dayIso, isFutureDay, istToday } from './castAt'
import { istDay, num, shortDate } from './format'

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
export const readingLabel = (m: string) => (m === '0' ? 'Initial' : `${m} min`)

/** Self compacting tests, one reading per time as in the legacy table ("T 5Min" is T500). */
export const SCC_TESTS = [
  { key: 'v_funnel', label: 'V funnel', unit: 's' },
  { key: 't500', label: 'T500', unit: 's' },
  { key: 'l_box', label: 'L box, H2 ÷ H1', unit: '' },
  { key: 'u_box', label: 'U box', unit: '' },
] as const
export type SccKey = (typeof SCC_TESTS)[number]['key']
/** Master data list of each SCC test (legacy Funnel, T5Mint, LBox, UBox), e.g. "5 sec". */
export const SCC_LIST: Record<SccKey, string> = {
  v_funnel: 'scc_v_funnel', t500: 'scc_t500', l_box: 'scc_l_box', u_box: 'scc_u_box',
}
/** The number a list value stands for: "9 sec" is 9, "1.0" is 1; null when it holds none. */
/** Slump Flow master values sorted as the legacy dropdown: by number, non numbers first. */
export function sortSlumpList<T extends { value: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const x = Number.parseFloat(a.value), y = Number.parseFloat(b.value)
    if (Number.isNaN(x) || Number.isNaN(y)) return Number.isNaN(x) ? (Number.isNaN(y) ? 0 : -1) : 1
    return x - y
  })
}

export function sccNumber(value: string): string | null {
  const m = /^\s*(\d+(?:\.\d+)?|\.\d+)/.exec(value)
  return m ? String(Number(m[1])) : null
}

export const STEPS = [
  { n: 1, label: 'Sieve analysis', next: 'Next: mix design' },
  { n: 2, label: 'Mix design', next: 'Next: fresh concrete' },
  { n: 3, label: 'Fresh concrete', next: 'Next: cube strength' },
  { n: 4, label: 'Cube strength', next: 'Next: conclusion' },
  { n: 5, label: 'Conclusion', next: '' },
] as const
export type StepNo = 1 | 2 | 3 | 4 | 5

/** The step that holds a field path, to send people to what is missing. */
export function stepOfField(field: string): StepNo {
  const head = field.split('.')[0]
  if (head === 'sieves' || head === 'proportions') return 1
  if (['fresh_readings', 'fresh_test', 'fresh_density', 'site_temp', 'bleeding', 'setting', 'scc'].includes(head)) return 3
  if (head === 'cubes') return 4
  if (head.startsWith('signatory_') || head.startsWith('signature_') || head === 'remarks' || head === 'outcome') return 5
  return 2
}

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

/**
 * Hard server limits (cca/trials/api.py): a value breaking one is not saved.
 * The legacy app took any non negative number in most of these, so the upper
 * limits only stop garbage; plausible ranges are SOFT warnings (below).
 */
export const LIMITS = {
  retained: 1_000_000, // kg, as the legacy sheet was labelled
  percent: 100, // proportions, absorption, moisture
  ssd: 100_000, // kg/m³
  reading: 100_000, // mm
  scc: 100_000,
  cubeWeight: 100_000, // kg as labelled; legacy users also typed grams
  cubeLoad: 100_000, // kN
  materialText: 100, // cement source and type
  remarks: 1000,
} as const

/**
 * Soft ranges (server cca/trials/plausibility.py SOFT): outside them the
 * value is still saved, with an amber warning. Same texts as the server.
 */
export const SOFT: Record<string, [label: string, low: number, high: number, unit: string]> = {
  dosage: ['Dosage', 0, 10, '%'],
  batch_size: ['Batch size', 0, 0.5, ' m³'],
  fresh_density: ['Fresh wet density', 1000, 3000, ' kg/m³'],
  site_temp: ['Site temperature', 0, 60, ' °C'],
  ssd: ['SSD design', 0, 3000, ' kg/m³'],
  reading: ['Reading', 0, 1000, ' mm'],
  v_funnel: ['V funnel', 0, 60, ' s'],
  t500: ['T500', 0, 60, ' s'],
  l_box: ['L box ratio', 0, 1, ''],
  u_box: ['U box', 0, 1000, ''],
  cube_weight: ['Cube weight', 0, 20, ' kg'],
  cube_load: ['Cube load', 0, 3000, ' kN'],
}

/** The amber warning for a typed value outside its soft range, or null. */
export function softWarning(kind: keyof typeof SOFT, raw: string | null | undefined, label?: string): string | null {
  const t = (raw ?? '').trim()
  if (t === '' || !NUMBER.test(t)) return null
  const x = Number(t)
  const [name, low, high, unit] = SOFT[kind]
  if (x >= low && x <= high) return null
  const what = label ?? name
  const shown = String(x)
  if (kind === 'cube_weight' && x > high) {
    return `${what} ${shown} kg is far above the 8 to 9 kg of a 150 mm cube. If it was weighed in grams, enter it in kg. Saved as entered.`
  }
  return x > high
    ? `${what} ${shown}${unit} is above the usual ${high}${unit}. Check it. Saved as entered.`
    : `${what} ${shown}${unit} is below the usual ${low}${unit}. Check it. Saved as entered.`
}

/** Server warnings ([{field, message}] on the trial) by field path. */
export const warningsByField = (t: Pick<Trial, 'warnings'>) => Object.fromEntries((t.warnings ?? []).map((w) => [w.field, w.message]))

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

/** What an empty sieve or proportion shows (UAT, 12 Nov 2026): 0.00, not blank. */
export const ZERO = '0.00'
/** Sum of the weights above 0 (blank and 0 count as nothing). */
export const retainedTotal = (rows: { retained: unknown }[] | undefined) => sieveTotal(rows)

/**
 * Live figures from the first weight entered (UAT, 12 Nov 2026): a blank counts as 0, and every column
 * follows each change. A material whose weights are all 0 shows no figures yet.
 */
export function liveAnalyse(rows: SieveEntry[]): ReturnType<typeof analyse> {
  const filled = analyse(rows.map((r) => ({ sieve: r.sieve, retained: r.retained.trim() === '' ? '0' : r.retained })))
  if (retainedTotal(rows) > 0 || !filled.complete) return filled
  return { ...filled, rows: filled.rows.map((r) => ({ ...r, cum: null, cumPct: null, passing: null })), complete: false, fm: null }
}

export function sieveForm(t: Pick<Trial, 'sieves' | 'proportions'>): SieveForm {
  const sieves = {} as SieveForm['sieves']
  const proportions = {} as SieveForm['proportions']
  for (const m of SIEVE_MATERIALS) {
    const rows = t.sieves?.[m] ?? []
    sieves[m] = rows.length
      ? rows.map((r) => ({ sieve: String(r.sieve), retained: str(r.retained) || ZERO }))
      : SIEVE_SETS[m].map((sieve) => ({ sieve, retained: ZERO }))
    proportions[m] = str(t.proportions?.[m]) || ZERO
  }
  return { sieves, proportions }
}

/**
 * A material counts once any of its weights is above 0: it is sent with blanks as 0; one left at 0
 * throughout is sent as not analysed. Proportions are sent once any is above 0 (blanks as 0); the
 * server then checks they total 100.
 */
export function sievePayload(f: SieveForm) {
  const anyProportion = SIEVE_MATERIALS.some((m) => positive(f.proportions[m]))
  return {
    sieves: Object.fromEntries(SIEVE_MATERIALS.map((m) => {
      const rows = f.sieves[m]
      return [m, retainedTotal(rows) > 0 ? rows.map((r) => ({ sieve: r.sieve, retained: orNull(r.retained) ?? '0' })) : []]
    })),
    proportions: anyProportion ? Object.fromEntries(SIEVE_MATERIALS.map((m) => [m, orNull(f.proportions[m]) ?? '0'])) : {},
  }
}

/**
 * Before leaving step 1 (UAT, 12 Nov 2026; the old app's "Next"): 20 mm, 10 mm and at least one sand with
 * a total above 0, and the all in grading proportions totalling 100. Same rule and words as the web app
 * and the server (cca/trials/plausibility.py sieve_gap, proportion_gap), which also checks it on Start.
 */
export function sieveGate(t: Pick<Trial, 'sieves' | 'proportions'>): { field: 'sieves' | 'proportions'; message: string }[] {
  const out: { field: 'sieves' | 'proportions'; message: string }[] = []
  const total = (m: SieveMaterial) => retainedTotal(t.sieves?.[m])
  const coarse = (['20mm', '10mm'] as const).filter((m) => total(m) <= 0).map((m) => SIEVE_MATERIAL_LABEL[m])
  const sand = total('river_sand') <= 0 && total('crushed_sand') <= 0
  if (coarse.length || sand) {
    out.push({
      field: 'sieves',
      message: !coarse.length ? 'Fill in river sand or crushed sand to move ahead: at least one needs a total above 0.00 kg.'
        : sand ? `Fill in ${coarse.join(', ')} and river sand or crushed sand to move ahead: each needs a total above 0.00 kg.`
          : `Fill in ${coarse.join(' and ')} to move ahead: ${coarse.length > 1 ? 'each needs a total' : 'its total must be'} above 0.00 kg.`,
    })
  }
  const props = decimalTotal(Object.values(t.proportions ?? {}).map((v) => String(v ?? '')).filter((v) => v.trim() !== ''))
  if (props !== '100.00') out.push({ field: 'proportions', message: `All in grading proportions must total 100%. They total ${props}%.` })
  return out
}

/** Client checks that block saving step 1, as on the server: retained
 * weights 0 to 1000000 kg (garbage only); proportions each 0 to 100 and, once any is
 * entered, totalling exactly 100.00 (blank ones count as 0). */
export function sieveProblems(f: SieveForm): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of SIEVE_MATERIALS) {
    const bad = f.sieves[m].find((r) => outOfRange(r.retained, LIMITS.retained))
    if (bad) {
      const where = `Check ${SIEVE_MATERIAL_LABEL[m]} on ${SIEVE_LABEL[bad.sieve] ?? bad.sieve}.`
      out.sieves = rangeProblem(bad.retained, LIMITS.retained) === 'max'
        ? `Enter retained weights of ${LIMITS.retained} kg or less. ${where}`
        : `Enter retained weights as numbers of 0 or more. ${where}`
      break
    }
  }
  const p = SIEVE_MATERIALS.find((m) => outOfRange(f.proportions[m], LIMITS.percent))
  if (p) {
    out.proportions = rangeProblem(f.proportions[p], LIMITS.percent) === 'number'
      ? `Enter the ${SIEVE_MATERIAL_LABEL[p]} proportion as a number.`
      : `Enter the ${SIEVE_MATERIAL_LABEL[p]} proportion from 0 to 100.`
  } else if (SIEVE_MATERIALS.some((m) => positive(f.proportions[m]))) {
    const total = proportionTotal(f)
    if (total !== '100.00') out.proportions = `Proportions must total 100%. They total ${total}%.`
  }
  return out
}

export const proportionTotal = (f: SieveForm) => decimalTotal(SIEVE_MATERIALS.map((m) => f.proportions[m]))

// --- Step 2 ------------------------------------------------------------------------
export type MaterialEntry = { ssd: string; absorption: string; moisture: string; source: string; cement_type: string; name: string }
export type MixForm = {
  cast_date: string; cast_time: string; grade_of_concrete: string; batch_size: string
  admixture_1: string; dosage_1: string; admixture_2: string; dosage_2: string
  materials: Record<string, MaterialEntry>
  /** Mineral admixture rows on this trial (UAT, 12 Nov 2026): the table starts at cement and the user
   * adds and removes these from the Mineral Admixture list. */
  minerals: string[]
}

const EMPTY_MATERIAL: MaterialEntry = { ssd: '', absorption: '', moisture: '', source: '', cement_type: '', name: '' }
const filledRow = (x: Record<string, unknown> | undefined) => !!x && Object.values(x).some((v) => v !== null && v !== undefined && String(v).trim() !== '')

/** The rows the table shows, in order: added mineral admixtures, then cement to water. */
export const mixRows = (f: MixForm) => materialOrder(f.materials).filter((m) => !isMineral(m) || f.minerals.includes(m))

/** Adds the mineral admixture chosen from the master list (its slot, or its own row). */
export function addMineral(f: MixForm, name: string): MixForm {
  const key = mineralKey(name)
  if (!key || f.minerals.includes(key)) return f
  return { ...f, minerals: [...f.minerals, key], materials: { ...f.materials, [key]: { ...EMPTY_MATERIAL, name: name.trim() } } }
}

/** Removes a mineral admixture row; its values go with it. */
export function removeMineral(f: MixForm, key: string): MixForm {
  return { ...f, minerals: f.minerals.filter((m) => m !== key), materials: { ...f.materials, [key]: { ...EMPTY_MATERIAL } } }
}

export function mixForm(t: Trial): MixForm {
  const cast = castParts(t.cast_at)
  const stored = (t.materials ?? {}) as Record<string, Record<string, unknown> | undefined>
  const keys = [...MATERIALS, ...Object.keys(stored).filter(isExtraMineral)]
  return {
    cast_date: cast.date, cast_time: cast.time,
    grade_of_concrete: str(t.grade_of_concrete?.id),
    batch_size: str(t.batch_size),
    admixture_1: str(t.admixture_1?.id), dosage_1: str(t.dosage_1),
    admixture_2: str(t.admixture_2?.id), dosage_2: str(t.dosage_2),
    materials: Object.fromEntries(keys.map((m) => {
      const x = stored[m] ?? {}
      return [m, { ssd: str(x.ssd), absorption: str(x.absorption), moisture: str(x.moisture), source: str(x.source), cement_type: str(x.cement_type), name: str(x.name) }]
    })),
    // A mineral row shows when the trial holds anything for it (imported history included).
    minerals: keys.filter((m) => isMineral(m) && filledRow(stored[m])),
  }
}

const MATERIAL_RANGES = [
  ['ssd', 'SSD design', LIMITS.ssd, ' kg/m³'],
  ['absorption', 'absorption', LIMITS.percent, '%'],
  ['moisture', 'moisture', LIMITS.percent, '%'],
] as const

/** Client checks that block a save, mirroring TrialWriteSerializer: trial
 * date not after today (IST) and not cleared once started; dosage 0 to
 * 99.99 (the legacy input refused 100), 2 decimals, and only with its
 * product; batch size 0 or more, 3 decimals, 6 digits; SSD design (and the
 * typed admixture quantity) 0 to 100000 kg/m³, absorption and moisture 0 to
 * 100 %; source and cement type up to 100 characters. Plausible ranges are
 * soft warnings (mixSoftWarnings). */
export function mixProblems(f: MixForm, status?: Trial['status']): Record<string, string> {
  const out: Record<string, string> = {}
  const { iso, error } = castIso(f.cast_date, f.cast_time)
  if (error) out.cast_at = error
  else if (iso && isFutureDay(f.cast_date)) out.cast_at = CAST_ERRORS.future
  else if (!iso && status && status !== 'draft') out.cast_at = CAST_ERRORS.cleared
  for (const [k, label, product] of [['dosage_1', 'the dosage', 'admixture_1'], ['dosage_2', 'the second dosage', 'admixture_2']] as const) {
    const msg = decimalProblem(f[k], { label, min: 0, max: 99.99, decimals: 2, maxDigits: 5 })
    if (msg) out[k] = msg
    else if (!blank(f[k]) && blank(f[product])) out[k] = 'Choose the product before entering its dosage.'
  }
  const batch = decimalProblem(f.batch_size, { label: 'the batch size', min: 0, decimals: 4, maxDigits: 7 })
  if (batch) out.batch_size = batch
  for (const m of mixRows(f)) {
    const x = f.materials[m]
    const name = materialLabel(m, f.materials)
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
  for (const m of mixRows(f)) {
    const x = f.materials[m] // admixture rows carry the quantity typed, as in the legacy app
    const row: Record<string, string | null> = { ssd: orNull(x.ssd) }
    if (AGGREGATES.includes(m)) { row.absorption = orNull(x.absorption); row.moisture = orNull(x.moisture) }
    if (x.source) row.source = x.source
    if (m === 'cement' && x.cement_type) row.cement_type = x.cement_type
    // An added mineral row is kept even before its values are in (it then needs its source to start).
    if (isMineral(m) && x.name.trim()) row.name = x.name.trim()
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

/** Live amber warnings for the mix step (values are still saved). */
export function mixSoftWarnings(f: MixForm): Record<string, string> {
  const out: Record<string, string> = {}
  const add = (k: string, w: string | null) => { if (w) out[k] = w }
  add('dosage_1', softWarning('dosage', f.dosage_1, 'Dosage of admixture I'))
  add('dosage_2', softWarning('dosage', f.dosage_2, 'Dosage of admixture II'))
  add('batch_size', softWarning('batch_size', f.batch_size))
  for (const m of mixRows(f)) add(`materials.${m}.ssd`, softWarning('ssd', f.materials[m]?.ssd, `SSD design of ${materialLabel(m, f.materials)}`))
  const s20 = (f.materials['20mm']?.source ?? '').trim(), s10 = (f.materials['10mm']?.source ?? '').trim()
  if (s20 && s10 && s20.toLowerCase() !== s10.toLowerCase()) {
    out['materials.20mm.source'] = 'The 20 mm and 10 mm sources are not equal. The trial cannot start until they match.'
  }
  return out
}

/** Legacy: choosing the 20 mm source copies it to 10 mm when 10 mm has an SSD
 * design entered, and the reverse. */
export function withCoarseSource(f: MixForm, m: string, source: string): MixForm {
  const materials = { ...f.materials, [m]: { ...f.materials[m], source } }
  const other = m === '20mm' ? '10mm' : m === '10mm' ? '20mm' : null
  if (other && !blank(f.materials[other].ssd)) materials[other] = { ...f.materials[other], source }
  return { ...f, materials }
}

// --- Step 3 ------------------------------------------------------------------------
export type FreshForm = {
  fresh_test: '' | 'slump' | 'flow'; readings: Record<string, string>; fresh_density: string; site_temp: string
  bleeding: string; setting: string
  /** SCC tests added to the table (legacy "Concrete Properties" select), each with a reading per time. */
  scc_tests: SccKey[]; scc: Record<SccKey, Record<string, string>>
}

/** A stored SCC test as {minutes: value}; a single value (before per time readings) counts as Initial. */
export function sccReadings(v: unknown): Record<string, string> {
  if (v === null || v === undefined || v === '') return {}
  if (typeof v !== 'object') return { 0: String(v) }
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, str(x)]))
}

export function freshForm(t: Trial, project?: Project): FreshForm {
  const scc = Object.fromEntries(SCC_TESTS.map(({ key }) => {
    const saved = sccReadings(t.scc?.[key])
    return [key, Object.fromEntries(READING_MINUTES.map((m) => [m, saved[m] ?? '']))]
  })) as FreshForm['scc']
  return {
    fresh_test: t.fresh_test || project?.requirement_type || 'slump',
    readings: Object.fromEntries(READING_MINUTES.map((m) => [m, str(t.fresh_readings?.[m])])),
    fresh_density: str(t.fresh_density), site_temp: str(t.site_temp),
    bleeding: str(t.bleeding?.id), setting: str(t.setting?.id),
    scc_tests: SCC_TESTS.map((x) => x.key).filter((k) => Object.values(scc[k]).some((v) => !blank(v))),
    scc,
  }
}

const filled = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => !blank(v)).map(([k, v]) => [k, v.trim()]))

/** Readings and SCC values 0 to 100000 (garbage only); density 0 or more with 1
 * decimal; site temperature 0 or more with 2 decimals. Plausible ranges are soft. */
export function freshProblems(f: FreshForm): Record<string, string> {
  const out: Record<string, string> = {}
  const bad = READING_MINUTES.find((m) => outOfRange(f.readings[m], LIMITS.reading))
  if (bad) {
    const where = `Check ${bad === '0' ? 'the initial reading' : `${bad} min`}.`
    out.fresh_readings = rangeProblem(f.readings[bad], LIMITS.reading) === 'max'
      ? `Enter readings of ${LIMITS.reading} mm or less. ${where}`
      : `Enter readings in mm as numbers of 0 or more. ${where}`
  }
  for (const t of SCC_TESTS) {
    if (!f.scc_tests.includes(t.key)) continue
    const m = READING_MINUTES.find((x) => outOfRange(f.scc[t.key][x], LIMITS.scc))
    if (m) {
      out.scc = `Enter ${t.label} readings as numbers from 0 to ${LIMITS.scc}. Check ${readingLabel(m).toLowerCase()}.`
      break
    }
  }
  const density = decimalProblem(f.fresh_density, { label: 'the density', min: 0, decimals: 4, maxDigits: 9 })
  if (density) out.fresh_density = density
  const temp = decimalProblem(f.site_temp, { label: 'the site temperature', min: 0, decimals: 4, maxDigits: 7 })
  if (temp) out.site_temp = temp
  return out
}

export function freshPayload(f: FreshForm) {
  const scc: Record<string, Record<string, string>> = {}
  for (const k of f.scc_tests) {
    const readings = filled(f.scc[k])
    if (Object.keys(readings).length) scc[k] = readings
  }
  return {
    fresh_test: f.fresh_test, fresh_readings: filled(f.readings), fresh_density: orNull(f.fresh_density),
    site_temp: orNull(f.site_temp), bleeding: idOrNull(f.bleeding), setting: idOrNull(f.setting), scc,
  }
}

/** Live amber warnings for the fresh concrete step. */
export function freshSoftWarnings(f: FreshForm): Record<string, string> {
  const out: Record<string, string> = {}
  const add = (k: string, w: string | null) => { if (w) out[k] = w }
  for (const m of READING_MINUTES) add(`fresh_readings.${m}`, softWarning('reading', f.readings[m], `Reading at ${readingLabel(m).toLowerCase()}`))
  add('fresh_density', softWarning('fresh_density', f.fresh_density))
  add('site_temp', softWarning('site_temp', f.site_temp))
  for (const t of SCC_TESTS) {
    if (!f.scc_tests.includes(t.key)) continue
    for (const m of READING_MINUTES) add(`scc.${t.key}.${m}`, softWarning(t.key, f.scc[t.key][m], `${SOFT[t.key][0]} at ${readingLabel(m).toLowerCase()}`))
  }
  return out
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

/** Server rules for one age: up to 6 cubes, weight and load 0 to 100000
 * (garbage only; 20 kg and 3000 kN are soft), blank allowed; the actual test
 * date (yyyy-mm-dd) not in the future and not before the trial date. */
export const CUBES_MAX = 6
export const badCubeWeight = (v: string) => outOfRange(v, LIMITS.cubeWeight)
export const badCubeLoad = (v: string) => outOfRange(v, LIMITS.cubeLoad)
export const TESTED_ON_ERRORS = {
  future: 'The test date cannot be in the future.',
  beforeCast: 'The test date cannot be before the trial date.',
} as const
export function cubeProblem(rows: CubeEntry[], testedOn = '', castAt: string | null = null, today = istToday()): string | null {
  if (testedOn && testedOn > today) return TESTED_ON_ERRORS.future
  if (testedOn && castAt && testedOn < istDay(castAt)) return TESTED_ON_ERRORS.beforeCast
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

export const cubePayload = (rows: CubeEntry[], testedOn = '') => ({
  cubes: rows.map((r) => ({ weight: orNull(r.weight), load: orNull(r.load) })),
  ...(testedOn ? { tested_on: testedOn } : {}),
})

/**
 * Actual test date of a cube set (legacy "Date of Testing", editable), as
 * yyyy-mm-dd: the saved date, else the due date or today, whichever is
 * earlier; blank without a trial date.
 */
export function testedOnDefault(t: Pick<Trial, 'cast_at' | 'cube_sets'>, age: string, today = istToday()): string {
  const saved = t.cube_sets.find((c) => c.age === age)?.tested_on
  if (saved) return saved
  if (!t.cast_at) return ''
  const due = istDay(new Date(new Date(t.cast_at).getTime() + AGES[age][1] * 3_600_000))
  return due < today ? due : today
}

/** The typed test date (dd/mm/yyyy) as yyyy-mm-dd, or the problem to show. */
export function testedOnIso(text: string): { iso: string; error: string | null } {
  const d = dayIso(text)
  if (d === '') return { iso: '', error: null }
  if (d === 'format') return { iso: '', error: CAST_ERRORS.dateFormat }
  if (d === 'invalid') return { iso: '', error: CAST_ERRORS.dateInvalid }
  return { iso: d, error: null }
}

/** Live amber warnings for one cube set (a weight typed in grams, an outsized load). */
export function cubeSoftWarnings(rows: CubeEntry[], ageLabel: string): string[] {
  return rows.flatMap((r, i) => [
    softWarning('cube_weight', r.weight, `Weight of cube ${i + 1}, ${ageLabel},`),
    softWarning('cube_load', r.load, `Load on cube ${i + 1}, ${ageLabel},`),
  ]).filter((w): w is string => !!w)
}

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
    // The server fills this from the project's creator; it is shown, never typed.
    signatory_sales: t.signatory_sales || project?.created_by?.name || project?.sales_person?.name || '',
    signatory_site_qc: t.signatory_site_qc ?? '', signatory_rd: t.signatory_rd ?? '',
    signature_sales: t.signature_sales ?? '', signature_site_qc: t.signature_site_qc ?? '', signature_rd: t.signature_rd ?? '',
  }
}
export const conclusionPayload = ({ signatory_sales: _filledByServer, ...f }: ConclusionForm) => ({
  ...f,
  signatory_site_qc: f.signatory_site_qc.trim(), signatory_rd: f.signatory_rd.trim(),
})

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
  // Step 1 needs 20 mm, 10 mm and one sand (either), as its rule to move ahead.
  const has = (m: SieveMaterial) => !!r.sieves?.[m]?.complete
  const sieveDone = has('20mm') && has('10mm') && (has('river_sand') || has('crushed_sand')) && (r.grading?.length ?? 0) > 0
  const target = requirementTargets(p).retention
  const at = target ? t.fresh_readings?.[String(target.minutes)] : null
  const freshDone = at !== null && at !== undefined && at !== ''
  return [sieveDone, !!r.mix?.free_wc, freshDone, !!r.cubes?.['28d']?.average, t.status === 'closed']
}

// --- Completeness (legacy Create Trial rules) -----------------------------------------
const positive = (v: unknown) => { const x = num0(v); return x !== null && x > 0 }
function num0(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const t = String(v).trim()
  return NUMBER.test(t) ? Number(t) : null
}
const sieveTotal = (rows: unknown) => (Array.isArray(rows) ? rows : [])
  .reduce((sum: number, r) => { const x = num0((r as { retained?: unknown })?.retained); return x !== null && x > 0 ? sum + x : sum }, 0)
const COMPLETENESS_MINERALS = ['fly_ash', 'ggbs', 'alcofine', 'microsilica', 'fiber']
const SCC_NAME: Record<SccKey, string> = { v_funnel: 'V funnel', t500: 'T500', l_box: 'L box', u_box: 'U box' }

/**
 * What the legacy app required before a trial could become In progress and
 * this trial still lacks: the same rules and messages as the server's
 * plausibility.completeness, worked out on the phone from the trial with its
 * waiting changes, so an offline Start is stopped before it is queued.
 */
export function localCompleteness(t: Trial): FieldNote[] {
  const out: FieldNote[] = []
  const add = (field: string, message: string) => out.push({ field, message })
  // Step 1, the same words the server and the step 1 gate use.
  for (const g of sieveGate(t)) add(g.field, g.message)

  if (!t.cast_at) add('cast_at', 'Trial date and time is required.')
  if (num0(t.batch_size) === null) add('batch_size', 'Batch size is required.')
  else if (!positive(t.batch_size)) add('batch_size', 'Batch size must be greater than 0.')
  if (!t.admixture_1) add('admixture_1', 'Admixture product is required.')
  if (num0(t.dosage_1) === null) add('dosage_1', 'Admixture dosage is required.')
  else if (!positive(t.dosage_1)) add('dosage_1', 'Admixture dosage must be greater than 0.')
  if (!t.grade_of_concrete) add('grade_of_concrete', 'Grade of concrete is required.')

  const mats = (t.materials ?? {}) as Record<string, Record<string, unknown> | undefined>
  const row = (m: string) => (mats[m] && typeof mats[m] === 'object' ? mats[m]! : {})
  const src = (m: string) => String(row(m).source ?? '').trim()
  const isFilled = (m: string) => !!src(m) || (num0(row(m).ssd) !== null && num0(row(m).ssd) !== 0)
  const label = (m: string) => materialLabel(m, mats)
  // Every mineral admixture row added to the trial needs its source (legacy), and so does a slot with a value.
  for (const m of [...COMPLETENESS_MINERALS, ...Object.keys(mats).filter(isExtraMineral).sort()]) {
    if ((isFilled(m) || String(row(m).name ?? '').trim()) && !src(m)) add(`materials.${m}.source`, `${label(m)}: mineral admixture source is required.`)
  }
  if (!src('cement')) add('materials.cement.source', 'Cement brand is required.')
  if (!String(row('cement').cement_type ?? '').trim()) add('materials.cement.cement_type', 'Type of cement is required.')
  if (!positive(row('cement').ssd)) add('materials.cement.ssd', 'Cement SSD design should be more than zero.')
  if (!positive(row('water').ssd)) add('materials.water.ssd', 'Water SSD design should be more than zero.')
  for (const [pair, either] of [[['20mm', '10mm'], 'Source of the 20 mm or 10 mm aggregate is required.'],
    [['river_sand', 'crushed_sand'], 'Source of river sand or crushed sand is required.']] as const) {
    if (!pair.some((m) => src(m))) { add(`materials.${pair[0]}.source`, either); continue }
    for (const m of pair) {
      if (!isFilled(m)) continue
      if (!src(m)) add(`materials.${m}.source`, `${label(m)}: source is required.`)
      else if (!positive(row(m).ssd)) add(`materials.${m}.ssd`, `${label(m)}: SSD design should be more than zero.`)
    }
  }
  if (src('20mm') && src('10mm') && src('20mm').toLowerCase() !== src('10mm').toLowerCase()) {
    add('materials.20mm.source', '20 mm and 10 mm sources are not equal.')
  }

  if (!Object.values(t.fresh_readings ?? {}).some((v) => num0(v) !== null)) add('fresh_readings', 'At least one slump or flow reading is required.')
  for (const test of SCC_TESTS) {
    const byTime = (t.scc ?? {})[test.key]
    if (byTime && typeof byTime === 'object' && Object.keys(byTime).length && !Object.values(byTime).some((v) => num0(v) !== null)) {
      add(`scc.${test.key}`, `${SCC_NAME[test.key]}: at least one reading is required.`)
    }
  }
  if (num0(t.site_temp) === null) add('site_temp', 'Site temperature is required.')
  else if (!positive(t.site_temp)) add('site_temp', 'Site temperature must be greater than 0.')
  if (num0(t.fresh_density) === null) add('fresh_density', 'Fresh wet density is required.')
  else if (!positive(t.fresh_density)) add('fresh_density', 'Fresh wet density must be greater than 0.')
  if (!t.bleeding) add('bleeding', 'Bleeding is required.')

  for (const [who, l] of [['rd', 'For Thermax R&D'], ['site_qc', 'For site QC in charge'], ['sales', 'For Thermax Sales Person']] as const) {
    if (!String(t[`signatory_${who}`] ?? '').trim() && !String(t[`signature_${who}`] ?? '').trim()) add(`signatory_${who}`, `${l} is required.`)
  }
  return out
}

// --- Server errors on JSON fields -----------------------------------------------------
const MATERIAL_KEY_LABEL: Record<string, string> = {
  ssd: 'SSD design', absorption: 'absorption', moisture: 'moisture', source: 'source', cement_type: 'type of cement',
}

/**
 * Where a nested server error sits, in words: "20 mm, 4.75 mm sieve",
 * "Cement SSD design", "V funnel at 30 min", "Cube 2 load". `body` is what
 * was sent, so a sieve row index can be named by its sieve. Null when the
 * path is a plain field.
 */
export function pathLabel(path: string, body?: Record<string, unknown>): string | null {
  const [head, a, b, c] = path.split('.')
  if (a === undefined) return null
  if (head === 'sieves') {
    const m = `${SIEVE_MATERIAL_LABEL[a as SieveMaterial] ?? a}${a === '20mm' || a === '10mm' ? ' aggregate' : ''}`
    if (b === undefined) return m
    const rows = (body?.sieves as Record<string, { sieve?: string }[]> | undefined)?.[a]
    const sieve = rows?.[Number(b)]?.sieve
    return sieve ? `${m}, ${SIEVE_LABEL[sieve] ?? sieve} sieve${c === 'sieve' ? ' row' : ''}` : `${m}, row ${Number(b) + 1}`
  }
  if (head === 'proportions') return `${SIEVE_MATERIAL_LABEL[a as SieveMaterial] ?? a} proportion`
  if (head === 'materials') {
    const m = materialLabel(a, body?.materials as Record<string, { name?: unknown }> | undefined)
    return b ? `${m} ${MATERIAL_KEY_LABEL[b] ?? b}` : m
  }
  if (head === 'fresh_readings') return `Reading at ${readingLabel(a).toLowerCase()}`
  if (head === 'scc') {
    const t = SCC_TESTS.find((x) => x.key === a)?.label.split(',')[0] ?? a
    return b === undefined ? t : `${t} at ${readingLabel(b).toLowerCase()}`
  }
  if (head === 'cubes') {
    const n = Number(a)
    if (!Number.isInteger(n)) return null
    return b ? `Cube ${n + 1} ${b}` : `Cube ${n + 1}`
  }
  return null
}

/**
 * A refused save's field errors for a step: every nested message by its
 * dotted path (so the cell itself is marked), and each top level field's
 * first message saying where it is ("Cement SSD design: Enter 100000 kg/m³
 * or less."), for the summary under the table.
 */
export function stepErrors(e: unknown, body?: Record<string, unknown>): Record<string, string> {
  const top = fieldErrors(e)
  const deep = fieldErrorsByPath(e)
  const out: Record<string, string> = { ...deep }
  for (const [k, msg] of Object.entries(top)) {
    const nested = Object.keys(deep).find((p) => p.startsWith(`${k}.`) && deep[p] === msg)
    const where = nested ? pathLabel(nested, body) : null
    out[k] = where ? `${where}: ${msg}` : msg
  }
  return out
}

/** {field: message} for a refused Start, as the server's 400 lists them. */
export const asFields = (notes: FieldNote[]) => notes.reduce<Record<string, string[]>>((o, n) => ({ ...o, [n.field]: [...(o[n.field] ?? []), n.message] }), {})

/** "28 days due 25 Nov" style note for an age that has no result yet. */
export function dueNote(castAt: string | null, age: string) {
  if (!castAt) return ''
  return `Due ${shortDate(new Date(new Date(castAt).getTime() + AGES[age][1] * 3_600_000))}`
}

export const pct = (value: number, target: number) => `${num(Math.round((value / target) * 100))}%`
