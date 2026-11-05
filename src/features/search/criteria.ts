/**
 * Product search criteria: form state <-> POST /search/ body, plus the short chip
 * labels shown on the phone. Tolerances live on the server (cca/search/service.py);
 * the constants here only explain them. Same rules as the web criteria.ts.
 */
import { AGES } from '@/shared/calc'
import {
  combinedGrading, emptySieve, GRADING_MATERIALS, GRADING_SIEVES, readSieve, sieveError, writeSieve, type SieveInput,
} from '@/shared/searchCriteria'

// Sieve analysis (all in grading) comes from the web's criteria.ts, synced
// into src/shared by scripts/sync-shared.mjs, so both apps compute it alike.
export { combinedGrading, emptySieve, GRADING_MATERIALS, GRADING_SIEVES, readSieve, sieveError, writeSieve, type SieveInput }

export const LIST_KEYS = [
  'cement_brand', 'cement_grade', 'grade_of_concrete', 'mineral_admixtures', 'sand_zone',
  'fine_aggregate_source', 'coarse_aggregate_source',
] as const
/** `sieve` holds the sieve analysis table as JSON text (see SieveInput), as on the web. */
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
  { value: '', label: 'Any sand' }, { value: 'river', label: 'River sand' }, { value: 'crushed', label: 'Crushed sand' }, { value: 'both', label: 'River or crushed' },
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

/** "0.38, 0.40" -> ["0.38", "0.40"] */
export function splitNumbers(text: string): string[] {
  return text.split(/[,\s;]+/).map((s) => s.trim()).filter(Boolean)
}

/** Server limits for search criteria (cca/search/api.py). */
export const LIST_MAX = 20
export const VALUE_MAX = 200
export const SLUMP_MAX = 1000
const NUMBER = /^-?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/

/** wc, cementitious and strength: up to 20 numbers of 0 or more. */
export function numberError(text: string): string | undefined {
  const items = splitNumbers(text)
  const bad = items.filter((s) => !NUMBER.test(s) || !Number.isFinite(Number(s)))
  if (bad.length) return `${bad[0]} is not a number. Use digits, and commas between values.`
  if (items.some((s) => Number(s) < 0)) return 'Enter numbers of 0 or more.'
  if (items.length > LIST_MAX) return `Use up to ${LIST_MAX} values.`
  if (items.some((s) => s.length > VALUE_MAX)) return `Each value can be up to ${VALUE_MAX} characters.`
  return undefined
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
  // A project's requirement has no sieve analysis (the web clears it too).
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
  const slump = c.slump.trim()
  if (slump && (!NUMBER.test(slump) || !Number.isFinite(Number(slump)))) e.slump = 'Enter the slump in mm, as a number.'
  else if (slump && (Number(slump) < 0 || Number(slump) > SLUMP_MAX)) e.slump = `Enter a slump or flow from 0 to ${SLUMP_MAX} mm.`
  if (c.slump.trim() && c.retention_minutes === '') e.retention_minutes = 'Choose when the slump is measured.'
  if (splitNumbers(c.strength).length && !c.strength_age) e.strength_age = 'Choose the age the strength is for.'
  for (const k of LIST_KEYS) if (c[k].length > LIST_MAX) e[k] = `Use up to ${LIST_MAX} values.`
  const sieve = sieveError(readSieve(c.sieve))
  if (sieve) e.sieve = sieve
  return e
}

/** Where a sieve analysis entry is wrong, so the cell can be marked: the same rule as sieveError, cell by cell. */
export function badSieveCells(s: SieveInput): { proportions: string[]; passing: Record<string, string[]>; allIn: string[] } {
  const out = { proportions: [] as string[], passing: {} as Record<string, string[]>, allIn: [] as string[] }
  for (const m of GRADING_MATERIALS) {
    if (sieveError({ proportions: { [m.key]: s.proportions[m.key] ?? '' }, passing: {} })) out.proportions.push(m.key)
    for (const sv of GRADING_SIEVES) {
      if (sieveError({ proportions: {}, passing: { [m.key]: { [sv.key]: s.passing[m.key]?.[sv.key] ?? '' } } })) {
        (out.passing[m.key] ??= []).push(sv.key)
      }
    }
  }
  // Only when every entry is a number does the combined grading say anything.
  if (!out.proportions.length && !Object.keys(out.passing).length) {
    out.allIn = Object.entries(combinedGrading(s) ?? {}).filter(([, v]) => Number(v) > 100).map(([k]) => k)
  }
  return out
}

/** Criteria keys the server knows by another name. */
const SERVER_KEY: Record<string, keyof Criteria> = { grading: 'sieve' }

export type ServerErrors = {
  /** Messages for the criteria inputs, by criteria key. */
  fields: Errors
  /** Messages on the combined all in grading of one sieve, by sieve key ("4.75"). */
  grading: Record<string, string>
  /** Messages no input shows. */
  other: string[]
}

/**
 * Lays a 400 from POST /search/ onto the criteria form. Takes the server's
 * fields by dotted path (fieldErrorsByPath): "wc", "grading" or a per sieve
 * "grading.4.75". The server checks the combined grading, so a sieve message
 * marks that sieve's All in value; a "grading" message that names a sieve
 * ("the 4.75 mm sieve") is placed on it too.
 */
export function mapServerErrors(byPath: Record<string, string>): ServerErrors {
  const out: ServerErrors = { fields: {}, grading: {}, other: [] }
  const known = new Set<string>([...LIST_KEYS, ...TEXT_KEYS])
  for (const [path, msg] of Object.entries(byPath)) {
    if (path === 'grading' || path.startsWith('grading.')) {
      const rest = path.slice('grading.'.length)
      const sieve = GRADING_SIEVES.find((sv) => sv.key === rest)
        ?? (path === 'grading' ? GRADING_SIEVES.find((sv) => msg.includes(`${sv.label} sieve`)) : undefined)
      if (sieve) out.grading[sieve.key] ??= msg
      out.fields.sieve ??= msg
      continue
    }
    const top = path.split('.')[0]
    const key = SERVER_KEY[top] ?? (known.has(top) ? (top as keyof Criteria) : undefined)
    if (key) out.fields[key] ??= msg
    else out.other.push(msg)
  }
  return out
}

const ageShort = (age: string) => (AGES[age]?.[0] ?? age).replace(/ days?$/, ' d')

/** Short chips for the criteria row, each with a spoken label. Only criteria that filter. */
export function criteriaChips(c: Criteria): { text: string; label: string }[] {
  const chips: { text: string; label: string }[] = []
  const add = (text: string, label: string) => chips.push({ text, label })
  if (c.grade_of_concrete.length) add(c.grade_of_concrete.join(', '), `grade of concrete, ${c.grade_of_concrete.join(' or ')}`)
  if (c.cement_grade.length) add(c.cement_grade.join(', '), `cement grade, ${c.cement_grade.join(' or ')}`)
  if (c.cement_brand.length) add(c.cement_brand.join(', '), `cement brand, ${c.cement_brand.join(' or ')}`)
  const wc = splitNumbers(c.wc)
  if (wc.length) add(`W/C ${wc.join(', ')} ±${WC_TOL}`, `free W/C, ${wc.join(' or ')} plus or minus ${WC_TOL}`)
  if (c.slump.trim() && c.retention_minutes !== '') {
    const at = minutesLabel(c.retention_minutes)
    add(`Slump ${c.slump.trim()} ±${SLUMP_TOL} ${Number(c.retention_minutes) ? `at ${at}` : 'initial'}`, `slump, ${c.slump.trim()} plus or minus ${SLUMP_TOL} millimetres, ${at.toLowerCase()}`)
  }
  const st = splitNumbers(c.strength)
  if (c.strength_age && st.length) {
    const lo = Math.min(...st.map(Number))
    const hi = Math.max(...st.map(Number)) + STRENGTH_UP
    add(`${ageShort(c.strength_age)} ${fmt(lo, 2)} to ${fmt(hi, 2)} N/mm²`, `strength at ${AGES[c.strength_age]?.[0] ?? c.strength_age}, ${fmt(lo, 2)} to ${fmt(hi, 2)} newtons per square millimetre`)
  }
  const cem = splitNumbers(c.cementitious)
  if (cem.length) add(`Binder ${cem.join(', ')} ±${CEMENTITIOUS_TOL}`, `cementitious content, ${cem.join(' or ')} plus or minus ${CEMENTITIOUS_TOL} kilograms per cubic metre`)
  if (c.mineral_admixtures.length) {
    const names = c.mineral_admixtures.map((m) => MINERALS.find((x) => x.value === m)?.label ?? m)
    add(names.join(', '), `mineral admixtures, ${names.join(' or ')}`)
  }
  if (c.sand_type) {
    const t = SAND_TYPES.find((s) => s.value === c.sand_type)?.label ?? c.sand_type
    add(t, `sand type, ${t}`)
  }
  if (c.sand_zone.length) add(c.sand_zone.join(', '), `sand zone, ${c.sand_zone.join(' or ')}`)
  if (c.fine_aggregate_source.length) add(c.fine_aggregate_source.join(', '), `fine aggregate source, ${c.fine_aggregate_source.join(' or ')}`)
  if (c.coarse_aggregate_source.length) add(c.coarse_aggregate_source.join(', '), `coarse aggregate source, ${c.coarse_aggregate_source.join(' or ')}`)
  if (c.family) {
    const f = FAMILIES.find((x) => x.value === c.family)?.label ?? c.family
    add(`${f} only`, `product family, ${f}`)
  }
  if (combinedGrading(readSieve(c.sieve))) add('All in grading, exact', 'all in grading from the sieve analysis, exact to 2 decimals on every sieve')
  return chips
}
