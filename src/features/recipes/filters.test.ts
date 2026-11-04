import { isoDate, maskDate, recipeQuery } from './filters'

it('reads dd/mm/yyyy dates and masks typing', () => {
  expect(maskDate('04112026')).toBe('04/11/2026')
  expect(isoDate('04/11/2026')).toBe('2026-11-04')
  expect(isoDate('31/02/2026')).toBeNull()
  expect(isoDate('04/11')).toBeNull()
  expect(isoDate('')).toBe('')
})

it('lists newest first and sends status and complete dates only', () => {
  expect(recipeQuery({ search: '', family: '', status: 'on_hold', from: '01/10/2026', to: '15/10' })).toEqual({
    search: undefined, family: undefined, status: 'on_hold', created_from: '2026-10-01', created_to: undefined, ordering: '-created_at',
  })
})
