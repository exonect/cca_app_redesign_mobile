import { fieldErrorsByPath } from '@/api/errors'

import {
  badSieveCells, combinedGrading, countCriteria, criteriaChips, emptyCriteria, emptySieve, fromServer, mapServerErrors, readSieve, toRequest,
  validate, writeSieve,
} from './criteria'

describe('search criteria', () => {
  const palava = fromServer({
    cement_grade: ['OPC 53'], grade_of_concrete: ['M40'], wc: ['0.38'], mineral_admixtures: ['fly_ash', 'ggbs'],
    slump: '160', retention_minutes: 120, strength_age: '28d', strength: ['48'], cementitious: ['420'], sand_type: '', sand_zone: ['Zone II'],
  })

  it('prefills from a project and builds the request', () => {
    const req = toRequest(palava)
    expect(req).toMatchObject({ wc: ['0.38'], slump: '160', retention_minutes: 120, strength_age: '28d', strength: ['48'] })
    expect(countCriteria(req)).toBe(8)
  })

  it('shows short chips with tolerances', () => {
    const t = criteriaChips(palava).map((c) => c.text)
    expect(t).toEqual(expect.arrayContaining(['M40', 'OPC 53', 'W/C 0.38 ±0.02', 'Slump 160 ±20 at 2 h', '28 d 48 to 53 N/mm²', 'Binder 420 ±50']))
  })

  it('drops slump without its time and asks for it', () => {
    const c = { ...emptyCriteria(), slump: '160' }
    expect(toRequest(c)).toEqual({})
    expect(validate(c).retention_minutes).toMatch('Choose when')
  })
})

describe('final server rules for search criteria', () => {
  it('needs numbers of 0 or more, at most 20 of them', () => {
    expect(validate({ ...emptyCriteria(), wc: '0.38, -0.40' }).wc).toBe('Enter numbers of 0 or more.')
    expect(validate({ ...emptyCriteria(), cementitious: '0x10' }).cementitious).toBe('0x10 is not a number. Use digits, and commas between values.')
    expect(validate({ ...emptyCriteria(), strength: Array.from({ length: 21 }, (_, i) => String(30 + i)).join(', '), strength_age: '28d' }).strength).toBe('Use up to 20 values.')
    expect(validate({ ...emptyCriteria(), wc: '0.38, 0.40' })).toEqual({})
  })

  it('needs a slump from 0 to 1000 mm and at most 20 values per list', () => {
    expect(validate({ ...emptyCriteria(), slump: '1200', retention_minutes: '120' }).slump).toBe('Enter a slump or flow from 0 to 1000 mm.')
    expect(validate({ ...emptyCriteria(), slump: '-5', retention_minutes: '120' }).slump).toBe('Enter a slump or flow from 0 to 1000 mm.')
    expect(validate({ ...emptyCriteria(), slump: '160', retention_minutes: '120' })).toEqual({})
    const many = Array.from({ length: 21 }, (_, i) => `Brand ${i}`)
    expect(validate({ ...emptyCriteria(), cement_brand: many }).cement_brand).toBe('Use up to 20 values.')
  })
})

describe('sieve analysis (all in grading), as the web', () => {
  // The web test case: 40% 20 mm and 60% crushed sand.
  const sieve = writeSieve({
    proportions: { '20mm': '40', crushed_sand: '60' },
    passing: { '20mm': { 20: '95' }, crushed_sand: { 20: '100', 0.6: '45.5' } },
  })
  const all = { 20: '98.00', 10: '0.00', 4.75: '0.00', 2.36: '0.00', 1.18: '0.00', 0.6: '27.30', 0.3: '0.00', 0.15: '0.00' }

  it('combines passing x proportion / 100 per sieve, blank as 0, 2 decimals', () => {
    expect(combinedGrading(readSieve(sieve))).toEqual(all)
    expect(combinedGrading({ proportions: { river_sand: '33.333' }, passing: { river_sand: { 4.75: '99.5' } } })?.['4.75']).toBe('33.17')
    expect(combinedGrading(emptySieve())).toBeNull()
    // Proportions alone grade nothing.
    expect(combinedGrading({ proportions: { '20mm': '100' }, passing: {} })).toBeNull()
  })

  it('sends the grading as one more criterion and shows a chip', () => {
    const c = { ...emptyCriteria(), sieve }
    const req = toRequest(c)
    expect(req).toEqual({ grading: all })
    expect(countCriteria(req)).toBe(1)
    expect(criteriaChips(c).map((x) => x.text)).toEqual(['All in grading, exact'])
    expect(writeSieve({ proportions: { '20mm': ' ' }, passing: { '20mm': { 20: '' } } })).toBe('')
    expect(toRequest({ ...emptyCriteria(), sieve: 'not json' })).toEqual({})
  })

  it('needs every entry a number from 0 to 100 and each combined sieve at most 100%', () => {
    const v = (proportions: Record<string, string>, passing: Record<string, Record<string, string>>) =>
      validate({ ...emptyCriteria(), sieve: writeSieve({ proportions, passing }) }).sieve
    expect(v({}, { '10mm': { 4.75: '120' } })).toBe('Enter the 10 mm passing the 4.75 mm sieve as a percent from 0 to 100.')
    expect(v({}, { river_sand: { 0.6: '-5' } })).toBe('Enter the river sand passing the 600 µm sieve as a percent from 0 to 100.')
    expect(v({ crushed_sand: 'abc' }, { crushed_sand: { 20: '100' } })).toBe('Enter the crushed sand proportion as a percent from 0 to 100.')
    expect(v({ '20mm': '70', crushed_sand: '60' }, { '20mm': { 20: '100' }, crushed_sand: { 20: '100' } }))
      .toBe('The combined passing on the 20 mm sieve is 130.00%, over 100%. Check the proportions: together they should make 100%.')
    expect(v({ '20mm': '40', crushed_sand: '60' }, { '20mm': { 20: '100' }, crushed_sand: { 20: '100' } })).toBeUndefined()
  })

  it('marks the cells that are wrong', () => {
    expect(badSieveCells({ proportions: { '10mm': '101', river_sand: '50' }, passing: { river_sand: { 0.3: 'x', 0.15: '5' } } }))
      .toEqual({ proportions: ['10mm'], passing: { river_sand: ['0.3'] }, allIn: [] })
    expect(badSieveCells({ proportions: { '20mm': '70', crushed_sand: '60' }, passing: { '20mm': { 20: '100' }, crushed_sand: { 20: '100', 10: '100' } } }).allIn)
      .toEqual(['20'])
  })

  it('starts empty when filled from a project, as the web', () => {
    expect(fromServer({ wc: ['0.38'], grading: { 20: '98' } }).sieve).toBe('')
  })
})

describe('server errors on the criteria', () => {
  it('lands a per sieve grading error on that sieve', () => {
    const byPath = fieldErrorsByPath({ status: 400, code: 'invalid', message: 'Some fields need attention.', fields: { grading: { 4.75: ['Too high.'] } } })
    expect(byPath).toEqual({ 'grading.4.75': 'Too high.' })
    expect(mapServerErrors(byPath)).toEqual({ fields: { sieve: 'Too high.' }, grading: { '4.75': 'Too high.' }, other: [] })
  })

  it('places a grading message that names a sieve, and maps the other criteria', () => {
    const r = mapServerErrors({
      grading: 'Enter the percent passing the 600 µm sieve from 0 to 100.', wc: 'Enter numbers of 0 or more.', 'strength.0': 'Bad.', project: 'Project not found.',
    })
    expect(r.grading).toEqual({ 0.6: 'Enter the percent passing the 600 µm sieve from 0 to 100.' })
    expect(r.fields).toEqual({ sieve: 'Enter the percent passing the 600 µm sieve from 0 to 100.', wc: 'Enter numbers of 0 or more.', strength: 'Bad.' })
    expect(r.other).toEqual(['Project not found.'])
    expect(mapServerErrors({ grading: 'Send the all in grading as sieve and percent passing pairs.' }).grading).toEqual({})
  })
})
