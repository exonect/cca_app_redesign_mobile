import { appRoute } from './links'

describe('notification links', () => {
  it('maps web paths to app routes', () => {
    expect(appRoute('/projects/abc')).toBe('/project/abc')
    expect(appRoute('/projects/abc/trials/t1')).toBe('/trial/t1')
    expect(appRoute('/projects/abc/')).toBe('/project/abc')
    expect(appRoute('/trials/t9?tab=cubes')).toBe('/trial/t9')
  })
  it('falls back to the trial id, then to nothing', () => {
    expect(appRoute('', 't2')).toBe('/trial/t2')
    expect(appRoute('/reports')).toBeNull()
  })
})
