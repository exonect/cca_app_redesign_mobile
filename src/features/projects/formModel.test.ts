import {
  cementitiousOptions, changedFields, EMPTY, missingStep1, priceMissing, requiredAfterDraft, ruleProblems, stepForErrors, toPayload, validate,
} from './formModel'

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

  it('limits whole digits like the server decimal columns', () => {
    expect(validate({ ...EMPTY, potential_cr: '123456789' }).potential_cr).toBe('Enter the potential with at most 8 digits before the decimal point.')
    expect(validate({ ...EMPTY, potential_cr: '12345678.99', selling_basic_price: '1234567890.5' })).toEqual({})
    expect(validate({ ...EMPTY, bulk_and_barrel: '12345678901' }).bulk_and_barrel).toMatch('at most 10 digits')
    expect(validate({ ...EMPTY, potential_cr: '-1' }).potential_cr).toMatch('0 or more')
  })
})

describe('final server rules for projects', () => {
  it('limits remarks to 2000 characters after trimming', () => {
    expect(validate({ ...EMPTY, remarks: 'x'.repeat(2001) }).remarks).toBe('Use 2000 characters or fewer.')
    expect(validate({ ...EMPTY, remarks: ` ${'x'.repeat(2000)} ` })).toEqual({})
  })

  it('allows up to 10 cementitious contents, each once', () => {
    const ten = Array.from({ length: 10 }, (_, i) => 300 + i * 10)
    expect(validate({ ...EMPTY, cementitious_contents: ten })).toEqual({})
    expect(validate({ ...EMPTY, cementitious_contents: [...ten, 500] }).cementitious_contents).toBe('Enter up to 10 cementitious contents.')
    expect(validate({ ...EMPTY, cementitious_contents: [420, 420] }).cementitious_contents).toBe('Each cementitious content can be entered once.')
  })

  it('offers cementitious contents from the master list, keeping unlisted values already on the project', () => {
    const list = [{ id: 1, value: '450' }, { id: 2, value: '400' }, { id: 3, value: '400.5' }] as Parameters<typeof cementitiousOptions>[0]
    expect(cementitiousOptions(list, [380, 400])).toEqual([
      { value: 400, label: '400' }, { value: 450, label: '450' }, { value: 380, label: '380 (not in the list)' },
    ])
  })

  it('mirrors the legacy wizard rules the server checks on submit', () => {
    expect(ruleProblems({ ...EMPTY, customer_name: 'AB', project_name: ' Ok ', contact_person_name: 'Dr. A. Kumar' })).toEqual({
      customer_name: 'Use at least 3 characters.', project_name: 'Use at least 3 characters.',
    })
    for (const ok of ["D'Souza", 'Anne-Marie Lobo', 'José Müller', '']) expect(ruleProblems({ ...EMPTY, contact_person_name: ok })).toEqual({})
    expect(ruleProblems({ ...EMPTY, contact_person_name: 'Prakash 2' }).contact_person_name).toBe('Use letters, spaces, dots, apostrophes and hyphens only.')
    expect(ruleProblems({ ...EMPTY, potential_cr: '0', selling_basic_price: '0.00', bulk_and_barrel: '64' })).toEqual({
      potential_cr: 'Project potential must be more than 0.', selling_basic_price: 'Enter a price above 0, or leave it blank.',
    })
    expect(missingStep1(EMPTY, false)).toContain('remarks')
    expect(changedFields({ ...EMPTY, remarks: 'x' }, EMPTY)).toEqual(['remarks'])
  })

  it('keeps fields required on submit filled once past draft', () => {
    const e = requiredAfterDraft({ ...EMPTY, customer_name: 'Mula' }, false)
    expect(e.customer_name).toBeUndefined()
    expect(e.project_name).toBe('Project name is required once the project is created.')
    expect(e.cement_brands).toBe('Cement brands is required once the project is created.')
    expect(e.selling_basic_price).toBe('Enter a bulk or barrel basic selling price above zero.')
    expect(e.sales_person).toBeUndefined() // set by the server for a Sales Person
    expect(e.admixture_base).toBeUndefined() // optional
    expect(requiredAfterDraft(EMPTY, true).sales_person).toBe('Sales Person is required once the project is created.')
  })
})
