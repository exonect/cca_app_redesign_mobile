// The offline layer reports ready only once the signed in person's saved data is back (lint fix: no setState in effects).
import { QueryClient } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react-native'

import type { User } from '@/shared/types'

import { useOfflineRuntime } from './runtime'

jest.mock('@/api/client', () => ({ api: jest.fn(), ping: jest.fn(async () => false), UPLOAD_TIMEOUT_MS: 1 }))
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }))
jest.mock('./storage', () => {
  const { memoryStorage } = jest.requireActual('./storage')
  const store = memoryStorage()
  return { memoryStorage, offlineStorage: () => store, fileKeeper: { keep: jest.fn(), drop: jest.fn() } }
})
jest.mock('./network', () => ({ watchNetwork: () => () => undefined }))
const restores: Record<number, () => void> = {}
jest.mock('./cache', () => ({
  restoreCache: jest.fn((_s: unknown, _qc: unknown, id: number) => new Promise<boolean>((resolve) => { restores[id] = () => resolve(true) })),
  persistOnChange: jest.fn(() => ({ stop: jest.fn(), saveNow: jest.fn(async () => undefined) })),
}))
jest.mock('./connectivity', () => ({ isOnline: () => false, networkDown: () => true, subscribe: () => () => undefined }))

const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
const person = (id: number) => ({ id, role: 'CT' }) as User

it('is ready only once the data of the person signed in now is restored', async () => {
  const { result, rerender } = await renderHook(({ user }: { user: User | null }) => useOfflineRuntime(qc, user), { initialProps: { user: person(1) } })
  expect(result.current).toBe(false)
  await act(async () => { restores[1]() })
  expect(result.current).toBe(true)

  // Another person: not ready again until their own data is back.
  await rerender({ user: person(2) })
  expect(result.current).toBe(false)
  await act(async () => { restores[2]() })
  expect(result.current).toBe(true)

  // Signed out: nothing to wait for; signing back in waits again.
  await rerender({ user: null })
  expect(result.current).toBe(true)
  await rerender({ user: person(2) })
  expect(result.current).toBe(false)
  await act(async () => { restores[2]() })
  expect(result.current).toBe(true)
})
