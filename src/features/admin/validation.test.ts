// Admin and recipe forms mirror the server's field limits.
import { recipeSchema } from '@/features/recipes/RecipeScreen'

import { lookupValueProblem } from './MasterDataScreen'
import { userSchema } from './UsersScreen'

jest.mock('@/api/client', () => ({ api: jest.fn(), ApiError: class extends Error {}, fieldErrors: () => ({}), session: {} }))
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true } }))

describe('master data values', () => {
  it('trims, needs a value, caps at 200 and takes numbers only on numeric lists', () => {
    expect(lookupValueProblem('   ', false)).toBe('Enter a value.')
    expect(lookupValueProblem('x'.repeat(201), false)).toBe('Use 200 characters or fewer.')
    expect(lookupValueProblem('0.40 ', true)).toBeNull()
    expect(lookupValueProblem('NaN', true)).toBe('This list only accepts numbers.')
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
