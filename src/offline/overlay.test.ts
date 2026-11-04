// The trial as the phone shows it: server copy plus the changes waiting to sync.
import type { Trial, TrialListItem } from '@/shared/types'

import { applyPatch, draftListItems, listItemView, trialView } from './overlay'
import type { Op } from './queue'

const base = { userId: 7, createdAt: '2026-11-04T06:00:00.000Z', state: 'pending' as const, attempts: 0 }
const createOp: Op = { ...base, id: 'q1', kind: 'create_trial', trialId: 'local-1', project: 'p1', projectName: 'Palava towers', customerName: 'Konkan' }

function server(over: Partial<Trial> = {}): Trial {
  const draft = trialView(undefined, [createOp])!
  return { ...draft, id: 't1', code: null, grade_of_concrete: { id: 3, value: 'M40' }, ...over }
}

describe('trial view', () => {
  it('builds a draft for a trial made on the phone', () => {
    const t = trialView(undefined, [createOp])!
    expect(t).toMatchObject({ id: 'local-1', project: 'p1', project_name: 'Palava towers', status: 'draft', code: null })
    expect(t.actions).toMatchObject({ edit: true, start: true, close: false, attach: true })
  })

  it('lays waiting edits on the server copy in order, naming chosen ids from the cache', () => {
    const ops: Op[] = [
      { ...base, id: 'a', kind: 'patch_trial', trialId: 't1', body: { batch_size: '0.04', admixture_1: 12, dosage_1: '0.8', grade_of_concrete: 3 } },
      { ...base, id: 'b', kind: 'patch_trial', trialId: 't1', body: { dosage_1: '0.9', bleeding: 5 } },
      { ...base, id: 'c', kind: 'put_cubes', trialId: 't1', age: '7d', body: { cubes: [{ weight: '8.4', load: '700' }] } },
    ]
    const labels = (field: string, id: number) => ({ admixture_1: { 12: 'Neutrol 585 V3' }, bleeding: { 5: 'Nil' } } as Record<string, Record<number, string>>)[field]?.[id]
    const t = trialView(server(), ops, labels)!
    expect(t).toMatchObject({ batch_size: '0.04', dosage_1: '0.9', product: 'Neutrol 585 V3' })
    expect(t.admixture_1).toEqual({ id: 12, value: 'Neutrol 585 V3' })
    expect(t.grade_of_concrete).toEqual({ id: 3, value: 'M40' }) // same id keeps the server's name
    expect(t.bleeding).toEqual({ id: 5, value: 'Nil' })
    expect(t.cube_sets).toEqual([{ age: '7d', age_label: '7 days', cubes: [{ weight: '8.4', load: '700' }], average: null, tested_on: null }])
  })

  it('shows a queued start as in progress, still without a number', () => {
    const t = trialView(server({ cast_at: '2026-11-03T10:00:00+05:30' }), [{ ...base, id: 's', kind: 'start_trial', trialId: 't1' }])!
    expect(t).toMatchObject({ status: 'in_progress', code: null })
    // Steps are read only once started (legacy edit rule); close stays open.
    expect(t.actions).toMatchObject({ start: false, close: true, edit: false })
  })

  it('clears a choice', () => {
    expect(applyPatch(server(), { grade_of_concrete: null }).grade_of_concrete).toBeNull()
  })

  it('has nothing to show for an unknown trial with no changes', () => {
    expect(trialView(undefined, [])).toBeUndefined()
  })
})

describe('lists', () => {
  it('lists trials made on the phone for their project', () => {
    const other: Op = { ...createOp, id: 'q2', trialId: 'local-2', project: 'p2' }
    expect(draftListItems([createOp, other], 'p1').map((t) => t.id)).toEqual(['local-1'])
  })

  it('shows a queued start and trial date on a list row', () => {
    const row = { id: 't1', status: 'draft', status_label: 'Draft', cast_at: null } as TrialListItem
    const ops: Op[] = [
      { ...base, id: 'a', kind: 'patch_trial', trialId: 't1', body: { cast_at: '2026-11-03T10:00:00+05:30' } },
      { ...base, id: 'b', kind: 'start_trial', trialId: 't1' },
    ]
    expect(listItemView(row, ops)).toMatchObject({ status: 'in_progress', cast_at: '2026-11-03T10:00:00+05:30' })
  })
})
