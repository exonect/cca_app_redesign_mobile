import { cubesDueToday, dueLabel } from './cubesDue'

const cube = (due_at: string | null, average: string | null = null) => ({ rows: [], average, due_at })

describe('cube tests due today', () => {
  // 4 Nov 2026, 10:00 IST
  const now = new Date('2026-11-04T04:30:00Z')

  it('finds the 7 day set of a trial cast on 28 Oct (IST)', () => {
    const due = cubesDueToday({ status: 'in_progress', cast_at: '2026-10-28T11:00:00+05:30', results: { cubes: {} } as never }, now)
    expect(due.map((d) => d.age)).toEqual(['7d'])
    expect(dueLabel(due)).toBe('7 day cubes today')
  })

  it('skips sets that already have results and uses the server due date', () => {
    const results = { cubes: { '7d': cube('2026-11-04T11:00:00+05:30', '31.19'), '5d': cube('2026-11-04T09:00:00+05:30') } }
    const due = cubesDueToday({ status: 'in_progress', cast_at: '2026-10-28T11:00:00+05:30', results: results as never }, now)
    expect(due.map((d) => d.age)).toEqual(['5d'])
  })

  it('counts the IST day, not the UTC day', () => {
    // cast 4 Nov 01:00 IST (3 Nov UTC) -> 1 day set due 5 Nov IST
    const due = cubesDueToday({ status: 'in_progress', cast_at: '2026-11-03T19:30:00Z', results: { cubes: {} } as never }, now)
    expect(due).toEqual([])
  })

  it('expects only the 28 day set after closing, and nothing for drafts', () => {
    const cast = '2026-10-07T10:00:00+05:30'
    expect(cubesDueToday({ status: 'closed', cast_at: cast, results: { cubes: {} } as never }, now).map((d) => d.age)).toEqual(['28d'])
    expect(cubesDueToday({ status: 'draft', cast_at: cast, results: { cubes: {} } as never }, now)).toEqual([])
  })
})
