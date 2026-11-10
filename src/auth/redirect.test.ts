// Links from outside: only this app's screens are targets; anything else is dropped or goes home.
import { knownRoute, parseIncoming, pendingTarget, routeIncoming, safeTarget, setNavigable } from './redirect'

jest.mock('expo-constants', () => ({ expoConfig: { scheme: 'com.thermex.app' } }))

beforeEach(() => { pendingTarget.clear(); setNavigable(false) })

describe('safeTarget', () => {
  it.each([
    ['/', '/'],
    ['/projects', '/projects'],
    ['/projects/', '/projects'],
    ['/project/0b6c-41aa', '/project/0b6c-41aa'],
    ['/trial/t1?step=4', '/trial/t1?step=4'],
    ['/trial/t1?step=4&evil=1#frag', '/trial/t1?step=4'],
    ['/project/new?id=p1', '/project/new?id=p1'],
    ['/recipes/new?for_trial=t1&sfdc_no=SF%201&x=y', '/recipes/new?for_trial=t1&sfdc_no=SF%201'],
    ['/admin/users', '/admin/users'],
    ['/sync', '/sync'],
    ['com.thermex.app://project/p1', '/project/p1'],
    ['com.thermex.app:///project/p1', '/project/p1'],
    ['COM.THERMEX.APP://alerts', '/alerts'],
    // Web paths (alerts, emails, old bookmarks)
    ['/projects/p1', '/project/p1'],
    ['/projects/p1/trials/t1', '/trial/t1'],
    ['/projects/p1/sieve-data', '/sieve-data/p1'],
    ['/projects/p1/edit', '/project/new?id=p1'],
    ['/projects/new', '/project/new'],
    ['/trials', '/trial'],
    ['/trials/t2', '/trial/t2'],
    ['/dashboard', '/'],
  ])('%s -> %s', (raw, expected) => {
    expect(safeTarget(raw)).toBe(expected)
  })

  it.each([
    '//evil.example/project/p1', 'https://evil.example/project/p1', 'http://localhost/project/p1', 'javascript:alert(1)',
    'otherapp://project/p1', 'exp+thermax-cca://expo-development-client/?url=x', 'project/p1', '', '   ',
    '/sign-in', '/sign-in?next=/project/p1', '/login', '/login/', '/logout', '/auth', 'com.thermex.app://auth?code=abc',
    '/reports', '/admin', '/admin/dashboard', '/project', '/project/p1/extra', '/(tabs)/more', '/+not-found',
    '/project/../admin/users', '/project/./p1', '/project/p1\\x', '/project/p%2F1', '/project/p\u00001', '/trial/<script>',
    '/projects/p1/trials', `/${'a'.repeat(3000)}`,
  ])('%s is not a target', (raw) => {
    expect(safeTarget(raw)).toBeNull()
  })

  it('handles junk without throwing', () => {
    expect(parseIncoming(undefined)).toBeNull()
    expect(parseIncoming(null)).toBeNull()
    expect(knownRoute('/trial/t1?step=%E0%A4%A')).toBe('/trial/t1')
  })
})

describe('routeIncoming (Expo Router redirectSystemPath)', () => {
  it('launches at My work and keeps a launch link for after sign in', () => {
    expect(routeIncoming({ path: 'com.thermex.app://trial/t1', initial: true })).toBe('/')
    expect(pendingTarget.take()).toBe('/trial/t1')
    expect(pendingTarget.take()).toBeNull()
  })

  it('launches at My work with nothing waiting for an unsafe or unknown launch link', () => {
    for (const path of ['https://evil.example/', '/reports', 'com.thermex.app://auth?code=1', '/sign-in', '/']) {
      expect(routeIncoming({ path, initial: true })).toBe('/')
      expect(pendingTarget.get()).toBeNull()
    }
  })

  it('holds a link while signed out and drops what is not a target', () => {
    expect(routeIncoming({ path: '/projects/p9', initial: false })).toBeNull()
    expect(pendingTarget.get()).toBe('/project/p9')
    expect(routeIncoming({ path: '//evil.example', initial: false })).toBeNull()
    expect(pendingTarget.get()).toBe('/project/p9')
    expect(routeIncoming({ path: '/reports', initial: false })).toBeNull()
    expect(pendingTarget.get()).toBeNull()
  })

  it('opens links at once while signed in; unknown paths go to not found, unsafe ones nowhere', () => {
    setNavigable(true)
    expect(routeIncoming({ path: 'com.thermex.app://project/p1', initial: false })).toBe('/project/p1')
    expect(routeIncoming({ path: '/projects/p1/trials/t3', initial: false })).toBe('/trial/t3')
    expect(routeIncoming({ path: '/reports', initial: false })).toBe('/reports')
    expect(routeIncoming({ path: 'com.thermex.app://auth?code=abc', initial: false })).toBeNull()
    expect(routeIncoming({ path: '/sign-in', initial: false })).toBeNull()
    expect(routeIncoming({ path: 'https://evil.example/project/p1', initial: false })).toBeNull()
    expect(pendingTarget.get()).toBeNull()
  })

  it('tells subscribers when a link starts waiting', () => {
    const fn = jest.fn()
    const off = pendingTarget.subscribe(fn)
    routeIncoming({ path: '/trial/t1', initial: false })
    expect(fn).toHaveBeenCalled()
    off()
  })
})
