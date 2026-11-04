// Client checks on the trial steps, mirroring the server's TrialWriteSerializer
// and save_cubes rules (and stopping text the server would silently drop).
import type { Trial } from '@/shared/types'

import { planUploads } from './attachments'
import { CAST_ERRORS, castParts, isFutureDay } from './castAt'
import {
  conclusionForm, conclusionProblems, cubeProblem, decimalProblem, decimalTotal, freshForm, freshProblems, mixForm, mixProblems,
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
    expect(mixProblems({ ...f, admixture_1: '7', dosage_1: '0.8', dosage_2: '', batch_size: '0.035' })).toEqual({})
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

describe('final server rules for trial steps', () => {
  it('needs proportions from 0 to 100 that total exactly 100.00 once any is entered', () => {
    const f = sieveForm(trial)
    f.proportions = { '20mm': '40', '10mm': '20', river_sand: '', crushed_sand: '39.99' }
    expect(sieveProblems(f).proportions).toBe('Proportions must total 100%. They total 99.99%.')
    f.proportions.crushed_sand = '40'
    expect(sieveProblems(f)).toEqual({})
    f.proportions = { '20mm': '33.33', '10mm': '33.33', river_sand: '33.34', crushed_sand: '' }
    expect(sieveProblems(f)).toEqual({})
    f.proportions = { '20mm': '120', '10mm': '-20', river_sand: '', crushed_sand: '' }
    expect(sieveProblems(f).proportions).toBe('Enter the 20 mm proportion from 0 to 100.')
  })

  it('rounds the proportion total like the server (half to even, 2 places)', () => {
    expect(decimalTotal(['50', '49.995'])).toBe('100.00')
    expect(decimalTotal(['50', '50.005'])).toBe('100.00')
    expect(decimalTotal(['50', '50.015'])).toBe('100.02')
    expect(decimalTotal(['0.1', '0.2'])).toBe('0.30')
    expect(decimalTotal(['', 'abc'])).toBe('0.00')
  })

  it('caps retained weights at 100000 g', () => {
    const f = sieveForm(trial)
    f.sieves['20mm'][0].retained = '100001'
    expect(sieveProblems(f).sieves).toMatch(/^Enter retained weights of 100000 g or less\. Check 20 mm on /)
    f.sieves['20mm'][0].retained = '100000'
    expect(sieveProblems(f)).toEqual({})
  })

  it('keeps the trial date out of the future and filled once started', () => {
    const later = new Date(Date.now() + 3 * 86_400_000)
    const p = castParts(later.toISOString())
    const f = { ...mixForm(trial), cast_date: p.date, cast_time: p.time }
    expect(mixProblems(f).cast_at).toBe(CAST_ERRORS.future)
    const today = castParts(new Date().toISOString())
    expect(mixProblems({ ...f, cast_date: today.date, cast_time: '23:59' }).cast_at).toBeUndefined()
    expect(mixProblems({ ...f, cast_date: '', cast_time: '' }, 'draft').cast_at).toBeUndefined()
    expect(mixProblems({ ...f, cast_date: '', cast_time: '' }, 'in_progress').cast_at).toBe(CAST_ERRORS.cleared)
    expect(isFutureDay('01/01/2027', new Date('2026-12-31T19:00:00Z'))).toBe(false) // already 1 Jan in IST
    expect(isFutureDay('02/01/2027', new Date('2026-12-31T19:00:00Z'))).toBe(true)
  })

  it('needs the product before its dosage', () => {
    const f = { ...mixForm(trial), dosage_1: '0.8', dosage_2: '0.5' }
    const e = mixProblems(f)
    expect(e.dosage_1).toBe('Choose the product before entering its dosage.')
    expect(e.dosage_2).toBe('Choose the product before entering its dosage.')
    expect(mixProblems({ ...f, admixture_1: '3', admixture_2: '4' })).toEqual({})
  })

  it('checks SSD 0 to 3000, absorption and moisture 0 to 100, and source text up to 100', () => {
    const f = mixForm(trial)
    f.materials.cement = { ...f.materials.cement, ssd: '3000.5' }
    expect(mixProblems(f).materials).toBe('Enter Cement SSD design from 0 to 3000 kg/m³.')
    f.materials.cement = { ...f.materials.cement, ssd: '380' }
    f.materials.river_sand = { ...f.materials.river_sand, absorption: '101' }
    expect(mixProblems(f).materials).toBe('Enter River sand absorption from 0 to 100%.')
    f.materials.river_sand = { ...f.materials.river_sand, absorption: '1.2', moisture: '-1' }
    expect(mixProblems(f).materials).toBe('Enter River sand moisture from 0 to 100%.')
    f.materials.river_sand = { ...f.materials.river_sand, moisture: '2', source: 'x'.repeat(101) }
    expect(mixProblems(f).materials).toBe('River sand source can be up to 100 characters.')
    f.materials.river_sand = { ...f.materials.river_sand, source: 'Local' }
    expect(mixProblems(f)).toEqual({})
  })

  it('caps slump and flow readings at 1000 mm', () => {
    const f = freshForm(trial)
    f.readings['60'] = '1001'
    expect(freshProblems(f).fresh_readings).toBe('Enter readings of 1000 mm or less. Check 60 min.')
    f.readings['60'] = '1000'
    expect(freshProblems(f)).toEqual({})
  })

  it('checks cube weight 0 to 20 kg, load 0 to 3000 kN and at most 6 cubes', () => {
    expect(cubeProblem([{ weight: '20.5', load: '700' }])).toBe('Enter a weight of 20 kg or less. Check cube 1.')
    expect(cubeProblem([{ weight: '8.4', load: '700' }, { weight: '8.4', load: '3001' }])).toBe('Enter a load of 3000 kN or less. Check cube 2.')
    expect(cubeProblem([{ weight: '20', load: '3000' }])).toBeNull()
    expect(cubeProblem(Array.from({ length: 7 }, () => ({ weight: '', load: '' })))).toBe('Enter up to 6 cubes.')
  })

  it('limits trial remarks to 1000 characters after trimming', () => {
    expect(conclusionProblems({ ...conclusionForm(trial), remarks: 'x'.repeat(1001) }).remarks).toBe('Use 1000 characters or fewer.')
    expect(conclusionProblems({ ...conclusionForm(trial), remarks: ` ${'x'.repeat(1000)} ` })).toEqual({})
  })
})

describe('attachments', () => {
  const file = (name: string, size = 1000) => ({ uri: `file:///${name}`, name, type: '', size })
  it('skips empty files and anything over 30 files on the trial', () => {
    expect(planUploads([file('a.pdf', 0)], 0)).toEqual({ upload: [], problems: ['a.pdf is empty.'] })
    const r = planUploads([file('a.pdf'), file('b.png'), file('c.jpg')], 28)
    expect(r.upload.map((f) => f.name)).toEqual(['a.pdf', 'b.png'])
    expect(r.problems).toEqual(['A trial can have up to 30 files, so only 2 more can be added. Not added: c.jpg.'])
    expect(planUploads([file('a.pdf')], 30).problems).toEqual(['A trial can have up to 30 files. Remove one first. Not added: a.pdf.'])
  })
})
