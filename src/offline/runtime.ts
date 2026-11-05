/**
 * Starts the offline layer for the signed in person: puts their saved data
 * back in the query cache, keeps saving it, follows the network, loads the
 * change queue and replays it whenever the server can be reached (on
 * reconnect, on coming back to the app, after each new change, and every
 * 30 seconds while changes wait). While online it also loads what a CT
 * needs on site (open trials, their projects, dropdown values, products),
 * so they are on the phone before the signal goes.
 */
import { onlineManager, type QueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { AppState } from 'react-native'

import { api, ping, type Page } from '@/api/client'
import { gradingLimitsQuery, lookupsQuery, productsQuery } from '@/api/hooks'
import type { Project, ProjectListItem, Trial, TrialListItem, User } from '@/shared/types'

import { persistOnChange, restoreCache } from './cache'
import { isOnline, networkDown, subscribe } from './connectivity'
import { watchNetwork } from './network'
import { bindQueryClient, kick, outbox } from './outbox'
import { offlineStorage } from './storage'

export const TRIAL_LOOKUPS = ['grade_of_concrete', 'cement_brand', 'cement_grade', 'mineral_admixture_source', 'coarse_aggregate_source', 'fine_aggregate_source', 'bleeding', 'setting']
const OPEN_TRIALS = { status: 'in_progress', page_size: 25, ordering: '-updated_at' }
const ASSIGNED = { status: 'assigned_to_ct', ordering: 'updated_at', page_size: 25 }
const WARM_EVERY_MS = 30 * 60_000
const TICK_MS = 30_000

/** Load what working offline needs. Failures are ignored: this is a head start, not a requirement. */
export async function warmOfflineCache(qc: QueryClient, user: Pick<User, 'role'>) {
  const jobs: Promise<unknown>[] = [
    ...TRIAL_LOOKUPS.map((c) => qc.prefetchQuery(lookupsQuery(c))),
    qc.prefetchQuery(productsQuery()),
    qc.prefetchQuery(gradingLimitsQuery()),
  ]
  if (user.role === 'CT' || user.role === 'SP') {
    jobs.push((async () => {
      const trials = await qc.fetchQuery({
        queryKey: ['trials', 'list', OPEN_TRIALS], staleTime: 60_000,
        queryFn: () => api<Page<TrialListItem>>('/trials/', { query: OPEN_TRIALS }),
      })
      const projects = new Set(trials.results.map((t) => t.project))
      if (user.role === 'CT') {
        const assigned = await qc.fetchQuery({
          queryKey: ['projects', 'list', ASSIGNED], staleTime: 60_000,
          queryFn: () => api<Page<ProjectListItem>>('/projects/', { query: ASSIGNED }),
        })
        assigned.results.forEach((p) => projects.add(p.id))
      }
      await Promise.allSettled([
        ...trials.results.map((t) => qc.prefetchQuery({ queryKey: ['trial', t.id], queryFn: () => api<Trial>(`/trials/${t.id}/`), staleTime: 60_000 })),
        ...[...projects].map((id) => qc.prefetchQuery({ queryKey: ['project', id], queryFn: () => api<Project>(`/projects/${id}/`), staleTime: 60_000 })),
      ])
    })())
  }
  await Promise.allSettled(jobs)
}

/** True once the saved data for this user is back in the cache (so screens open with it). */
export function useOfflineRuntime(qc: QueryClient, user: User | null): boolean {
  const userId = user?.id ?? null
  // The user whose saved data is back in the cache. A different person (or signing
  // out) makes it stale at once, worked out during render rather than in an effect.
  const [readyFor, setReadyFor] = useState<number | null>(null)
  const [seen, setSeen] = useState(userId)
  if (seen !== userId) {
    setSeen(userId)
    setReadyFor(null)
  }

  useEffect(() => {
    bindQueryClient(qc)
    const stopNetwork = watchNetwork()
    const unsubscribe = subscribe(() => onlineManager.setOnline(isOnline()))
    return () => { stopNetwork(); unsubscribe(); bindQueryClient(null) }
  }, [qc])

  useEffect(() => {
    if (!user) { outbox.setUser(null); return }
    let cancelled = false
    let persister: ReturnType<typeof persistOnChange> | null = null
    let lastWarm = 0
    const storage = offlineStorage()
    const warm = () => {
      if (!isOnline() || Date.now() - lastWarm < WARM_EVERY_MS) return
      lastWarm = Date.now()
      void warmOfflineCache(qc, user)
    }
    void (async () => {
      await restoreCache(storage, qc, user.id).catch(() => false)
      if (cancelled) return
      persister = persistOnChange(storage, qc, user)
      // The queue is read and the person set before screens open, so a save made
      // straight away sees the trial's waiting changes instead of going around them.
      outbox.setUser(user.id)
      if (!outbox.loaded) await outbox.load().catch(() => undefined)
      if (cancelled) return
      setReadyFor(user.id)
      kick()
      warm()
    })()

    let wasOnline = isOnline()
    const offConnectivity = subscribe(() => {
      const now = isOnline()
      if (now && !wasOnline) { kick(); warm() }
      wasOnline = now
    })
    // A queue that could not be read at launch (phone still locked, for example) is read again later.
    const retryLoad = () => { if (!outbox.loaded) void outbox.load().then(kick, () => undefined) }
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') { retryLoad(); kick() }
      else void persister?.saveNow()
    })
    const tick = setInterval(() => {
      // Requests failed but the phone says it has a network: check whether the server is back.
      if (!isOnline() && !networkDown()) void ping()
      retryLoad()
      if (outbox.getSnapshot().some((o) => o.state === 'pending')) kick()
    }, TICK_MS)
    return () => {
      cancelled = true
      offConnectivity()
      appState.remove()
      clearInterval(tick)
      persister?.stop()
    }
    // The user object changes on every /auth/me/ refresh; only a different person restarts this.
  }, [qc, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  return !user || (readyFor !== null && readyFor === userId)
}
