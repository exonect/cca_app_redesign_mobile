/** Which cube tests of a trial fall due today (IST), as the server's morning reminder decides:
 * the standard ages plus any recorded set, skipping sets that already have an average. After a
 * trial closes only the 28 day result is still expected. The server's due_at wins when present. */
import { AGES, STANDARD_AGES, testDue } from '@/shared/calc'
import type { Trial } from '@/shared/types'

import { istDay } from '@/features/projects/format'

export type CubeDue = { age: string; label: string; dueAt: string }

export function cubesDueToday(t: Pick<Trial, 'status' | 'cast_at' | 'results'>, now: Date = new Date()): CubeDue[] {
  if (!t.cast_at || t.status === 'draft') return []
  const sets = t.results?.cubes ?? {}
  const ages = t.status === 'closed' ? ['28d'] : [...new Set([...STANDARD_AGES, ...Object.keys(sets)])]
  const today = istDay(now)
  const out: CubeDue[] = []
  for (const age of ages) {
    if (!(age in AGES)) continue
    const set = sets[age]
    if (set?.average !== null && set?.average !== undefined) continue
    const due = set?.due_at ?? testDue(t.cast_at, age).toISOString()
    if (istDay(due) === today) out.push({ age, label: AGES[age][0], dueAt: due })
  }
  return out.sort((a, b) => AGES[a.age][1] - AGES[b.age][1])
}

/** "7 day cubes today", "1 day and 3 day cubes today" */
export function dueLabel(due: CubeDue[]) {
  if (!due.length) return ''
  const names = due.map((d) => d.label.replace(/ days?$/, ' day'))
  return `${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`} cubes today`
}
