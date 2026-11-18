import { defaultFreshTest, requirementLabel, workabilityNoun } from './workability'

describe('workability requirement (UAT, 18 Nov 2026: Flow + slump as in the old app)', () => {
  it('labels each type', () => {
    expect(['slump', 'flow', 'flow_slump', ''].map(requirementLabel)).toEqual(['Slump', 'Flow', 'Flow + slump', ''])
    expect(['slump', 'flow', 'flow_slump'].map(workabilityNoun)).toEqual(['slump', 'flow', 'slump or flow'])
  })
  it('starts a trial on the project type, or for Flow + slump on what the target suggests', () => {
    expect(defaultFreshTest('flow', '120')).toBe('flow')
    expect(defaultFreshTest('slump', '650')).toBe('slump')
    expect(defaultFreshTest('flow_slump', '650')).toBe('flow')
    expect(defaultFreshTest('flow_slump', '300')).toBe('flow')
    expect(defaultFreshTest('flow_slump', '150')).toBe('slump')
    expect(defaultFreshTest('flow_slump', undefined)).toBe('slump')
    expect(defaultFreshTest('', '650')).toBe('slump')
  })
})
