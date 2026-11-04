import { countCriteria, criteriaChips, emptyCriteria, fromServer, toRequest, validate } from './criteria'

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
