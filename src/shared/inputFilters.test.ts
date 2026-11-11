import { decimalOnly, digitsOnly, phoneFilter, potentialFilter, sfdcFilter } from './inputFilters'

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
