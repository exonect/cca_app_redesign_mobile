import { withBalance } from '@/shared/calc'
import type { Recipe } from '@/shared/types'

export type Row = { code: string; pct: string }

export const FAMILY_OPTIONS: { value: Recipe['family']; label: string }[] = [
  { value: 'neutrol', label: 'Neutrol' }, { value: 'tecnos', label: 'Tecnos' },
  { value: 'plastard', label: 'Plastard' }, { value: 'other', label: 'Other' },
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

/** Live J000 balance and total, mirroring the server rule (calc.withBalance). */
export function preview(rows: Row[]) {
  const r = withBalance(compositionOf(rows))
  return { ...r, balance: r.parts.J000, exact: r.errors.length === 0 && r.total === 100 && rows.length > 0 }
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
