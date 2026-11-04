import { n, RECIPE_PLACES, withBalance } from '@/shared/calc'
import type { Recipe } from '@/shared/types'

export type Row = { code: string; pct: string }

/** The families users choose, as in the legacy app ("Other" is only on imported legacy recipes). */
export const FAMILY_OPTIONS: { value: Recipe['family']; label: string }[] = [
  { value: 'neutrol', label: 'Neutrol' }, { value: 'tecnos', label: 'Tecnos' }, { value: 'plastard', label: 'Plastard' },
]
export const STATUS_OPTIONS: { value: Recipe['status']; label: string }[] = [
  { value: 'active', label: 'Active' }, { value: 'on_hold', label: 'On hold' },
]

export function compositionOf(rows: Row[]) {
  return Object.fromEntries(rows.map((r) => [r.code, r.pct]))
}

export function rowsOf(components: Record<string, string>): Row[] {
  return Object.entries(components).filter(([k]) => k.toUpperCase() !== 'J000').map(([code, pct]) => ({ code, pct: String(pct) }))
}

export const RM_CODE_MAX = 20

/** What the server refuses in one row (cca/calc/recipe.py with_balance and the
 * code length check), beyond blank and negative which withBalance reports. */
export function rowProblem(r: Row): string | null {
  const code = r.code.trim().toUpperCase()
  if (!code || code.length > RM_CODE_MAX) return `Raw material codes are 1 to ${RM_CODE_MAX} characters.`
  const x = n(r.pct)
  if (x === null || x < 0) return null
  if (x > 100) return `${code} cannot be more than 100%.`
  if (Math.abs(x * 10 ** RECIPE_PLACES - Math.round(x * 10 ** RECIPE_PLACES)) > 1e-6) return `${code} can have up to ${RECIPE_PLACES} decimal places.`
  return null
}

/** Live J000 balance and total, mirroring the server rule (calc.withBalance plus the row checks). */
export function preview(rows: Row[]) {
  const r = withBalance(compositionOf(rows))
  const errors = [...rows.map(rowProblem).filter((x): x is string => !!x), ...r.errors]
  return { ...r, errors, balance: r.parts.J000, exact: errors.length === 0 && r.total === 100 && rows.length > 0 }
}

/** Composition bar segments: the largest codes, the rest folded into "n more codes", J000 last. */
const PALETTE = ['#231F20', '#2F5F8F', '#0F7B5C', '#E59A3A', '#8A4A06', '#1F4568']
export function segments(components: Record<string, string | number>, max = 4) {
  const entries = Object.entries(components).map(([k, v]) => [k.toUpperCase(), Number(v)] as const).filter(([, v]) => Number.isFinite(v))
  const balance = entries.find(([k]) => k === 'J000')?.[1] ?? 0
  const others = entries.filter(([k, v]) => k !== 'J000' && v > 0).sort((a, b) => b[1] - a[1])
  const top = others.slice(0, max)
  const rest = others.slice(max)
  const out = top.map(([code, pct], i) => ({ code, pct, color: PALETTE[i % PALETTE.length], note: '' }))
  if (rest.length) {
    out.push({
      code: `${rest.length} more ${rest.length === 1 ? 'code' : 'codes'}`, pct: rest.reduce((s, [, v]) => s + v, 0), color: '#9AA2A9',
      note: rest.map(([k, v]) => `${k} ${v}%`).join(', '),
    })
  }
  out.push({ code: 'J000', pct: balance, color: '#D5D9DC', note: 'balance' })
  return out
}
