// Sign in and sign out navigation, links from outside, unknown routes and the
// role x screen matrix, on the real src/app routes and the real Gate (root
// navigator) with stubbed feature screens and a stubbed session.
import { QueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { act, fireEvent, renderRouter, screen, type RenderRouterResult } from 'expo-router/testing-library'

import { redirectSystemPath } from '@/app/+native-intent'
import type { Role } from '@/shared/types'

import { canOpen } from './access'
import { Gate, SIGNED_IN_SCREENS } from './Gate'
import { pendingTarget } from './redirect'
import { NO_ACCESS_TITLE, NOT_FOUND_TITLE } from './RequireAccess'
import { authDouble, opened } from './testing/routerHarness'

const mockApi = jest.fn()
jest.mock('@/api/client', () => ({ api: (...a: unknown[]) => mockApi(...a), ApiError: class extends Error {}, session: {} }))
jest.mock('@/api/hooks', () => ({ useUnreadCount: () => ({ data: { unread: 0 } }) }))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => require('./testing/routerHarness').useAuthDouble() }))
jest.mock('@/offline/runtime', () => ({ useOfflineRuntime: (qc: unknown, u: unknown) => require('./testing/routerHarness').useOfflineRuntimeDouble(qc, u) }))
jest.mock('@/offline/ui', () => ({ OfflineBar: () => null }))
jest.mock('@/features/auth/SignInScreen', () => ({ SignInScreen: () => require('./testing/routerHarness').SignInDouble() }))
jest.mock('@/features/home/MyWorkScreen', () => ({ MyWorkScreen: require('./testing/routerHarness').stubScreen('MyWork') }))
jest.mock('@/features/projects/ProjectsScreen', () => ({ ProjectsScreen: require('./testing/routerHarness').stubScreen('Projects') }))
jest.mock('@/features/search/SearchScreen', () => ({ SearchScreen: require('./testing/routerHarness').stubScreen('Search') }))
jest.mock('@/features/alerts/AlertsScreen', () => ({ AlertsScreen: require('./testing/routerHarness').stubScreen('Alerts') }))
jest.mock('@/features/more/MoreScreen', () => ({ MoreScreen: require('./testing/routerHarness').stubScreen('More') }))
jest.mock('@/features/projects/ProjectScreen', () => ({ ProjectScreen: require('./testing/routerHarness').stubScreen('Project') }))
jest.mock('@/features/projects/ProjectFormScreen', () => ({ ProjectFormScreen: require('./testing/routerHarness').stubScreen('ProjectForm') }))
jest.mock('@/features/trials/TrialsListScreen', () => ({ TrialsListScreen: require('./testing/routerHarness').stubScreen('Trials') }))
jest.mock('@/features/trials/TrialScreen', () => ({ TrialScreen: require('./testing/routerHarness').stubScreen('Trial') }))
jest.mock('@/features/trials/SieveDataScreen', () => ({ SieveDataScreen: require('./testing/routerHarness').stubScreen('SieveData') }))
jest.mock('@/features/recipes/RecipesScreen', () => ({ RecipesScreen: require('./testing/routerHarness').stubScreen('Recipes') }))
jest.mock('@/features/recipes/RecipeScreen', () => ({ RecipeScreen: require('./testing/routerHarness').stubScreen('Recipe') }))
jest.mock('@/features/admin/UsersScreen', () => ({ UsersScreen: require('./testing/routerHarness').stubScreen('Users') }))
jest.mock('@/features/admin/MasterDataScreen', () => ({ MasterDataScreen: require('./testing/routerHarness').stubScreen('MasterData') }))
jest.mock('@/features/sync/SyncScreen', () => ({ SyncScreen: require('./testing/routerHarness').stubScreen('Sync') }))

// Node's fs and path (this project has no Node type definitions).
declare const __dirname: string
const { readdirSync, statSync } = require('fs') as { readdirSync(p: string): string[]; statSync(p: string): { isDirectory(): boolean } }
const { join, relative } = require('path') as { join(...p: string[]): string; relative(from: string, to: string): string }
const APP_DIR = join(__dirname, '..', 'app')
let qc: QueryClient
const Root = () => <Gate queryClient={qc} />

function appFiles() {
  const files: string[] = []
  const walk = (dir: string) => readdirSync(dir).forEach((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p)
    else files.push(relative(APP_DIR, p).split('\\').join('/'))
  })
  walk(APP_DIR)
  return files
}
/** The real src/app files (route modules, +native-intent), with the root layout replaced by the Gate alone (no fonts). */
const appContext = () => Object.fromEntries(appFiles().map((f) => {
  const key = f.replace(/\.tsx?$/, '')
  return [key, key === '_layout' ? Root : require(join(APP_DIR, f))]
}))

/** Open the app at a launch URL (a path, as Expo Router hands it over) with the session in the given state. */
async function launch(url: string, status: 'signed_out' | 'signed_in' | 'loading' | 'unavailable' = 'signed_out', role?: Role) {
  authDouble.reset(status, role)
  const r = await renderRouter(appContext(), { initialUrl: url })
  await settle()
  return r
}
/** Let the offline runtime double and the pending link effects run. */
async function settle() {
  await act(async () => { jest.runOnlyPendingTimers() })
  await act(async () => { jest.runOnlyPendingTimers() })
}
async function signIn(role: Role) {
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: `Sign in as ${role}` })) })
  await settle()
}
async function endSession() {
  await act(async () => { authDouble.end() })
  await settle()
}
const at = (r: RenderRouterResult) => r.getPathnameWithParams()

beforeEach(() => {
  qc = new QueryClient()
  mockApi.mockReset()
  pendingTarget.clear()
})
afterEach(() => { qc.clear(); jest.useRealTimers() })

describe('sign in', () => {
  it('lands on My work (home tab) by default', async () => {
    const r = await launch('/')
    expect(at(r)).toBe('/sign-in')
    expect(screen.getByText('SCREEN:SignIn')).toBeTruthy()
    await signIn('AD')
    expect(at(r)).toBe('/')
    expect(screen.getByText('SCREEN:MyWork')).toBeTruthy()
    expect(router.canGoBack()).toBe(false)
  })

  it('opens the screen a launch link asked for, on top of My work', async () => {
    const r = await launch('/project/p1')
    expect(at(r)).toBe('/sign-in')
    expect(opened).not.toContain('Project')
    await signIn('SP')
    expect(at(r)).toBe('/project/p1')
    expect(screen.getByText('SCREEN:Project')).toBeTruthy()
    await act(async () => { router.back() })
    expect(at(r)).toBe('/')
  })

  it.each([
    ['com.thermex.app://trial/t9?step=3', '/trial/t9?step=3'],
    ['com.thermex.app:///sieve-data/p4', '/sieve-data/p4'],
    ['/projects/p2/trials/t2', '/trial/t2'],
    ['/projects/p2/edit', '/project/new?id=p2'],
  ])('opens a link that arrives while signed out (%s) after sign in', async (url, expected) => {
    const r = await launch('/')
    expect(await redirectSystemPath({ path: url, initial: false })).toBeNull()
    expect(at(r)).toBe('/sign-in')
    await signIn('AD')
    expect(at(r)).toBe(expected)
  })

  it.each([
    '//evil.example/project/p1', 'https://evil.example/project/p1', 'javascript:alert(1)', 'otherapp://project/p1',
    '/sign-in', '/login', '/logout', 'com.thermex.app://auth?code=abc&state=xyz', '/reports', '/project/../admin/users',
    '/project/p1\\..', '/(tabs)/more', '/admin',
  ])('falls back to My work for an unsafe or unknown target: %s', async (url) => {
    const r = await launch('/')
    expect(await redirectSystemPath({ path: url, initial: false })).toBeNull()
    await signIn('AD')
    expect(at(r)).toBe('/')
    expect(screen.getByText('SCREEN:MyWork')).toBeTruthy()
    expect(router.canGoBack()).toBe(false)
  })

  it.each(['/reports', '//evil.example', 'https://evil.example/', '/sign-in', '/auth?code=1'])('a launch link to %s opens My work', async (url) => {
    expect(await redirectSystemPath({ path: url, initial: true })).toBe('/')
    const r = await launch('/')
    await signIn('CT')
    expect(at(r)).toBe('/')
  })

  it('the Microsoft callback never becomes a screen, even signed in', async () => {
    const r = await launch('/', 'signed_in', 'AD')
    expect(await redirectSystemPath({ path: 'com.thermex.app://auth?code=abc', initial: false })).toBeNull()
    expect(at(r)).toBe('/')
  })

  it('a link that arrives while signed in opens at once', async () => {
    await launch('/', 'signed_in', 'AD')
    expect(await redirectSystemPath({ path: 'com.thermex.app://project/p7', initial: false })).toBe('/project/p7')
    expect(await redirectSystemPath({ path: '/projects/p7/trials/t7', initial: false })).toBe('/trial/t7')
    expect(await redirectSystemPath({ path: 'https://evil.example/x', initial: false })).toBeNull()
  })

  it('a signed in person opening /sign-in sees My work', async () => {
    const r = await launch('/sign-in', 'signed_in', 'SAD')
    expect(at(r)).toBe('/')
    expect(screen.getByText('SCREEN:MyWork')).toBeTruthy()
  })

  it('a link to a screen the role may not open shows no access after sign in, and the screen never opens', async () => {
    const r = await launch('/admin/users')
    await signIn('SP')
    expect(at(r)).toBe('/admin/users')
    expect(screen.getByText(NO_ACCESS_TITLE)).toBeTruthy()
    expect(opened).not.toContain('Users')
    expect(mockApi).not.toHaveBeenCalled()
  })
})

describe('relaunch with a saved session', () => {
  it('goes straight in without showing sign in', async () => {
    const r = await launch('/', 'loading')
    expect(screen.getByText(/^Signing you in/)).toBeTruthy()
    await act(async () => { authDouble.signIn('CT') })
    await settle()
    expect(at(r)).toBe('/')
    expect(opened).not.toContain('SignIn')
  })

  it('opens the launch link straight away', async () => {
    const r = await launch('/trial/t5', 'loading')
    await act(async () => { authDouble.signIn('CT') })
    await settle()
    expect(at(r)).toBe('/trial/t5')
    expect(opened).not.toContain('SignIn')
  })
})

describe('sign out', () => {
  it.each(['manual', 'expired', 'signed out elsewhere'])('(%s) lands on sign in with the stack reset and the cache emptied', async () => {
    const r = await launch('/', 'signed_in', 'AD')
    qc.setQueryData(['project', 'p1'], { project_name: 'Dam' })
    await act(async () => { router.push('/more') })
    await act(async () => { router.push('/project/p1') })
    await act(async () => { router.push('/admin/users') })
    expect(router.canGoBack()).toBe(true)
    await endSession()
    expect(at(r)).toBe('/sign-in')
    expect(router.canGoBack()).toBe(false)
    expect(screen.queryByText(/SCREEN:(Project|Users|More|MyWork)/)).toBeNull()
    expect(qc.getQueryData(['project', 'p1'])).toBeUndefined()
    // Pushing a signed in screen while signed out does not show it.
    await act(async () => { router.push('/project/p1') })
    expect(screen.queryByText('SCREEN:Project')).toBeNull()
  })

  it('signing in again (another person) starts at My work, not where the last one was', async () => {
    const r = await launch('/', 'signed_in', 'AD')
    await act(async () => { router.push('/admin/master-data') })
    await endSession()
    opened.length = 0
    await signIn('CT')
    expect(at(r)).toBe('/')
    expect(router.canGoBack()).toBe(false)
    expect(opened).not.toContain('MasterData')
  })

  it('from the "could not be reached" screen also goes to sign in', async () => {
    const r = await launch('/', 'unavailable')
    expect(screen.getByText('CCA could not be reached')).toBeTruthy()
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Sign out' })) })
    await settle()
    expect(at(r)).toBe('/sign-in')
  })
})

describe('unknown routes', () => {
  it('show not found with a way home when signed in', async () => {
    const r = await launch('/nothing/here', 'signed_in', 'SP')
    // A launch link the app does not have opens My work; a link while running shows not found.
    expect(at(r)).toBe('/')
    await act(async () => { router.push('/nothing/here' as never) })
    expect(screen.getByText(NOT_FOUND_TITLE)).toBeTruthy()
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Go to My work' })) })
    expect(at(r)).toBe('/')
  })

  it('show sign in when signed out', async () => {
    const r = await launch('/nothing/here')
    expect(at(r)).toBe('/sign-in')
  })
})

// Role x screen, from the server rules (cca/core/permissions.py, cca/projects/workflow.py, cca/*/api.py).
const ALL: Role[] = ['AD', 'SAD', 'SP', 'CT']
const MATRIX: [string, string, Role[]][] = [
  ['/', 'MyWork', ALL],
  ['/projects', 'Projects', ALL],
  ['/search', 'Search', ALL],
  ['/alerts', 'Alerts', ALL],
  ['/more', 'More', ALL],
  ['/project/p1', 'Project', ALL],
  ['/project/new', 'ProjectForm', ['AD', 'SAD', 'SP']],
  ['/project/new?id=p1', 'ProjectForm', ['AD', 'SAD', 'SP']],
  ['/trial', 'Trials', ALL],
  ['/trial/t1', 'Trial', ALL],
  ['/sieve-data/p1', 'SieveData', ALL],
  ['/recipes', 'Recipes', ['AD', 'CT']],
  ['/recipes/5', 'Recipe', ['AD', 'SAD', 'CT']],
  ['/recipes/new', 'Recipe', ['AD', 'SAD', 'CT']],
  ['/admin/users', 'Users', ['AD']],
  ['/admin/master-data', 'MasterData', ['AD']],
  ['/sync', 'Sync', ALL],
]
const CASES = MATRIX.flatMap(([path, name, roles]) => ALL.map((role) => [role, path, name, roles.includes(role)] as const))

describe('role x screen (opened by link, notification or typed route)', () => {
  it.each(CASES)('%s %s -> %s allowed: %s', async (role, path, name, allowed) => {
    const r = await launch(path, 'signed_in', role)
    expect(at(r)).toBe(path)
    if (allowed) {
      expect(screen.getByText(`SCREEN:${name}`)).toBeTruthy()
      expect(screen.queryByText(NO_ACCESS_TITLE)).toBeNull()
    } else {
      expect(screen.getByText(NO_ACCESS_TITLE)).toBeTruthy()
      expect(opened).not.toContain(name)
      expect(mockApi).not.toHaveBeenCalled()
      // Pushed from inside the app as well (a button or an alert).
      await act(async () => { router.push('/') })
      await act(async () => { router.push(path as never) })
      expect(screen.getByText(NO_ACCESS_TITLE)).toBeTruthy()
      expect(opened).not.toContain(name)
    }
  })

  it('the matrix in the app matches the server table above', () => {
    const keyOf: Record<string, Parameters<typeof canOpen>[1]> = {
      '/': 'home', '/projects': 'projects', '/search': 'search', '/alerts': 'alerts', '/more': 'more', '/project/p1': 'project',
      '/project/new': 'project-new', '/project/new?id=p1': 'project-edit', '/trial': 'trials', '/trial/t1': 'trial',
      '/sieve-data/p1': 'sieve-data', '/recipes': 'recipes', '/recipes/5': 'recipe', '/recipes/new': 'recipe-new',
      '/admin/users': 'users', '/admin/master-data': 'master-data', '/sync': 'sync',
    }
    for (const [path, , roles] of MATRIX) for (const role of ALL) expect([path, role, canOpen(role, keyOf[path])]).toEqual([path, role, roles.includes(role)])
  })

  it('every route file is a signed in screen and is in the matrix', () => {
    const files = appFiles().map((f) => f.replace(/\.tsx?$/, ''))
    const screens = files.filter((f) => !/(^|\/)_layout$/.test(f) && f !== '+native-intent' && f !== 'sign-in')
    const declared = new Set<string>(SIGNED_IN_SCREENS)
    for (const f of screens) expect([f, f.startsWith('(tabs)/') || declared.has(f)]).toEqual([f, true])
    const toPath = (f: string) => '/' + f.replace(/^\(tabs\)\/?/, '').replace(/(^|\/)index$/, '').replace(/\[id\]/, '').replace(/\/$/, '')
    const covered = MATRIX.map(([p]) => p.split('?')[0])
    for (const f of screens.filter((x) => x !== '+not-found')) {
      const prefix = toPath(f).replace(/\/$/, '') || '/'
      expect([f, covered.some((p) => p === prefix || p.startsWith(prefix === '/' ? '/' : prefix + '/') || (prefix === '/' && p === '/'))]).toEqual([f, true])
    }
  })
})
