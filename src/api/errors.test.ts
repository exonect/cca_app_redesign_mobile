import { errorMessage, fieldErrorsByPath, GENERIC, NOT_FOUND, SERVER, UserError } from './errors'

const apiError = (status: number, message: string, fields: Record<string, unknown> = {}, code = 'error') =>
  Object.assign(new Error(message), { status, code, fields })

describe('errorMessage', () => {
  it('keeps the server sentence for business rules and validation', () => {
    expect(errorMessage(apiError(409, 'Only a draft can be submitted, by its Sales Person or a manager.', {}, 'not_allowed')))
      .toBe('Only a draft can be submitted, by its Sales Person or a manager.')
  })

  it('uses the first field message when a 400 has no matching input', () => {
    expect(errorMessage(apiError(400, 'Some fields need attention.', { project: ['Project not found.'] }))).toBe('Project not found.')
  })

  it('never shows raw text for 5xx, and says plainly when something is gone', () => {
    expect(errorMessage(apiError(500, 'IntegrityError at /api'))).toBe(SERVER)
    expect(errorMessage(apiError(404, 'Not found.'))).toBe(NOT_FOUND)
  })

  it('hides programming errors behind a generic sentence but keeps messages written for people', () => {
    expect(errorMessage(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(GENERIC)
    expect(errorMessage(new UserError('Sharing is not available on this device.'))).toBe('Sharing is not available on this device.')
    expect(errorMessage('boom', 'The PDF could not be made. Try again.')).toBe('The PDF could not be made. Try again.')
  })
})

describe('fieldErrorsByPath', () => {
  it('gives every nested message by its dotted path and keeps dotted keys from a refused Start', () => {
    expect(fieldErrorsByPath(apiError(400, 'Some fields need attention.', {
      materials: { cement: { ssd: ['Enter 100000 kg/m³ or less.'] } },
      sieves: { '20mm': { 2: { retained: ['Retained weight cannot be negative.'] } } },
      cubes: [{}, { load: ['Ensure this value is less than or equal to 100000.'] }],
      'materials.cement.source': ['Cement brand is required.'],
      remarks: ['Use 1000 characters or fewer.'],
    }))).toEqual({
      'materials.cement.ssd': 'Enter 100000 kg/m³ or less.',
      'sieves.20mm.2.retained': 'Retained weight cannot be negative.',
      'cubes.1.load': 'Ensure this value is less than or equal to 100000.',
      'materials.cement.source': 'Cement brand is required.',
      remarks: 'Use 1000 characters or fewer.',
    })
    expect(fieldErrorsByPath(new Error('x'))).toEqual({})
  })
})
