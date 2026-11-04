import { preview, segments } from './balance'

describe('recipe balance', () => {
  it('fills J000 to 100 as the user types', () => {
    const p = preview([{ code: 'J101', pct: '32' }, { code: 'J203', pct: '18' }, { code: 'J301', pct: '12.5' }])
    expect(p.balance).toBe(37.5)
    expect(p.total).toBe(100)
    expect(p.exact).toBe(true)
  })
  it('refuses a composition over 100', () => {
    const p = preview([{ code: 'J101', pct: '70' }, { code: 'J203', pct: '40' }])
    expect(p.exact).toBe(false)
    expect(p.errors[0]).toMatch('over 100%')
  })
  it('is not exact while a quantity is blank', () => {
    expect(preview([{ code: 'J101', pct: '' }]).exact).toBe(false)
  })
  it('folds small codes into one bar segment, J000 last', () => {
    const s = segments({ J101: '32', J203: '18', J301: '12', J1101: '8', J401: '6', J502: '4', J000: '20' })
    expect(s.map((x) => x.code)).toEqual(['J101', 'J203', 'J301', 'J1101', '2 more codes', 'J000'])
    expect(s[4].pct).toBe(10)
  })
})
