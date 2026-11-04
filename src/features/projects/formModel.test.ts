import { EMPTY, missingStep1, priceMissing, stepForErrors, toPayload, validate } from './formModel'

describe('project form model', () => {
  it('opens the step that holds the first server error', () => {
    expect(stepForErrors(['sfdc_no', 'cement_grades'])).toBe(1)
    expect(stepForErrors(['selling_basic_price'])).toBe(2)
    expect(stepForErrors(['non_field_errors'])).toBeNull()
  })

  it('needs at least one price above zero to create', () => {
    expect(priceMissing({ selling_basic_price: '', bulk_and_barrel: '0' })).toBe(true)
    expect(priceMissing({ selling_basic_price: '', bulk_and_barrel: '42.5' })).toBe(false)
  })

  it('checks formats like the server', () => {
    const e = validate({ ...EMPTY, sfdc_no: '49318', contact_phone: '98220', potential_cr: '2.505' })
    expect(e.sfdc_no).toMatch('6 digits')
    expect(e.contact_phone).toMatch('10 digit')
    expect(e.potential_cr).toMatch('2 decimals')
    expect(validate({ ...EMPTY, sfdc_no: '049318' })).toEqual({})
  })

  it('asks a Sales Person for everything on step 1 but the owner', () => {
    expect(missingStep1(EMPTY, false)).not.toContain('sales_person')
    expect(missingStep1(EMPTY, true)).toContain('sales_person')
  })

  it('sends lookups as ids or null and the owner only for managers', () => {
    const body = toPayload({ ...EMPTY, region: '3', city: '', sales_person: '9', potential_cr: ' ' }, false)
    expect(body).toMatchObject({ region: 3, city: null, potential_cr: null })
    expect(body).not.toHaveProperty('sales_person')
    expect(toPayload({ ...EMPTY, sales_person: '9' }, true).sales_person).toBe(9)
  })
})
