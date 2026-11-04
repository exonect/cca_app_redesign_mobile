// Admin and recipe forms mirror the server's field limits.
import { preview, rowProblem } from '@/features/recipes/balance'
import { recipeSchema } from '@/features/recipes/RecipeScreen'

import { lookupValueProblem, NUMERIC_MESSAGE } from './MasterDataScreen'
import { userSchema } from './UsersScreen'

jest.mock('@/api/client', () => ({ api: jest.fn(), ApiError: class extends Error {}, fieldErrors: () => ({}), session: {} }))
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true } }))

describe('master data values', () => {
  it('trims, needs a value, caps at 200 and takes numbers only on numeric lists', () => {
    expect(lookupValueProblem('   ', false)).toBe('Enter a value.')
    expect(lookupValueProblem('x'.repeat(201), false)).toBe('Use 200 characters or fewer.')
    expect(lookupValueProblem('0.40 ', true)).toBeNull()
    expect(lookupValueProblem('NaN', true)).toBe(NUMERIC_MESSAGE)
    expect(lookupValueProblem('Neutrol  1112 ', false)).toBeNull()
  })
})

describe('users', () => {
  const base = { email: 'a@thermaxglobal.com', emp_id: 'E1', first_name: 'Asha', last_name: '', role: 'SP' as const, region: '', manager: '' }
  it('caps employee ID at 20 and names at 150, and lowercases the email', () => {
    const r = userSchema.safeParse({ ...base, emp_id: 'E'.repeat(21), last_name: 'x'.repeat(151) })
    expect(r.success).toBe(false)
    const paths = r.success ? [] : r.error.issues.map((i) => i.path[0])
    expect(paths).toEqual(expect.arrayContaining(['emp_id', 'last_name']))
    const ok = userSchema.parse({ ...base, email: ' A@ThermaxGlobal.com ' })
    expect(ok.email).toBe('a@thermaxglobal.com')
  })
})

describe('recipes', () => {
  const base = { family: 'neutrol' as const, product_name: 'Neutrol 585', sfdc_no: '', location: '3', customer_name: '', project_name: '', status: 'active' as const }
  it('collapses spaces in the product name and caps it at 100', () => {
    expect(recipeSchema.parse({ ...base, product_name: '  Neutrol   585 ' }).product_name).toBe('Neutrol 585')
    expect(recipeSchema.safeParse({ ...base, product_name: 'x'.repeat(101) }).success).toBe(false)
    expect(recipeSchema.safeParse({ ...base, customer_name: 'x'.repeat(257) }).success).toBe(false)
  })
})

describe('final server rules for master data and recipes', () => {
  it('takes plain numbers only on numeric lists: 6 digits, up to 4 decimals, no sign or exponent', () => {
    for (const ok of ['160', '0.38', '123456', '0.1234']) expect(lookupValueProblem(ok, true)).toBeNull()
    for (const bad of ['-1', '1e3', '1234567', '0.12345', '.5', '1.', '1,000']) expect(lookupValueProblem(bad, true)).toBe(NUMERIC_MESSAGE)
    expect(lookupValueProblem('-1', false)).toBeNull()
  })

  it('refuses recipe percentages over 100, more than 2 decimals and codes over 20 characters', () => {
    expect(rowProblem({ code: 'R101', pct: '100.5' })).toBe('R101 cannot be more than 100%.')
    expect(rowProblem({ code: 'R101', pct: '1.255' })).toBe('R101 can have up to 2 decimal places.')
    expect(rowProblem({ code: 'R101', pct: '1.250' })).toBeNull()
    expect(rowProblem({ code: 'R101', pct: '0.29' })).toBeNull()
    expect(rowProblem({ code: 'X'.repeat(21), pct: '1' })).toBe('Raw material codes are 1 to 20 characters.')
    const p = preview([{ code: 'R101', pct: '12.345' }])
    expect(p.exact).toBe(false)
    expect(p.errors[0]).toBe('R101 can have up to 2 decimal places.')
    expect(preview([{ code: 'R101', pct: '12.34' }]).exact).toBe(true)
  })
})
