/**
 * Keeps the data a CT needs on site after the app closes: projects, trials,
 * dropdown values, products, recipes and the signed in user. The TanStack
 * query cache is dehydrated to one JSON document a moment after it changes
 * and when the app goes to the background, and hydrated again on launch for
 * the same user. Searches, alerts and other short lived data are left out.
 * Signing out deletes the document.
 */
import { dehydrate, hydrate, type Query, type QueryClient } from '@tanstack/react-query'

import type { User } from '@/shared/types'

import type { Storage } from './storage'

const DOC = 'cache.json'
const VERSION = 1
export const CACHE_MAX_AGE_MS = 7 * 24 * 3_600_000

const ROOTS = new Set(['projects', 'project', 'trials', 'trial', 'lookups', 'recipes', 'recipe', 'users', 'grading-limits'])

export function shouldPersist(q: Pick<Query, 'queryKey' | 'state'>) {
  const [root, , sub] = q.queryKey as unknown[]
  if (q.state.status !== 'success' || typeof root !== 'string' || !ROOTS.has(root)) return false
  if (root === 'trial' && sub === 'close-check') return false
  return true
}

type Doc = { v: number; userId: number; savedAt: number; user: User; state: ReturnType<typeof dehydrate> }

async function readDoc(storage: Storage): Promise<Doc | null> {
  const text = await storage.read(DOC)
  if (!text) return null
  try {
    const doc = JSON.parse(text) as Doc
    return doc.v === VERSION && doc.user && typeof doc.userId === 'number' ? doc : null
  } catch {
    return null
  }
}

export async function saveCache(storage: Storage, qc: QueryClient, user: User, now = Date.now()) {
  const doc: Doc = { v: VERSION, userId: user.id, savedAt: now, user, state: dehydrate(qc, { shouldDehydrateQuery: shouldPersist }) }
  await storage.write(DOC, JSON.stringify(doc))
}

/** Put the saved data back for this user. Another user's (or too old) data is deleted instead. */
export async function restoreCache(storage: Storage, qc: QueryClient, userId: number, now = Date.now()) {
  const doc = await readDoc(storage)
  if (!doc) return false
  if (doc.userId !== userId || now - doc.savedAt > CACHE_MAX_AGE_MS) {
    await storage.remove(DOC)
    return false
  }
  hydrate(qc, doc.state)
  return true
}

/** The user saved with the cache: lets a saved session open offline. */
export async function cachedUser(storage: Storage, now = Date.now()): Promise<User | null> {
  const doc = await readDoc(storage)
  return doc && now - doc.savedAt <= CACHE_MAX_AGE_MS ? doc.user : null
}

const active = new Set<{ stop: () => void }>()

/** Sign out: stop saving and delete the saved data, so the next person never sees it. */
export async function clearCache(storage: Storage) {
  active.forEach((p) => p.stop())
  await storage.remove(DOC)
}

/** Save a moment after the cache settles. Returns the stop function and a save-now for going to the background. */
export function persistOnChange(storage: Storage, qc: QueryClient, user: User, delayMs = 2000) {
  let timer: ReturnType<typeof setTimeout> | null = null
  const save = () => {
    if (timer) clearTimeout(timer)
    timer = null
    return saveCache(storage, qc, user).catch(() => undefined)
  }
  const unsubscribe = qc.getQueryCache().subscribe((e) => {
    if (e.type !== 'updated' && e.type !== 'removed') return
    if (e.type === 'updated' && e.action.type !== 'success') return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { void save() }, delayMs)
  })
  let stopped = false
  const handle = {
    stop() { stopped = true; if (timer) clearTimeout(timer); timer = null; unsubscribe(); active.delete(handle) },
    saveNow: () => (stopped ? Promise.resolve() : save()),
  }
  active.add(handle)
  return handle
}
