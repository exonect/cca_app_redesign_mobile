// Same design figures as the backend tests (tests/calc/test_calc.py).
import { admixtureQty, analyse, cementitious, combine, cubeAverage, mix, passingMap, strength, testDue, withBalance } from './calc'

const CRUSHED = [['4.75', 30], ['2.36', 160], ['1.18', 220], ['0.6', 180], ['0.3', 190], ['0.15', 120], ['0.075', 70], ['pan', 30]]
  .map(([sieve, retained]) => ({ sieve: String(sieve), retained }))

const PALAVA = {
  cement: { ssd: 300 }, fly_ash: { ssd: 80 }, ggbs: { ssd: 40 },
  '20mm': { ssd: 546, absorption: '0.50', moisture: '0.00' }, '10mm': { ssd: 455, absorption: '0.60', moisture: '0.40' },
  river_sand: { ssd: 182, absorption: '1.20', moisture: '3.20' }, crushed_sand: { ssd: 637, absorption: '1.80', moisture: '2.80' },
  water: { ssd: 160 }, admixture_1: { ssd: '3.78' },
}

describe('sieve', () => {
  it('matches the crushed sand design figures', () => {
    const r = analyse(CRUSHED)
    expect(r.complete).toBe(true)
    expect(r.rows.map((x) => x.passing)).toEqual([97, 81, 59, 41, 22, 10, 3, 0])
    expect(r.fm).toBe(2.9)
    expect(passingMap(r)['20']).toBe(100)
  })
  it('computes nothing until the sheet is complete', () => {
    expect(analyse([...CRUSHED.slice(0, -1), { sieve: 'pan', retained: '' }]).complete).toBe(false)
  })
  it('requires proportions to total exactly 100', () => {
    const passing = { a: { '20': 100, '10': 50 }, b: { '20': 100, '10': 100 } }
    expect(combine({ a: 40, b: 60 }, passing, { '10': [60, 75] }).points.find((p) => p.sieve === '10')).toMatchObject({ combined: 80, within: false })
    expect(combine({ a: 40, b: 50 }, passing).error).toMatch('total 100%')
  })
})

describe('mix design', () => {
  it('matches Palava trial 3', () => {
    const r = mix(PALAVA, '0.04')
    const by = Object.fromEntries(r.lines.map((l) => [l.material, l]))
    expect(by['20mm'].correction).toBe(-2.73)
    expect(by.crushed_sand.adjusted).toBe(643.37)
    expect(by.crushed_sand.batch).toBe(25.73)
    expect(by.water.adjusted).toBe(153.63)
    expect([r.freeWc, r.totalWc, r.totalSsd, r.totalBatch]).toEqual([0.38, 0.37, 2403.78, 96.15])
    expect(cementitious(PALAVA)).toBe(420)
    expect(admixtureQty(420, '0.9')).toBe(3.78)
  })
})

describe('cubes', () => {
  it('matches the 7 day set and skips blanks', () => {
    expect([702, 688, 715].map((l) => strength(l))).toEqual([31.2, 30.58, 31.78])
    expect(cubeAverage([{ load: 702 }, { load: 688 }, { load: 715 }])).toBe(31.19)
    expect(cubeAverage([{ load: 702 }, { load: '' }])).toBe(31.2)
  })
  it('counts test dates from the cast date', () => {
    expect(testDue('2026-10-28T10:30:00+05:30', '28d').toISOString()).toBe('2026-11-25T05:00:00.000Z')
  })
})

describe('recipe', () => {
  it('balances J000 and rejects over 100', () => {
    expect(withBalance({ J101: '20.5', j401: 5 })).toMatchObject({ parts: { J101: 20.5, J401: 5, J000: 74.5 }, total: 100 })
    expect(withBalance({ J101: 80, J401: 30 }).errors[0]).toMatch('over 100%')
  })
})
