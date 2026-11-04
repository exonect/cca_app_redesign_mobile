// Client checks on the trial steps, mirroring the server's TrialWriteSerializer
// and save_cubes rules (and stopping text the server would silently drop).
import type { Trial } from '@/shared/types'

import {
  conclusionForm, conclusionProblems, cubeProblem, decimalProblem, freshForm, freshProblems, mixForm, mixProblems,
  SIGNATURE_MAX_CHARS, sieveForm, sieveProblems,
} from './forms'
import { mixWarnings } from './MixStep'

jest.mock('@/api/client', () => ({ api: jest.fn(), ApiError: class extends Error {}, fieldErrors: () => ({}), session: {} }))

const trial = {
  sieves: {}, proportions: {}, materials: {}, fresh_readings: {}, cube_sets: [], cast_at: null, grade_of_concrete: null,
  batch_size: null, admixture_1: null, dosage_1: null, admixture_2: null, dosage_2: null, fresh_test: '', fresh_density: null,
  bleeding: null, setting: null, remarks: '', signatory_sales: '', signatory_site_qc: '', signatory_rd: '',
  signature_sales: '', signature_site_qc: '', signature_rd: '', results: { errors: [] },
} as unknown as Trial

describe('sieve analysis', () => {
  it('blocks text and negative retained weights, allows blanks', () => {
    const f = sieveForm(trial)
    expect(sieveProblems(f)).toEqual({})
    f.sieves.river_sand[2].retained = '12..5'
    expect(sieveProblems(f).sieves).toBe('Enter retained weights as numbers of 0 or more. Check River sand on 1.18 mm.')
    f.sieves.river_sand[2].retained = '-3'
    expect(sieveProblems(f).sieves).toMatch('River sand on 1.18 mm')
    f.sieves.river_sand[2].retained = '12.5'
    expect(sieveProblems(f)).toEqual({})
  })

  it('blocks a proportion that is not a number', () => {
    const f = sieveForm(trial)
    f.proportions['10mm'] = '40%'
    expect(sieveProblems(f).proportions).toBe('Enter the 10 mm proportion as a number.')
  })
})

describe('mix design', () => {
  it('checks dosage and batch size like the server fields', () => {
    const f = { ...mixForm(trial), dosage_1: '10.5', dosage_2: '0.125', batch_size: '0' }
    const e = mixProblems(f)
    expect(e.dosage_1).toBe('Enter the dosage from 0 to 10.')
    expect(e.dosage_2).toBe('Enter the second dosage with up to 2 decimal places.')
    expect(e.batch_size).toBe('Enter the batch size more than 0.')
    expect(mixProblems({ ...f, dosage_1: '0.8', dosage_2: '', batch_size: '0.035' })).toEqual({})
    expect(mixProblems({ ...f, dosage_1: '', dosage_2: '', batch_size: '1000' }).batch_size).toMatch('at most 3 digits before the decimal point')
  })

  it('blocks material quantities that are not numbers', () => {
    const f = mixForm(trial)
    f.materials.river_sand = { ...f.materials.river_sand, moisture: 'wet' }
    expect(mixProblems(f).materials).toBe('Enter River sand moisture as a number.')
  })

  it('shows the server mix warnings with readable material names', () => {
    const t = { ...trial, results: { errors: ['SSD design for river_sand cannot be negative.', '20mm: Retained on 4.75 cannot be negative.'] } } as unknown as Trial
    expect(mixWarnings(t)).toEqual(['SSD design for river sand cannot be negative.'])
  })
})

describe('fresh concrete', () => {
  it('needs readings of 0 or more and a density from 1000 to 3000 with 1 decimal', () => {
    const f = freshForm(trial)
    f.readings['120'] = '-5'
    f.fresh_density = '2450.25'
    expect(freshProblems(f)).toEqual({
      fresh_readings: 'Enter readings in mm as numbers of 0 or more. Check 120 min.',
      fresh_density: 'Enter the density with up to 1 decimal place.',
    })
    expect(freshProblems({ ...f, readings: { ...f.readings, 120: '150' }, fresh_density: '900' }).fresh_density).toBe('Enter the density from 1000 to 3000.')
  })
})

describe('cubes and conclusion', () => {
  it('blocks text or negative cube weights and loads', () => {
    expect(cubeProblem([{ weight: '8.4', load: '702' }, { weight: '', load: 'abc' }, { weight: '', load: '' }])).toBe('Enter weights and loads as numbers of 0 or more. Check cube 2.')
    expect(cubeProblem([{ weight: '8.4', load: '702' }, { weight: '', load: '' }])).toBeNull()
  })

  it('limits signatory names to 150 characters and signatures to the server size', () => {
    const f = { ...conclusionForm(trial), signatory_rd: 'x'.repeat(151), signature_sales: `data:image/png;base64,${'A'.repeat(SIGNATURE_MAX_CHARS)}` }
    expect(conclusionProblems(f)).toEqual({
      signatory_rd: 'Use 150 characters or fewer.',
      signature_sales: 'This signature image is too large. Clear it and sign again.',
    })
  })

  it('reads plain numbers only', () => {
    expect(decimalProblem('1e3', { label: 'the value', decimals: 2 })).toBe('Enter the value as a number.')
    expect(decimalProblem(' 2.5 ', { label: 'the value', decimals: 2 })).toBeNull()
  })
})
