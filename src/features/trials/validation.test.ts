// Client checks on the trial steps, mirroring the server's TrialWriteSerializer
// and save_cubes rules (and stopping text the server would silently drop).
import type { Lookup, Trial } from '@/shared/types'

import { planUploads } from './attachments'
import { CAST_ERRORS, castParts, isFutureDay } from './castAt'
import {
  conclusionForm, conclusionProblems, cubePayload, cubeProblem, cubeSoftWarnings, decimalProblem, decimalTotal, freshForm, freshPayload, freshProblems,
  freshSoftWarnings, mixForm, mixPayload, mixProblems, mixSoftWarnings, withCoarseSource, pathLabel, sccNumber, SIGNATURE_MAX_CHARS, sieveForm, sieveProblems, sortSlumpList, stepErrors,
  testedOnDefault, testedOnIso,
} from './forms'
import { sccOptions, slumpChoices } from './FreshStep'
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
    f.sieves.river_sand[4].retained = '12..5'
    expect(sieveProblems(f).sieves).toBe('Enter retained weights as numbers of 0 or more. Check River sand on 1.18 mm.')
    f.sieves.river_sand[4].retained = '-3'
    expect(sieveProblems(f).sieves).toMatch('River sand on 1.18 mm')
    f.sieves.river_sand[4].retained = '12.5'
    expect(sieveProblems(f)).toEqual({})
  })

  it('blocks a proportion that is not a number', () => {
    const f = sieveForm(trial)
    f.proportions['10mm'] = '40%'
    expect(sieveProblems(f).proportions).toBe('Enter the 10 mm proportion as a number.')
  })
})

describe('mix design', () => {
  it('checks dosage (hard 0 to 99.99) and batch size (0 or more) like the server fields', () => {
    const f = { ...mixForm(trial), admixture_1: '7', admixture_2: '8', dosage_1: '100', dosage_2: '0.125', batch_size: '-1' }
    const e = mixProblems(f)
    expect(e.dosage_1).toBe('Enter the dosage from 0 to 99.99.')
    expect(e.dosage_2).toBe('Enter the second dosage with up to 2 decimal places.')
    expect(e.batch_size).toBe('Enter the batch size from 0 up.')
    // The legacy app saved a 22% dosage and a 0 batch size: no hard error, the dosage gets an amber warning.
    expect(mixProblems({ ...f, dosage_1: '22', dosage_2: '', batch_size: '0' })).toEqual({})
    expect(mixSoftWarnings({ ...f, dosage_1: '22', dosage_2: '', batch_size: '0.8' })).toEqual({
      dosage_1: 'Dosage of admixture I 22% is above the usual 10%. Check it. Saved as entered.',
      batch_size: 'Batch size 0.8 m³ is above the usual 0.5 m³. Check it. Saved as entered.',
    })
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
  it('needs readings of 0 or more and a density of 0 or more with up to 4 decimals; 1000 to 3000 is soft', () => {
    const f = freshForm(trial)
    f.readings['120'] = '-5'
    f.fresh_density = '2450.25555'
    expect(freshProblems(f)).toEqual({
      fresh_readings: 'Enter readings in mm as numbers of 0 or more. Check 120 min.',
      fresh_density: 'Enter the density with up to 4 decimal places.',
    })
    const legacy = { ...f, readings: { ...f.readings, 120: '150' }, fresh_density: '245' }
    expect(freshProblems(legacy)).toEqual({})
    expect(freshSoftWarnings(legacy).fresh_density).toBe('Fresh wet density 245 kg/m³ is below the usual 1000 kg/m³. Check it. Saved as entered.')
  })

  it('takes the site temperature (0 or more, up to 4 decimals; above 60 °C is soft)', () => {
    const f = { ...freshForm(trial), site_temp: '-2' }
    expect(freshProblems(f).site_temp).toBe('Enter the site temperature from 0 up.')
    expect(freshProblems({ ...f, site_temp: '32.55555' }).site_temp).toBe('Enter the site temperature with up to 4 decimal places.')
    expect(freshProblems({ ...f, site_temp: '32.555' })).toEqual({})
    expect(freshProblems({ ...f, site_temp: '65' })).toEqual({})
    expect(freshSoftWarnings({ ...f, site_temp: '65' }).site_temp).toBe('Site temperature 65 °C is above the usual 60 °C. Check it. Saved as entered.')
    expect(freshPayload({ ...f, site_temp: ' 31.5 ' }).site_temp).toBe('31.5')
  })

  it('keeps SCC tests per reading time and sends only those added (T-54)', () => {
    const t = { ...trial, scc: { v_funnel: { 0: '9', 30: '11' }, l_box: '0.9' } } as unknown as Trial
    const f = freshForm(t)
    expect(f.scc_tests).toEqual(['v_funnel', 'l_box'])
    expect(f.scc.l_box['0']).toBe('0.9') // an older single value counts as Initial
    f.scc_tests = [...f.scc_tests, 'u_box']
    f.scc.u_box['60'] = '78'
    f.scc.t500['0'] = '4' // not added: not sent
    expect(freshPayload(f).scc).toEqual({ v_funnel: { 0: '9', 30: '11' }, l_box: { 0: '0.9' }, u_box: { 60: '78' } })
    f.scc.v_funnel['90'] = 'slow'
    expect(freshProblems(f).scc).toBe('Enter V funnel readings as numbers from 0 to 100000. Check 90 min.')
    f.scc.v_funnel['90'] = '75'
    expect(freshSoftWarnings(f)['scc.v_funnel.90']).toBe('V funnel at 90 min 75 s is above the usual 60 s. Check it. Saved as entered.')
  })

  it('reads the number of an SCC list value and keeps a stored number not in the list', () => {
    expect(sccNumber('9 sec')).toBe('9')
    expect(sccNumber('1.0')).toBe('1')
    expect(sccNumber('n/a')).toBeNull()
    const list = [{ id: 1, value: '5 sec' }, { id: 2, value: '9 sec' }] as Lookup[]
    expect(sccOptions(list, '')).toEqual([{ value: '5', label: '5 sec' }, { value: '9', label: '9 sec' }])
    expect(sccOptions(list, '7.5')[0]).toEqual({ value: '7.5', label: '7.5' })
    expect(sccOptions(list, '9.0')).toHaveLength(2)
  })

  it('offers slump and flow readings from the Slump Flow list sorted by number, keeping a stored number not in it (legacy)', () => {
    const list = sortSlumpList([{ id: 1, value: '600' }, { id: 2, value: '180' }, { id: 3, value: '20' }] as Lookup[])
    expect(list.map((x) => x.value)).toEqual(['20', '180', '600'])
    expect(slumpChoices(list, '').map((o) => o.value)).toEqual(['20', '180', '600'])
    expect(slumpChoices(list, '183').map((o) => o.value)).toEqual(['', '183', '20', '180', '600'])
    expect(slumpChoices(list, '180')[0]).toEqual({ value: '', label: 'Not measured' })
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

  it('caps retained weights at 1000000 kg (garbage only)', () => {
    const f = sieveForm(trial)
    f.sieves['20mm'][0].retained = '1000001'
    expect(sieveProblems(f).sieves).toMatch(/^Enter retained weights of 1000000 kg or less\. Check 20 mm on /)
    f.sieves['20mm'][0].retained = '1000000'
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

  it('shows 0 for blank mix numbers and does not save rows that are only the 0 defaults (UAT, 13 Nov 2026)', () => {
    const t = { ...trial, batch_size: null, dosage_1: null, dosage_2: null, admixture_1: null, admixture_2: null,
      materials: { cement: { ssd: '300', source: 'UltraTech' }, '20mm': { ssd: '546', absorption: '0.50' } } } as Trial
    const f = mixForm(t)
    expect([f.batch_size, f.dosage_1, f.dosage_2]).toEqual(['0', '0', '0'])
    expect(f.materials.water).toMatchObject({ ssd: '0', absorption: '0', moisture: '0' })
    expect(mixProblems(f)).toEqual({}) // a 0 dosage with no product is not a dosage
    expect(mixSoftWarnings(f)).toEqual({})
    const body = mixPayload(f)
    expect(body).toMatchObject({ batch_size: '0', dosage_1: null, dosage_2: null })
    expect(body.materials).toEqual({ cement: { ssd: '300', source: 'UltraTech' }, '20mm': { ssd: '546', absorption: '0.50', moisture: '0' } })
    expect(withCoarseSource(f, '20mm', 'Quarry A').materials['10mm'].source).toBe('')
  })

  it('checks SSD 0 to 100000 (3000 soft), absorption and moisture 0 to 100, and source text up to 100', () => {
    const f = mixForm(trial)
    f.materials.cement = { ...f.materials.cement, ssd: '100000.5' }
    expect(mixProblems(f).materials).toBe('Enter Cement SSD design from 0 to 100000 kg/m³.')
    f.materials.cement = { ...f.materials.cement, ssd: '3500' }
    expect(mixProblems(f)).toEqual({})
    expect(mixSoftWarnings(f)['materials.cement.ssd']).toBe('SSD design of Cement 3500 kg/m³ is above the usual 3000 kg/m³. Check it. Saved as entered.')
    f.materials.admixture_1 = { ...f.materials.admixture_1, ssd: 'x' }
    expect(mixProblems(f).materials).toBe('Enter Admixture I SSD design as a number.')
    f.materials.admixture_1 = { ...f.materials.admixture_1, ssd: '3.4' }
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

  it('caps slump and flow readings at 100000 mm (1000 is soft)', () => {
    const f = freshForm(trial)
    f.readings['60'] = '100001'
    expect(freshProblems(f).fresh_readings).toBe('Enter readings of 100000 mm or less. Check 60 min.')
    f.readings['60'] = '1001'
    expect(freshProblems(f)).toEqual({})
    expect(freshSoftWarnings(f)['fresh_readings.60']).toBe('Reading at 60 min 1001 mm is above the usual 1000 mm. Check it. Saved as entered.')
  })

  it('checks cube weight and load 0 to 100000 (20 kg and 3000 kN soft) and at most 6 cubes', () => {
    expect(cubeProblem([{ weight: '100001', load: '700' }])).toBe('Enter a weight of 100000 kg or less. Check cube 1.')
    expect(cubeProblem([{ weight: '8.4', load: '700' }, { weight: '8.4', load: '100001' }])).toBe('Enter a load of 100000 kN or less. Check cube 2.')
    expect(cubeProblem([{ weight: '8500', load: '3200' }])).toBeNull()
    expect(cubeSoftWarnings([{ weight: '8500', load: '3200' }], '28 days')).toEqual([
      'Weight of cube 1, 28 days, 8500 kg is far above the 8 to 9 kg of a 150 mm cube. If it was weighed in grams, enter it in kg. Saved as entered.',
      'Load on cube 1, 28 days, 3200 kN is above the usual 3000 kN. Check it. Saved as entered.',
    ])
    expect(cubeProblem(Array.from({ length: 7 }, () => ({ weight: '', load: '' })))).toBe('Enter up to 6 cubes.')
  })

  it('takes the actual test date per age, not in the future and not before the trial date (T-66)', () => {
    const rows = [{ weight: '8.4', load: '700' }]
    expect(cubeProblem(rows, '2026-11-05', '2026-10-01T10:00:00+05:30', '2026-11-04')).toBe('The test date cannot be in the future.')
    expect(cubeProblem(rows, '2026-09-30', '2026-10-01T10:00:00+05:30', '2026-11-04')).toBe('The test date cannot be before the trial date.')
    expect(cubeProblem(rows, '2026-10-29', '2026-10-01T10:00:00+05:30', '2026-11-04')).toBeNull()
    expect(testedOnIso('29/10/2026')).toEqual({ iso: '2026-10-29', error: null })
    expect(testedOnIso('31/02/2026').error).toBe('That date does not exist. Check the day, month and year.')
    expect(cubePayload(rows, '2026-10-29')).toEqual({ cubes: [{ weight: '8.4', load: '700' }], tested_on: '2026-10-29' })
    expect(cubePayload(rows)).toEqual({ cubes: [{ weight: '8.4', load: '700' }] })
    const t = { ...trial, cast_at: '2026-10-01T10:00:00+05:30', cube_sets: [{ age: '7d', tested_on: '2026-10-09' }] } as unknown as Trial
    expect(testedOnDefault(t, '7d', '2026-11-04')).toBe('2026-10-09') // saved
    expect(testedOnDefault(t, '28d', '2026-11-04')).toBe('2026-10-29') // due date, already past
    expect(testedOnDefault(t, '28d', '2026-10-20')).toBe('2026-10-20') // not due yet: today
  })

  it('limits trial remarks to 1000 characters after trimming', () => {
    expect(conclusionProblems({ ...conclusionForm(trial), remarks: 'x'.repeat(1001) }).remarks).toBe('Use 1000 characters or fewer.')
    expect(conclusionProblems({ ...conclusionForm(trial), remarks: ` ${'x'.repeat(1000)} ` })).toEqual({})
  })
})

describe('attachments', () => {
  const file = (name: string, size = 1000) => ({ uri: `file:///${name}`, name, type: '', size })
  it('accepts iPhone HEIC and other photo types (T-55)', () => {
    expect(planUploads([file('IMG_1.HEIC'), file('b.heif'), file('c.webp'), file('d.gif')], 0).problems).toEqual([])
    expect(planUploads([file('x.exe')], 0).problems).toEqual(['x.exe is not a PDF, XLSX, photo (JPG, PNG, HEIC, WEBP, GIF) or video (MP4, MOV) file.'])
  })
  it('skips empty files and anything over 30 files on the trial', () => {
    expect(planUploads([file('a.pdf', 0)], 0)).toEqual({ upload: [], problems: ['a.pdf is empty.'] })
    const r = planUploads([file('a.pdf'), file('b.png'), file('c.jpg')], 28)
    expect(r.upload.map((f) => f.name)).toEqual(['a.pdf', 'b.png'])
    expect(r.problems).toEqual(['A trial can have up to 30 files, so only 2 more can be added. Not added: c.jpg.'])
    expect(planUploads([file('a.pdf')], 30).problems).toEqual(['A trial can have up to 30 files. Remove one first. Not added: a.pdf.'])
  })
})

describe('server errors inside JSON fields (audit round 2)', () => {
  const refused = (fields: Record<string, unknown>) => Object.assign(new Error('Some fields need attention.'), { status: 400, code: 'invalid', fields })

  it('names where a nested error sits, for the summary under the table', () => {
    const body = { sieves: { '20mm': [{ sieve: '40', retained: '0' }, { sieve: '20', retained: '-1' }] } }
    const out = stepErrors(refused({ sieves: { '20mm': { 1: { retained: ['Retained weight cannot be negative.'] } } } }), body)
    expect(out['sieves.20mm.1.retained']).toBe('Retained weight cannot be negative.')
    expect(out.sieves).toBe('20 mm aggregate, 20 mm sieve: Retained weight cannot be negative.')
    expect(stepErrors(refused({ materials: { river_sand: { moisture: ['Enter 100% or less.'] } } })).materials)
      .toBe('River sand moisture: Enter 100% or less.')
    expect(stepErrors(refused({ scc: { v_funnel: { 30: ['Enter 100000 or less.'] } } })).scc).toBe('V funnel at 30 min: Enter 100000 or less.')
    expect(stepErrors(refused({ fresh_readings: { 60: ['Readings cannot be negative.'] } })).fresh_readings).toBe('Reading at 60 min: Readings cannot be negative.')
    expect(stepErrors(refused({ proportions: { crushed_sand: ['Enter 100% or less.'] } })).proportions).toBe('Crushed sand proportion: Enter 100% or less.')
    expect(stepErrors(refused({ cubes: { 1: { load: ['Ensure this value is less than or equal to 100000.'] } } })).cubes)
      .toBe('Cube 2 load: Ensure this value is less than or equal to 100000.')
  })

  it('leaves plain fields and whole field messages as the server wrote them', () => {
    const out = stepErrors(refused({ dosage_1: ['Choose the product before entering its dosage.'], proportions: ['Proportions must total 100%. They total 90.00%.'] }))
    expect(out).toEqual({ dosage_1: 'Choose the product before entering its dosage.', proportions: 'Proportions must total 100%. They total 90.00%.' })
    expect(pathLabel('dosage_1')).toBeNull()
  })
})
