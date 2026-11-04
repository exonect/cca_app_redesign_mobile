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
