import { decimalOnly, digitsOnly, nameFilter, phoneFilter, potentialFilter, sfdcFilter, trialNumberFilter } from './inputFilters'

describe('digitsOnly', () => {
  it.each([
    ['9090909009', 10, '9090909009'],
    ['90a9b0-90+9@009', 10, '9090909009'],
    ['+91 98765 43210', 10, '9198765432'],
    ['012345', 6, '012345'],
    ['0123456789', 6, '012345'],
    ['ab!@#', 6, ''],
    ['', 6, ''],
  ])('%s keeps %s digits → %s', (input, max, out) => expect(digitsOnly(input, max)).toBe(out))
})

describe('potential', () => {
  it.each([
    ['1', '1'],
    ['12.5', '12.5'],
    ['12.5.6', '12.56'],
    ['1a2b.3c', '12.3'],
    ['-7', '7'],
    ['1,25', '1.25'],
    ['.5', '0.5'],
    ['123456789', '12345678'],
    ['1.123456', '1.1234'],
    ['₹ 7,654 Cr', '7.654'],
  ])('%s → %s', (input, out) => expect(potentialFilter(input)).toBe(out))

  it('keeps a trailing point while typing', () => expect(decimalOnly('12.', 8, 4)).toBe('12.'))
})

describe('phone and SFDC', () => {
  it.each([
    ['+91 98765 43210', '9876543210'],
    ['+91-9876543210', '9876543210'],
    ['98765abc43210xyz', '9876543210'],
    ['(987) 654-3210', '9876543210'],
  ])('phone %s → %s', (input, out) => expect(phoneFilter(input)).toBe(out))

  it('SFDC keeps leading zeros and stops at 6', () => {
    expect(sfdcFilter('SFDC-004512')).toBe('004512')
    expect(sfdcFilter('0045127')).toBe('004512')
  })
})

describe('trial number fields (UAT, 12 Nov 2026)', () => {
  it.each([
    ['retained', '1.2kg', '1.2'],
    ['retained', '-3', '3'],
    ['retained', '12e3', '123'],
    ['proportion', '35.555', '35.55'],
    ['proportion', '1000', '100'],
    ['batch_size', '0.04 m3', '0.043'],
    ['dosage', '0.8%', '0.8'],
    ['dosage', '123.456', '12.45'],
    ['ssd', '1,850', '1.850'],
    ['percent', '2.5%', '2.5'],
    ['fresh_density', '2450.5abc', '2450.5'],
    ['site_temp', '32°C', '32'],
    ['cube_weight', '8.4 kg', '8.4'],
    ['cube_load', '702+', '702'],
  ] as const)('%s: %s → %s', (field, input, out) => expect(trialNumberFilter(field, input)).toBe(out))
})

describe('signatory names', () => {
  it.each([
    ['Ravi Kumar', 'Ravi Kumar'],
    ['Ravi K. Sharma', 'Ravi K. Sharma'],
    ["Neil D'Souza", "Neil D'Souza"],
    ['Ravi123', 'Ravi'],
    ['R@vi #1 QC', 'Rvi QC'],
    ['  Ravi', 'Ravi'],
    ['रवि कुमार', 'रवि कुमार'],
  ])('%s → %s', (input, out) => expect(nameFilter(input)).toBe(out))
})
