/**
 * Live preview mirror of the backend calculation engine (cca/calc). The
 * server always recomputes on save and is the source of truth; this exists
 * so numbers update as people type. Keep the two in step: calc.test.ts
 * asserts the same design figures as tests/calc/test_calc.py.
 */

export function n(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim().replace(/,/g, '')
  if (s === '') return null
  const x = Number(s)
  return Number.isFinite(x) ? x : null
}

/** Round half up to 2 decimals (matches Python Decimal ROUND_HALF_UP). */
export function r2(x: number): number {
  const sign = x < 0 ? -1 : 1
  return (sign * Math.round(Math.abs(x) * 100 + 1e-9)) / 100
}

export const f2 = (x: number | null | undefined) => (x === null || x === undefined ? '' : r2(x).toFixed(2))

// --- Sieves ---------------------------------------------------------------------
export const SIEVES: [string, string][] = [
  ['40', '40 mm'], ['20', '20 mm'], ['12.5', '12.5 mm'], ['10', '10 mm'], ['4.75', '4.75 mm'], ['2.36', '2.36 mm'],
  ['1.18', '1.18 mm'], ['0.6', '600 µm'], ['0.3', '300 µm'], ['0.15', '150 µm'], ['0.075', '75 µm'], ['pan', 'Pan'],
]
export const SIEVE_LABEL = Object.fromEntries(SIEVES)
const ORDER = Object.fromEntries(SIEVES.map(([k], i) => [k, i]))
export const FM_SIEVES = ['4.75', '2.36', '1.18', '0.6', '0.3', '0.15']
export const GRADING_SIEVES = ['20', '10', '4.75', '2.36', '1.18', '0.6', '0.3', '0.15']

/**
 * Default sieve sets per material, as on the legacy lab sheet: every sieve of
 * the combined all in grading (20 mm down to 150 µm) on every material, so
 * all eight grading points can be computed. Coarse aggregates end in the pan
 * (the legacy last row, shown as Pan); sands have 75 µm and the pan.
 */
const COARSE_SIEVES = ['20', '10', '4.75', '2.36', '1.18', '0.6', '0.3', '0.15', 'pan']
const SAND_SIEVES = ['20', '10', '4.75', '2.36', '1.18', '0.6', '0.3', '0.15', '0.075', 'pan']
export const SIEVE_SETS: Record<string, string[]> = {
  '20mm': COARSE_SIEVES,
  '10mm': COARSE_SIEVES,
  river_sand: SAND_SIEVES,
  crushed_sand: SAND_SIEVES,
}

export type SieveOut = { sieve: string; retained: number | null; cum: number | null; cumPct: number | null; passing: number | null }

export function analyse(rows: { sieve: string; retained: unknown }[]) {
  const parsed = rows.filter((r) => r.sieve in ORDER).map((r) => ({ sieve: r.sieve, retained: n(r.retained) }))
    .sort((a, b) => ORDER[a.sieve] - ORDER[b.sieve])
  const complete = parsed.length > 0 && parsed.every((r) => r.retained !== null && r.retained >= 0)
  const total = parsed.reduce((s, r) => s + (r.retained ?? 0), 0)
  if (!complete || total === 0) {
    return { rows: parsed.map((r) => ({ ...r, cum: null, cumPct: null, passing: null })) as SieveOut[], total: r2(total), complete: false, fm: null as number | null }
  }
  let running = 0
  const out: SieveOut[] = parsed.map((r) => {
    running += r.retained!
    const pct = (running / total) * 100
    return { sieve: r.sieve, retained: r.retained, cum: r2(running), cumPct: r2(pct), passing: r2(100 - pct) }
  })
  const by = Object.fromEntries(out.map((r) => [r.sieve, r]))
  const fm = FM_SIEVES.every((k) => k in by) ? r2(FM_SIEVES.reduce((s, k) => s + by[k].cumPct!, 0) / 100) : null
  return { rows: out, total: r2(total), complete: true, fm }
}

export function passingMap(result: ReturnType<typeof analyse>): Record<string, number> {
  if (!result.complete) return {}
  const out: Record<string, number> = Object.fromEntries(result.rows.map((r) => [r.sieve, r.passing!]))
  const coarsest = Math.min(...result.rows.map((r) => ORDER[r.sieve]))
  SIEVES.slice(0, coarsest).forEach(([k]) => { out[k] = 100 })
  return out
}

export function combine(proportions: Record<string, unknown>, passing: Record<string, Record<string, number>>, limits?: Record<string, [number, number]>) {
  const props = Object.fromEntries(Object.entries(proportions).map(([m, p]) => [m, n(p) ?? 0]))
  const total = Object.values(props).reduce((s, p) => s + p, 0)
  if (r2(total) !== 100) return { points: [], error: `Proportions must total 100%. They total ${f2(total)}%.` }
  const points = GRADING_SIEVES.flatMap((sieve) => {
    let value = 0
    for (const [m, pct] of Object.entries(props)) {
      if (pct === 0) continue
      const p = passing[m]?.[sieve]
      if (p === undefined) return []
      value += (pct * p) / 100
    }
    const lim = limits?.[sieve]
    return [{ sieve, combined: r2(value), lower: lim?.[0] ?? null, upper: lim?.[1] ?? null, within: lim ? r2(value) >= lim[0] && r2(value) <= lim[1] : null }]
  })
  return { points, error: null as string | null }
}

// --- Mix design -------------------------------------------------------------------
export const AGGREGATES = ['20mm', '10mm', 'river_sand', 'crushed_sand']
export const BINDERS = ['cement', 'fly_ash', 'ggbs', 'alcofine', 'microsilica']
/** Mineral admixtures that are not binders (legacy master value Fiber): no correction, not in W/C. */
export const OTHER_MINERALS = ['fiber']
export const MATERIALS = [...BINDERS, ...OTHER_MINERALS, ...AGGREGATES, 'water', 'admixture_1', 'admixture_2']
export const WC_BINDERS = ['cement', 'fly_ash', 'ggbs', 'alcofine'] // legacy rule, open question Q4
export const MATERIAL_LABEL: Record<string, string> = {
  cement: 'Cement', fly_ash: 'Fly ash', ggbs: 'GGBS', alcofine: 'Alcofine', microsilica: 'Microsilica', fiber: 'Fiber',
  '20mm': '20 mm', '10mm': '10 mm', river_sand: 'River sand', crushed_sand: 'Crushed sand', water: 'Water',
  admixture_1: 'Admixture I', admixture_2: 'Admixture II',
}

type MixIn = Record<string, { ssd?: unknown; absorption?: unknown; moisture?: unknown } | undefined>
export type MixLine = { material: string; ssd: number | null; difference: number | null; correction: number | null; adjusted: number | null; batch: number | null }

export function mix(materials: MixIn, batchSize: unknown) {
  const batch = n(batchSize)
  const lines: Record<string, MixLine> = {}
  const raw: number[] = []
  for (const m of MATERIALS) {
    const d = materials[m] ?? {}
    const ssd = n(d.ssd)
    const line: MixLine = { material: m, ssd, difference: null, correction: null, adjusted: null, batch: null }
    if (AGGREGATES.includes(m)) {
      const abs = n(d.absorption), moi = n(d.moisture)
      if (ssd !== null && abs !== null && moi !== null) {
        const corr = (ssd * (moi - abs)) / 100
        line.difference = r2(moi - abs); line.correction = r2(corr); line.adjusted = r2(ssd + corr); raw.push(corr)
      } else if (ssd !== null) line.adjusted = r2(ssd)
    } else if (m !== 'water' && ssd !== null) line.adjusted = r2(ssd)
    lines[m] = line
  }
  const water = lines.water
  if (water.ssd !== null) {
    const corr = -raw.reduce((s, x) => s + x, 0)
    water.correction = r2(corr); water.adjusted = r2(water.ssd + corr)
  }
  for (const l of Object.values(lines)) if (batch && batch > 0 && l.adjusted !== null) l.batch = r2(l.adjusted * batch)
  const sum = (k: keyof MixLine) => {
    const v = Object.values(lines).map((l) => l[k] as number | null).filter((x): x is number => x !== null)
    return v.length ? r2(v.reduce((s, x) => s + x, 0)) : null
  }
  const binderSsd = WC_BINDERS.reduce((s, b) => s + (lines[b].ssd ?? 0), 0)
  const binderAdj = WC_BINDERS.reduce((s, b) => s + (lines[b].adjusted ?? 0), 0)
  return {
    lines: MATERIALS.map((m) => lines[m]), totalSsd: sum('ssd'), totalAdjusted: sum('adjusted'), totalBatch: sum('batch'),
    freeWc: water.ssd !== null && binderSsd ? r2(water.ssd / binderSsd) : null,
    totalWc: water.adjusted !== null && binderAdj ? r2(water.adjusted / binderAdj) : null,
  }
}

export const cementitious = (materials: MixIn) => r2(BINDERS.reduce((s, b) => s + (n(materials[b]?.ssd) ?? 0), 0))
/** Dosage % of binder as kg/m³: a suggestion only; the admixture quantity is the one typed (legacy rule). */
export const admixtureQty = (binder: number, dosage: unknown) => (n(dosage) === null ? null : r2((binder * n(dosage)!) / 100))

// --- Cubes ------------------------------------------------------------------------
export const AGES: Record<string, [string, number]> = {
  '12h': ['12 h', 12], '16h': ['16 h', 16], '18h': ['18 h', 18], '20h': ['20 h', 20], '1d': ['1 day', 24],
  '3d': ['3 days', 72], '5d': ['5 days', 120], '7d': ['7 days', 168], '28d': ['28 days', 672],
}
export const STANDARD_AGES = ['1d', '3d', '7d', '28d']

export function strength(load: unknown, side = 150) {
  const l = n(load)
  return l === null || l <= 0 ? null : r2((l * 1000) / (side * side))
}

export function cubeAverage(cubes: { load?: unknown }[]) {
  const s = cubes.map((c) => strength(c.load)).filter((x): x is number => x !== null)
  return s.length ? r2(s.reduce((a, b) => a + b, 0) / s.length) : null
}

export function testDue(castAt: string | Date, age: string) {
  return new Date(new Date(castAt).getTime() + AGES[age][1] * 3_600_000)
}

// --- Recipes --------------------------------------------------------------------------
/** Significant decimal places of a typed number ("28.50" has 1, as Decimal compares it). */
function decimalPlaces(v: unknown): number {
  const frac = String(v).trim().replace(/,/g, '').split('.')[1] ?? ''
  return frac.replace(/0+$/, '').length
}

export function withBalance(components: Record<string, unknown>) {
  const parts: Record<string, number> = {}
  const errors: string[] = []
  if (Object.keys(components).some((code) => code.trim() === '' || code.trim().length > 20)) {
    errors.push('Raw material codes are 1 to 20 characters.')
  }
  for (const [code, v] of Object.entries(components)) {
    const c = code.trim().toUpperCase()
    if (c === 'J000') continue
    const x = n(v)
    if (x === null) { errors.push(`Enter a percentage for ${c}.`); continue }
    if (x < 0) { errors.push(`${c} cannot be negative.`); continue }
    if (x > 100) { errors.push(`${c} cannot be more than 100%.`); continue }
    if (c in parts) { errors.push(`${c} is listed twice.`); continue }
    if (decimalPlaces(v) > 2) { errors.push(`${c} can have up to 2 decimal places.`); continue }
    parts[c] = r2(x)
  }
  const others = Object.values(parts).reduce((s, x) => s + x, 0)
  let balance = 100 - others
  if (r2(balance) < 0) { errors.push(`Raw materials total ${f2(others)}%, which is over 100%. Reduce them so J000 is 0 or more.`); balance = 0 }
  parts.J000 = r2(balance)
  return { parts, errors, total: r2(Object.values(parts).reduce((s, x) => s + x, 0)) }
}
