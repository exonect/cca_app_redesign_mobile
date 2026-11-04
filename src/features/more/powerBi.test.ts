// Legacy mobile Power BI screen: the report address comes from the build env, https only.
jest.mock('expo-constants', () => ({ expoConfig: { extra: { powerBiUrl: ' https://app.powerbi.com/view?r=mobile%3D%3D ' } } }))

import { powerBiUrl } from './powerBi'

it('reads the configured report and accepts only https', () => {
  expect(powerBiUrl()).toBe('https://app.powerbi.com/view?r=mobile%3D%3D')
  expect(powerBiUrl('http://app.powerbi.com/view?r=x')).toBeNull()
  expect(powerBiUrl('javascript:alert(1)')).toBeNull()
  expect(powerBiUrl('')).toBeNull()
  expect(powerBiUrl(null)).toBeNull()
})
