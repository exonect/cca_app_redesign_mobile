// Pure logic of the trial screen: cast date entry, step payloads, cube age states.
import type { Trial } from '@/shared/types'

import { attachmentProblem, photoName } from './attachments'
import { CAST_ERRORS, castIso, castParts, maskDate, maskTime, shiftDay } from './castAt'
import { ageState, chipLabel } from './CubesStep'
import { mixPayload, parseStep, sievePayload, splitWarnings, type MixForm, type SieveForm } from './forms'
import { readingNote } from './FreshStep'
import { strokePath } from './SignaturePad'

jest.mock('@/api/client', () => ({ api: jest.fn(), ApiError: class extends Error {}, fieldErrors: () => ({}), session: {} }))
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }))

describe('trial date and time in IST', () => {
  it('turns typed IST date and time into an ISO string with +05:30 and back', () => {
    expect(castIso('28/10/2026', '09:30')).toEqual({ iso: '2026-10-28T09:30:00+05:30', error: null })
    expect(castParts('2026-10-28T04:00:00Z')).toEqual({ date: '28/10/2026', time: '09:30' })
    // 23:30 UTC is the next calendar day in IST
    expect(castParts('2026-10-28T23:30:00Z')).toEqual({ date: '29/10/2026', time: '05:00' })
  })

  it('explains what is wrong instead of sending a bad date', () => {
    expect(castIso('', '')).toEqual({ iso: null, error: null })
    expect(castIso('31/02/2026', '10:00').error).toBe(CAST_ERRORS.dateInvalid)
    expect(castIso('2026-10-28', '10:00').error).toBe(CAST_ERRORS.dateFormat)
    expect(castIso('28/10/2026', '').error).toBe(CAST_ERRORS.needTime)
    expect(castIso('28/10/2026', '25:00').error).toBe(CAST_ERRORS.timeFormat)
    expect(castIso('', '10:00').error).toBe(CAST_ERRORS.needDate)
  })

  it('masks number pad typing and steps days across month ends', () => {
    expect(maskDate('28102026')).toBe('28/10/2026')
    expect(maskDate('2810')).toBe('28/10')
    expect(maskTime('0930')).toBe('09:30')
    expect(shiftDay('31/10/2026', 1)).toBe('01/11/2026')
    expect(shiftDay('01/03/2028', -1)).toBe('29/02/2028')
    expect(shiftDay('', 1, new Date('2026-11-03T20:00:00Z'))).toBe('04/11/2026')
  })
})

describe('step payloads', () => {
  it('sends only sieve fields, blanks as 0 in a weighed material, blank proportions as 0 once one is above 0', () => {
    const f = {
      sieves: { '20mm': [{ sieve: '20', retained: '10' }, { sieve: 'pan', retained: '' }], '10mm': [], river_sand: [{ sieve: '4.75', retained: '' }], crushed_sand: [] },
      proportions: { '20mm': '30', '10mm': '', river_sand: '', crushed_sand: '70' },
    } as unknown as SieveForm
    expect(sievePayload(f)).toEqual({
      sieves: { '20mm': [{ sieve: '20', retained: '10' }, { sieve: 'pan', retained: '0' }], '10mm': [], river_sand: [], crushed_sand: [] },
      proportions: { '20mm': '30', '10mm': '0', river_sand: '0', crushed_sand: '70' },
    })
  })

  it('mix design sends the cast date as IST ISO and the admixture quantity as typed (legacy)', () => {
    const blankMat = { ssd: '', absorption: '', moisture: '', source: '', cement_type: '' }
    const f: MixForm = {
      cast_date: '28/10/2026', cast_time: '10:15', grade_of_concrete: '4', batch_size: '0.04',
      admixture_1: '9', dosage_1: '0.9', admixture_2: '', dosage_2: '',
      materials: {
        cement: { ...blankMat, ssd: '300', cement_type: 'OPC 53' }, '20mm': { ...blankMat, ssd: '546', absorption: '0.5', moisture: '0' },
        admixture_1: { ...blankMat, ssd: '3.78' }, water: { ...blankMat, ssd: '160' },
        fly_ash: blankMat, ggbs: blankMat, alcofine: blankMat, microsilica: blankMat, fiber: blankMat, '10mm': blankMat, river_sand: blankMat, crushed_sand: blankMat, admixture_2: blankMat,
      },
    }
    const p = mixPayload(f)
    expect(p.cast_at).toBe('2026-10-28T10:15:00+05:30')
    expect(p.grade_of_concrete).toBe(4)
    expect(p.materials).toEqual({
      cement: { ssd: '300', cement_type: 'OPC 53' }, '20mm': { ssd: '546', absorption: '0.5', moisture: '0' }, water: { ssd: '160' },
      admixture_1: { ssd: '3.78' },
    })
  })

  it('reads the step from the route and defaults to 1', () => {
    expect(parseStep('3')).toBe(3)
    expect(parseStep(['5'])).toBe(5)
    expect(parseStep('9')).toBe(1)
    expect(parseStep(undefined)).toBe(1)
  })

  it('splits the server close warnings into sentences', () => {
    expect(splitWarnings('The 28 day cube result is not in yet, due 25 Nov 2026. A Sales Admin can add it after closing. Not yet measured: Strength at 28 days.'))
      .toEqual(['The 28 day cube result is not in yet, due 25 Nov 2026.', 'A Sales Admin can add it after closing.', 'Not yet measured: Strength at 28 days.'])
  })
})

describe('cube ages and fresh readings', () => {
  const trial = { cast_at: '2026-10-28T10:00:00+05:30', results: { cubes: { '1d': { average: '12.40' } } } } as unknown as Trial
  it('marks saved, due today, overdue and upcoming ages from the cast date', () => {
    expect(ageState(trial, '1d', '2026-11-04')).toBe('saved')
    expect(ageState(trial, '7d', '2026-11-04')).toBe('today')
    expect(ageState(trial, '3d', '2026-11-04')).toBe('overdue')
    expect(ageState(trial, '28d', '2026-11-04')).toBe('pending')
    expect(chipLabel(trial, '28d', 'pending')).toBe('28 days, 25 Nov')
    expect(chipLabel(trial, '7d', 'today')).toBe('7 days, today')
  })

  it('notes slump loss and the verdict at the retention time', () => {
    const target = { minutes: 120, mm: 160 }
    expect(readingNote('60', 185, 200, target)).toBe('15 mm lost')
    expect(readingNote('120', 165, 200, target)).toBe('Within target')
    expect(readingNote('120', 130, 200, target)).toBe('Outside target')
    expect(readingNote('0', 200, 200, target)).toBe('')
  })
})

describe('attachments and signatures', () => {
  it('names camera photos and rejects unsupported files', () => {
    expect(photoName(null, 'image/jpeg', new Date('2026-11-04T09:15:30Z'))).toBe('Photo_20261104_091530.jpg')
    // iPhone camera photos are HEIC: accepted as they are (legacy took any image).
    expect(photoName('IMG_1.HEIC', 'image/heic', new Date('2026-11-04T09:15:30Z'))).toBe('IMG_1.HEIC')
    expect(photoName(null, 'image/heic', new Date('2026-11-04T09:15:30Z'))).toBe('Photo_20261104_091530.heic')
    expect(attachmentProblem({ uri: 'x', name: 'notes.docx', type: '' })).toMatch(/not a PDF/)
    expect(attachmentProblem({ uri: 'x', name: 'cube.pdf', type: '', size: 30 * 1024 * 1024 })).toMatch(/over 25 MB/)
    expect(attachmentProblem({ uri: 'x', name: 'cube.pdf', type: '', size: 1000 })).toBeNull()
  })

  it('draws strokes as SVG paths', () => {
    expect(strokePath([[1, 2], [3.04, 4.06]])).toBe('M1 2 L3 4.1')
    expect(strokePath([[5, 5]])).toBe('M5 5 l0.1 0')
  })
})
