// Same design figures as the backend tests (tests/calc/test_calc.py).
import { admixtureQty, analyse, cementitious, combine, cubeAverage, fp, gradingAverage, MATERIALS, mix, passingMap, strength, testDue, withBalance } from './calc'

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
  it('shows 0 % retained and 100 % passing when every weight is 0 (legacy)', () => {
    const r = analyse(CRUSHED.map((x) => ({ ...x, retained: '0' })))
    expect(r.complete).toBe(true)
    expect(new Set(r.rows.map((x) => x.cumPct))).toEqual(new Set([0]))
    expect(new Set(r.rows.map((x) => x.passing))).toEqual(new Set([100]))
    expect(r.fm).toBe(0)
  })
  it('averages the grading limits as (min + max) / 2 (legacy All in grading table)', () => {
    expect(gradingAverage([95, 100])).toBe(97.5)
    expect(gradingAverage([0, 6])).toBe(3)
  })
  it('requires proportions to total exactly 100', () => {
    const passing = { a: { '20': 100, '10': 50 }, b: { '20': 100, '10': 100 } }
    expect(combine({ a: 40, b: 60 }, passing, { '10': [60, 75] }).points.find((p) => p.sieve === '10')).toMatchObject({ combined: 80, within: false })
    expect(combine({ a: 40, b: 50 }, passing).error).toMatch('total 100%')
  })
})

describe('mix design', () => {
  it('lists materials in the legacy order', () => {
    expect(MATERIALS).toEqual(['fly_ash', 'ggbs', 'alcofine', 'microsilica', 'fiber', 'cement', '20mm', '10mm', 'river_sand',
      'crushed_sand', 'admixture_1', 'admixture_2', 'water'])
    expect(mix(PALAVA, '0.04').lines.map((l) => l.material)).toEqual(MATERIALS)
  })
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
    // Legacy trace amounts (0.005 %) are kept at 3 decimals.
    expect(withBalance({ J101: '0.005', J401: '20.5' })).toMatchObject({ parts: { J101: 0.005, J401: 20.5, J000: 79.495 }, total: 100, errors: [] })
    expect(withBalance({ J101: '0.0055' }).errors).toEqual(['J101 can have up to 3 decimal places.'])
    expect([fp(0.005), fp(20.5), fp(79.495)]).toEqual(['0.005', '20.50', '79.495'])
  })
})

describe('legacy parity', () => {
  it('default sieve sets give all eight combined grading points', async () => {
    const { SIEVE_SETS } = jest.requireActual<typeof import('./calc')>('./calc')
    const weights: Record<string, number[]> = {
      '20mm': [0, 3600, 1300, 100, 0, 0, 0, 0, 0], '10mm': [0, 150, 2700, 120, 30, 0, 0, 0, 0],
      crushed_sand: [0, 0, 30, 160, 220, 180, 190, 120, 70, 30],
    }
    const passing = Object.fromEntries(Object.entries(weights).map(([m, w]) => [m, passingMap(analyse(SIEVE_SETS[m].map((sieve, i) => ({ sieve, retained: w[i] }))))]))
    expect(combine({ '20mm': 35, '10mm': 25, crushed_sand: 40 }, passing).points).toHaveLength(8)
  })
  it('fiber is a material outside W/C and cementitious, with no correction', () => {
    const r = mix({ ...PALAVA, fiber: { ssd: '0.9' } }, '0.04')
    const fiber = r.lines.find((l) => l.material === 'fiber')!
    expect([fiber.adjusted, fiber.batch, r.freeWc]).toEqual([0.9, 0.04, 0.38])
    expect(cementitious({ ...PALAVA, fiber: { ssd: '0.9' } })).toBe(420)
  })
})
