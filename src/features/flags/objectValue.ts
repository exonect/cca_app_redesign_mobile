/** Same rules as the web app (src/features/flags/objectValue.ts there). Editing a flag that covers a whole object (value_json): aggregate proportions,
 * a recipe composition or a project's cementitious contents. Pure helpers for FlagBanner. */
import { fp, RECIPE_PLACES, withBalance } from '@/shared/calc'
import type { CorrectedValue, RecordFlag as FlagBrief } from '@/shared/typesExt'

export type ObjectKind = 'proportions' | 'components' | 'list' | 'map'
export type ObjectRow = { key: string; label: string; value: string; balance?: boolean }

const BALANCE = 'J000'
export const CONTENTS_MAX = 10
const NUMBER = /^\d+(\.\d+)?$/

/** Null for a flag on one value (edited as text). */
export function objectKind(flag: FlagBrief): ObjectKind | null {
  const v = flag.value_json
  if (v === null || v === undefined || typeof v !== 'object') return null
  if (Array.isArray(v)) return 'list'
  if (flag.field === 'proportions') return 'proportions'
  if (flag.field === 'components') return 'components'
  return 'map'
}

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v))

export function initialRows(flag: FlagBrief, kind: ObjectKind): ObjectRow[] {
  const v = flag.value_json
  if (Array.isArray(v)) return v.map((x, i) => ({ key: String(i), label: contentLabel(i), value: text(x) }))
  const labels = flag.value_labels ?? {}
  const rows = Object.entries(v ?? {}).map(([key, x]) => ({
    key, label: labels[key] ?? key, value: text(x), balance: kind === 'components' && key.trim().toUpperCase() === BALANCE,
  }))
  // The balance is always worked out, and always shown last.
  if (kind === 'components' && !rows.some((r) => r.balance)) rows.push({ key: BALANCE, label: `${BALANCE} (balance)`, value: '', balance: true })
  return [...rows.filter((r) => !r.balance), ...rows.filter((r) => r.balance)]
}

export const contentLabel = (i: number) => `Cementitious content ${i + 1}`

/** List rows are keyed by position, so keys and labels follow the order after an add or remove. */
export function renumber(rows: ObjectRow[]): ObjectRow[] {
  return rows.map((r, i) => ({ ...r, key: String(i), label: contentLabel(i) }))
}

const f2 = (x: number) => x.toFixed(2)

/** Live total for proportions and compositions (both must come to exactly 100.00%), else null. */
export function totals(kind: ObjectKind, rows: ObjectRow[]): { total: string; balance?: string; problem?: string } | null {
  if (kind === 'proportions') {
    const entered = rows.map((r) => r.value.trim()).filter((v) => v !== '' && NUMBER.test(v))
    const sum = Math.round(entered.reduce((s, v) => s + Number(v), 0) * 100) / 100
    return { total: f2(sum), problem: entered.length && sum !== 100 ? `Proportions must total 100%. They total ${f2(sum)}%.` : undefined }
  }
  if (kind === 'components') {
    const others = rows.filter((r) => !r.balance && r.value.trim() !== '' && NUMBER.test(r.value.trim()))
    const { parts, total } = withBalance(Object.fromEntries(others.map((r) => [r.key, r.value.trim()])))
    const sum = others.reduce((s, r) => s + Number(r.value.trim()), 0)
    return {
      total: fp(sum > 100 ? sum : total),
      balance: fp(parts[BALANCE] ?? 0),
      problem: sum > 100 ? `Raw materials total ${f2(sum)}%, which is over 100%. Reduce them so ${BALANCE} is 0 or more.` : undefined,
    }
  }
  return null
}

/** Problems the server would refuse anyway, per row key, before sending. */
export function rowProblems(kind: ObjectKind, rows: ObjectRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of rows) {
    if (r.balance) continue
    const v = r.value.trim()
    if (v === '') { if (kind === 'list') out[r.key] = 'Enter a number, or remove this row.'; continue }
    if (!NUMBER.test(v)) { out[r.key] = 'Enter a number.'; continue }
    if (kind === 'list' && !/^\d+$/.test(v)) out[r.key] = 'Enter a whole number.'
    else if (kind !== 'list' && (v.split('.')[1] ?? '').replace(/0+$/, '').length > (kind === 'components' ? RECIPE_PLACES : 2)) {
      out[r.key] = `Use up to ${kind === 'components' ? RECIPE_PLACES : 2} decimal places.`
    }
  }
  return out
}

/** The structured value to send: blank entries are left out (on a composition that removes the code);
 * the J000 balance is never sent, the server works it out. */
export function payload(kind: ObjectKind, rows: ObjectRow[]): CorrectedValue {
  if (kind === 'list') return rows.map((r) => r.value.trim())
  return Object.fromEntries(rows.filter((r) => !r.balance && r.value.trim() !== '').map((r) => [r.key, r.value.trim()]))
}

/** Whether the rows still say what was recorded. */
export function unchanged(flag: FlagBrief, kind: ObjectKind, rows: ObjectRow[]): boolean {
  const before = initialRows(flag, kind)
  const norm = (rs: ObjectRow[]) => JSON.stringify(rs.filter((r) => !r.balance).map((r) => [r.key, r.value.trim()]))
  return norm(before) === norm(rows)
}

/**
 * Server errors on the value, by row key. The API nests them under value
 * ({"value": {"river_sand": [...]}}, a list by position {"value": {"1": [...]}});
 * a flat "value.river_sand" key is read the same way. What is not tied to a row comes back as `rest`.
 */
export function serverErrors(deep: Record<string, string>, rows: ObjectRow[]): { byKey: Record<string, string>; rest?: string } {
  const byKey: Record<string, string> = {}
  let unmatched: string | undefined
  for (const [path, msg] of Object.entries(deep)) {
    if (!path.startsWith('value.')) continue
    const key = path.slice('value.'.length)
    const row = rows.find((r) => r.key === key) ?? rows.find((r) => r.key.toUpperCase() === key.toUpperCase())
    if (row) byKey[row.key] ??= msg
    else unmatched ??= msg
  }
  return { byKey, rest: unmatched ?? (Object.keys(byKey).length ? undefined : deep.value) }
}

/** Every message of a 400 response by dotted path: {"value": {"river_sand": ["..."]}} -> {"value.river_sand": "..."}, plus "value" itself. */
export function deepFieldErrors(e: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (v: unknown, path: string) => {
    if (v === null || v === undefined) return
    if (typeof v === 'string') { if (path) out[path] ??= v; return }
    if (Array.isArray(v)) {
      if (v.every((x) => typeof x === 'string')) { if (v[0] && path) out[path] ??= v[0] as string; return }
      v.forEach((x, i) => walk(x, path ? `${path}.${i}` : String(i)))
      return
    }
    if (typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k)
  }
  walk((e as { fields?: unknown } | null)?.fields, '')
  return out
}
