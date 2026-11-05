/**
 * Product search criteria: form state <-> URL <-> POST /search/ body.
 * Tolerances live on the server (cca/search/service.py); the constants
 * here only explain them to people.
 */
import { AGES } from './calc'

export const LIST_KEYS = [
  'cement_brand', 'cement_grade', 'grade_of_concrete', 'mineral_admixtures', 'sand_zone',
  'fine_aggregate_source', 'coarse_aggregate_source',
] as const
/** `sieve` holds the sieve analysis table as JSON text (see SieveInput), so it round trips through the URL. */
export const TEXT_KEYS = ['wc', 'cementitious', 'sand_type', 'slump', 'retention_minutes', 'strength_age', 'strength', 'family', 'sieve'] as const

type ListKey = (typeof LIST_KEYS)[number]
type TextKey = (typeof TEXT_KEYS)[number]
export type Criteria = Record<ListKey, string[]> & Record<TextKey, string>
export type SearchRequest = Record<string, string | number | string[] | Record<string, string>>

export const WC_TOL = 0.02
export const SLUMP_TOL = 20
export const STRENGTH_UP = 5
export const CEMENTITIOUS_TOL = 50

export const MINERALS = [
  { value: 'fly_ash', label: 'Fly ash' }, { value: 'ggbs', label: 'GGBS' },
  { value: 'alcofine', label: 'Alcofine' }, { value: 'microsilica', label: 'Microsilica' },
]
export const SAND_TYPES = [
  { value: 'river', label: 'River sand' }, { value: 'crushed', label: 'Crushed sand' }, { value: 'both', label: 'River or crushed' },
]
export const FAMILIES = [
  { value: '', label: 'Any' }, { value: 'neutrol', label: 'Neutrol' }, { value: 'tecnos', label: 'Tecnos' }, { value: 'plastard', label: 'Plastard' },
]
/** Fresh readings are recorded at these minutes (trials READING_MINUTES). */
export const RETENTION_MINUTES = [0, 30, 60, 90, 120, 150, 180, 210, 240]
export function minutesLabel(m: number | string) {
  const x = Number(m)
  if (x === 0) return 'Initial'
  return x < 60 ? `${x} min` : `${x / 60} h`
}
export const STRENGTH_AGES = Object.entries(AGES).map(([value, [label]]) => ({ value, label }))

export function emptyCriteria(): Criteria {
  return {
    ...(Object.fromEntries(LIST_KEYS.map((k) => [k, []])) as unknown as Record<ListKey, string[]>),
    ...(Object.fromEntries(TEXT_KEYS.map((k) => [k, ''])) as Record<TextKey, string>),
  }
}

/**
 * Sieve analysis step of the legacy web search: % passing of each aggregate
 * on the 8 all in grading sieves and the aggregate proportions give the
 * combined grading, sum of passing x proportion / 100 per sieve, blank as 0
 * and rounded to 2 decimals. The server keeps past trials whose stored all
 * in grading equals it on every sieve (legacy compared the same way).
 */
export const GRADING_SIEVES = [
  { key: '20', label: '20 mm' }, { key: '10', label: '10 mm' }, { key: '4.75', label: '4.75 mm' }, { key: '2.36', label: '2.36 mm' },
  { key: '1.18', label: '1.18 mm' }, { key: '0.6', label: '600 µm' }, { key: '0.3', label: '300 µm' }, { key: '0.15', label: '150 µm' },
] as const
export const GRADING_MATERIALS = [
  { key: '20mm', label: '20 mm' }, { key: '10mm', label: '10 mm' }, { key: 'river_sand', label: 'River sand' }, { key: 'crushed_sand', label: 'Crushed sand' },
] as const
export type SieveInput = { proportions: Record<string, string>; passing: Record<string, Record<string, string>> }

export function emptySieve(): SieveInput {
  return { proportions: {}, passing: {} }
}

export function readSieve(text: string): SieveInput {
  if (!text) return emptySieve()
  try {
    const v = JSON.parse(text) as Partial<SieveInput>
    return { proportions: { ...(v.proportions ?? {}) }, passing: { ...(v.passing ?? {}) } }
  } catch {
    return emptySieve()
  }
}

function sieveEntered(s: SieveInput) {
  return Object.values(s.passing).some((row) => Object.values(row ?? {}).some((v) => String(v).trim() !== ''))
}

/** "" when nothing is entered, so the URL stays short. */
export function writeSieve(s: SieveInput): string {
  const hasProportion = Object.values(s.proportions).some((v) => String(v).trim() !== '')
  return sieveEntered(s) || hasProportion ? JSON.stringify(s) : ''
}

const pct = (v: string | undefined) => {
  const n = Number(String(v ?? '').trim())
  return String(v ?? '').trim() === '' || !Number.isFinite(n) ? 0 : n
}

/** Combined all in grading per sieve (2 decimals), or null when no % passing is entered. */
export function combinedGrading(s: SieveInput): Record<string, string> | null {
  if (!sieveEntered(s)) return null
  const out: Record<string, string> = {}
  for (const sv of GRADING_SIEVES) {
    let total = 0
    for (const m of GRADING_MATERIALS) total += pct(s.passing[m.key]?.[sv.key]) * pct(s.proportions[m.key]) / 100
    out[sv.key] = total.toFixed(2)
  }
  return out
}

/** First problem in the sieve table: every entry a number from 0 to 100. */
export function sieveError(s: SieveInput): string | undefined {
  const bad = (v: string | undefined) => {
    const t = String(v ?? '').trim()
    if (!t) return false
    const n = Number(t)
    return !PLAIN_NUMBER.test(t) || !Number.isFinite(n) || n > 100
  }
  for (const m of GRADING_MATERIALS) {
    if (bad(s.proportions[m.key])) return `Enter the ${m.label.toLowerCase()} proportion as a percent from 0 to 100.`
    for (const sv of GRADING_SIEVES) {
      if (bad(s.passing[m.key]?.[sv.key])) return `Enter the ${m.label.toLowerCase()} passing the ${sv.label} sieve as a percent from 0 to 100.`
    }
  }
  // The server takes the combined passing of each sieve from 0 to 100 only (proportions over 100% in total push it above).
  const over = Object.entries(combinedGrading(s) ?? {}).find(([, v]) => Number(v) > 100)
  if (over) {
    const label = GRADING_SIEVES.find((x) => x.key === over[0])?.label ?? over[0]
    return `The combined passing on the ${label} sieve is ${over[1]}%, over 100%. Check the proportions: together they should make 100%.`
  }
  return undefined
}

/** "0.38, 0.40" -> ["0.38", "0.40"] */
export function splitNumbers(text: string): string[] {
  return text.split(/[,\s;]+/).map((s) => s.trim()).filter(Boolean)
}

/** Server limits on each list criterion. */
export const LIST_MAX = 20
export const VALUE_MAX = 200
const PLAIN_NUMBER = /^[+]?(\d+\.?\d*|\.\d+)$/

/** Returns an error message when the text has an entry that is not a number of 0 or more (server rule). */
export function numberError(text: string): string | undefined {
  const items = splitNumbers(text)
  if (items.length > LIST_MAX) return `Use up to ${LIST_MAX} values.`
  if (items.some((s) => s.length > VALUE_MAX)) return `Each value can be up to ${VALUE_MAX} characters.`
  const negative = items.find((s) => /^-(\d+\.?\d*|\.\d+)$/.test(s))
  if (negative) return `${negative} is below 0. Enter numbers of 0 or more.`
  const bad = items.filter((s) => !PLAIN_NUMBER.test(s))
  return bad.length ? `${bad[0]} is not a number. Use digits, and commas between values.` : undefined
}

export function fromParams(sp: URLSearchParams): Criteria {
  const c = emptyCriteria()
  for (const k of LIST_KEYS) c[k] = sp.getAll(k).filter(Boolean)
  for (const k of TEXT_KEYS) c[k] = sp.get(k) ?? ''
  return c
}

export function toParams(c: Criteria, extra: Record<string, string | null | undefined> = {}): URLSearchParams {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(extra)) if (v) sp.set(k, v)
  for (const k of LIST_KEYS) c[k].forEach((v) => sp.append(k, v))
  for (const k of TEXT_KEYS) if (c[k].trim()) sp.set(k, c[k].trim())
  return sp
}

/** The POST /search/ body: only criteria that will actually filter. */
export function toRequest(c: Criteria): SearchRequest {
  const out: SearchRequest = {}
  for (const k of LIST_KEYS) if (c[k].length) out[k] = [...c[k]]
  const wc = splitNumbers(c.wc)
  if (wc.length) out.wc = wc
  const cem = splitNumbers(c.cementitious)
  if (cem.length) out.cementitious = cem
  if (c.sand_type) out.sand_type = c.sand_type
  if (c.family) out.family = c.family
  // Slump needs its retention time and strength needs its age, as on the server.
  if (c.slump.trim() && c.retention_minutes !== '') {
    out.slump = c.slump.trim()
    out.retention_minutes = Number(c.retention_minutes)
  }
  const strength = splitNumbers(c.strength)
  if (c.strength_age && strength.length) {
    out.strength_age = c.strength_age
    out.strength = strength
  }
  const grading = combinedGrading(readSieve(c.sieve))
  if (grading) out.grading = grading
  return out
}

/** Number of criteria a request applies (slump with its time counts once, strength with its age once). */
export function countCriteria(req: SearchRequest): number {
  return Object.keys(req).filter((k) => k !== 'retention_minutes' && k !== 'strength_age').length
}

/** Criteria the server returns after prefilling from a project. */
export function fromServer(raw: Record<string, unknown>): Criteria {
  const c = emptyCriteria()
  const list = (v: unknown): string[] =>
    v === null || v === undefined || v === '' ? [] : Array.isArray(v) ? v.map(String).filter(Boolean) : [String(v)]
  for (const k of LIST_KEYS) c[k] = list(raw[k])
  for (const k of TEXT_KEYS) c[k] = list(raw[k]).join(', ')
  c.family = list(raw.family)[0] ?? ''
  c.sand_type = list(raw.sand_type)[0] ?? ''
  c.strength_age = list(raw.strength_age)[0] ?? ''
  c.retention_minutes = list(raw.retention_minutes)[0] ?? ''
  c.sieve = ''
  return c
}

const fmt = (x: number, digits: number) => (digits ? x.toFixed(digits).replace(/\.?0+$/, '') : x.toFixed(0))

/** Plain language for what a numeric criterion matches. */
export function rangeHint(kind: 'wc' | 'cementitious' | 'strength', text: string): string | undefined {
  const values = splitNumbers(text).map(Number).filter(Number.isFinite)
  if (!values.length) return undefined
  const ranges = values.map((v) =>
    kind === 'wc' ? `${fmt(Math.max(0, v - WC_TOL), 2)} to ${fmt(v + WC_TOL, 2)}`
      : kind === 'cementitious' ? `${fmt(v - CEMENTITIOUS_TOL, 0)} to ${fmt(v + CEMENTITIOUS_TOL, 0)} kg/m³`
        : `${fmt(v, 2)} to ${fmt(v + STRENGTH_UP, 2)} N/mm²`)
  return ranges.join(', or ')
}

export type Errors = Partial<Record<keyof Criteria, string>>

export function validate(c: Criteria): Errors {
  const e: Errors = {}
  for (const k of ['wc', 'cementitious', 'strength'] as const) {
    const msg = numberError(c[k])
    if (msg) e[k] = msg
  }
  for (const k of LIST_KEYS) if (c[k].length > LIST_MAX) e[k] = `Use up to ${LIST_MAX} values.`
  const slump = c.slump.trim()
  if (slump && !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(slump)) e.slump = 'Enter the slump in mm, as a number.'
  else if (slump && (Number(slump) < 0 || Number(slump) > 1000)) e.slump = 'Enter a slump or flow from 0 to 1000 mm.'
  if (c.slump.trim() && c.retention_minutes === '') e.retention_minutes = 'Choose when the slump is measured.'
  if (splitNumbers(c.strength).length && !c.strength_age) e.strength_age = 'Choose the age the strength is for.'
  const sieve = sieveError(readSieve(c.sieve))
  if (sieve) e.sieve = sieve
  return e
}
