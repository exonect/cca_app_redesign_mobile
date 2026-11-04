// The saved query cache: what is kept, for whom, and for how long.
import { QueryClient } from '@tanstack/react-query'

import type { User } from '@/shared/types'

import { CACHE_MAX_AGE_MS, cachedUser, clearCache, persistOnChange, restoreCache, saveCache, shouldPersist } from './cache'
import { memoryStorage } from './storage'

const user = { id: 7, full_name: 'Sneha Rao', role: 'CT' } as User
const q = (queryKey: unknown[], status = 'success') => ({ queryKey, state: { status } }) as Parameters<typeof shouldPersist>[0]

function filled() {
  const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
  qc.setQueryData(['trial', 't1'], { id: 't1', code: 'W-1' })
  qc.setQueryData(['projects', 'list', { status: 'assigned_to_ct' }], { results: [] })
  qc.setQueryData(['lookups', 'bleeding', null], [{ id: 5, value: 'Nil' }])
  qc.setQueryData(['search', { product: 'x' }], { groups: [] })
  qc.setQueryData(['notifications', 'unread-count'], { unread: 2 })
  qc.setQueryData(['trial', 't1', 'close-check'], { warnings: [] })
  return qc
}

describe('what is kept', () => {
  it('keeps projects, trials, dropdowns, products and users, not searches, alerts or close checks', () => {
    expect(shouldPersist(q(['trial', 't1']))).toBe(true)
    expect(shouldPersist(q(['recipes', 'products']))).toBe(true)
    expect(shouldPersist(q(['grading-limits', 'IS 383', '20']))).toBe(true)
    expect(shouldPersist(q(['search', {}]))).toBe(false)
    expect(shouldPersist(q(['notifications', 'unread-count']))).toBe(false)
    expect(shouldPersist(q(['trial', 't1', 'close-check']))).toBe(false)
    expect(shouldPersist(q(['trial', 't1'], 'error'))).toBe(false)
  })
})

describe('save and restore', () => {
  it('puts the same user\'s data back after a restart', async () => {
    const storage = memoryStorage()
    await saveCache(storage, filled(), user)
    const fresh = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
    expect(await restoreCache(storage, fresh, 7)).toBe(true)
    expect(fresh.getQueryData(['trial', 't1'])).toEqual({ id: 't1', code: 'W-1' })
    expect(fresh.getQueryData(['lookups', 'bleeding', null])).toEqual([{ id: 5, value: 'Nil' }])
    expect(fresh.getQueryData(['search', { product: 'x' }])).toBeUndefined()
    expect(await cachedUser(storage)).toMatchObject({ id: 7, full_name: 'Sneha Rao' })
  })

  it('never shows one person\'s data to another, and deletes it', async () => {
    const storage = memoryStorage()
    await saveCache(storage, filled(), user)
    const fresh = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
    expect(await restoreCache(storage, fresh, 8)).toBe(false)
    expect(fresh.getQueryData(['trial', 't1'])).toBeUndefined()
    expect(storage.docs['cache.json']).toBeUndefined()
  })

  it('drops data older than a week', async () => {
    const storage = memoryStorage()
    const then = Date.now() - CACHE_MAX_AGE_MS - 1000
    await saveCache(storage, filled(), user, then)
    expect(await cachedUser(storage)).toBeNull()
    expect(await restoreCache(storage, new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } }), 7)).toBe(false)
  })

  it('saves a moment after data arrives, and stops for good on sign out', async () => {
    jest.useFakeTimers()
    try {
      const storage = memoryStorage()
      const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
      persistOnChange(storage, qc, user, 1000)
      qc.setQueryData(['trial', 't2'], { id: 't2' })
      expect(storage.docs['cache.json']).toBeUndefined()
      await jest.advanceTimersByTimeAsync(1100)
      expect(JSON.parse(storage.docs['cache.json']).userId).toBe(7)
      await clearCache(storage)
      qc.setQueryData(['trial', 't3'], { id: 't3' })
      await jest.advanceTimersByTimeAsync(1100)
      expect(storage.docs['cache.json']).toBeUndefined()
    } finally {
      jest.useRealTimers()
    }
  })
})
