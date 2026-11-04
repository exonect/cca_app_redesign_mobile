/**
 * The app's single change queue, wired to the API and the query cache, and
 * the hooks screens use to read it.
 */
import type { QueryClient } from '@tanstack/react-query'
import * as Crypto from 'expo-crypto'
import { File } from 'expo-file-system'
import { useMemo, useSyncExternalStore } from 'react'

import { api, UPLOAD_TIMEOUT_MS } from '@/api/client'
import { attachmentForm } from '@/features/trials/attachments'
import type { Lookup, Recipe, Trial } from '@/shared/types'
import type { Attachment } from '@/shared/typesExt'

import { saveCacheNow } from './cache'
import { isOnline } from './connectivity'
import type { LabelFor } from './overlay'
import { Outbox, PermanentError, type Op, type OpInput } from './queue'
import { fileKeeper, offlineStorage } from './storage'

let client: QueryClient | null = null
export function bindQueryClient(qc: QueryClient | null) { client = qc }

function keptUri(stored: string) {
  try { return fileKeeper.uriOf(stored) } catch { return stored } // no file system: use what was stored
}

function fileExists(uri: string) {
  try { return new File(uri).exists } catch { return true } // cannot tell: let the upload try
}

/** One request per change. Each is safe to repeat (see queue.ts). */
export function sendOp(op: OpInput): Promise<unknown> {
  switch (op.kind) {
    case 'create_trial':
      return api<Trial>('/trials/', { body: { id: op.trialId, project: op.project } })
    case 'patch_trial':
      return api<Trial>(`/trials/${op.trialId}/`, { method: 'PATCH', body: op.body })
    case 'put_cubes':
      return op.body.remove
        ? api<Trial>(`/trials/${op.trialId}/cubes/${op.age}/`, { method: 'DELETE' })
        : api<Trial>(`/trials/${op.trialId}/cubes/${op.age}/`, { method: 'PUT', body: op.body })
    case 'start_trial':
      return api<Trial>(`/trials/${op.trialId}/start/`, { method: 'POST' })
    case 'upload_attachment': {
      // The queue keeps the file's name; where it lives is worked out now (the path changes on an iOS update).
      const uri = keptUri(op.uri)
      if (!fileExists(uri)) return Promise.reject(new PermanentError(`${op.name} is no longer on this phone. Discard it and add the file again.`))
      return api<Attachment>(`/trials/${op.trialId}/attachments/`, {
        form: attachmentForm({ uri, name: op.name, type: op.type }, op.clientId, op.reading), timeoutMs: UPLOAD_TIMEOUT_MS,
      })
    }
  }
}

/** Store what the server answered, so screens show the synced trial. */
export function storeResult(qc: QueryClient, op: Pick<Op, 'kind' | 'trialId'>, result: unknown) {
  if (!result || typeof result !== 'object') return
  if (op.kind === 'upload_attachment') {
    const a = result as Attachment
    qc.setQueryData<Trial>(['trial', op.trialId], (t) => (t && !t.attachments.some((x) => x.id === a.id) ? { ...t, attachments: [...t.attachments, a] } : t))
    return
  }
  const t = result as Trial
  qc.setQueryData(['trial', op.trialId], t)
  void qc.invalidateQueries({ queryKey: ['trials'] })
  if (t.project) void qc.invalidateQueries({ queryKey: ['project', t.project], exact: true })
}

export const outbox = new Outbox({
  storage: {
    read: (n) => offlineStorage().read(n),
    write: (n, t) => offlineStorage().write(n, t),
    remove: (n) => offlineStorage().remove(n),
  },
  send: (op) => sendOp(op),
  onSent: async (op, result) => {
    if (!client) return
    storeResult(client, op, result)
    await saveCacheNow()
  },
  onRemoved: (op) => { if (op.kind === 'upload_attachment') void fileKeeper.drop(op.uri) },
  uuid: () => Crypto.randomUUID(),
})

/** Replay soon, if the server can be reached. */
export function kick() {
  if (isOnline() && outbox.user !== null && outbox.loaded) void outbox.flush().catch(() => undefined)
}

export const newId = () => Crypto.randomUUID()

/** Names for ids chosen offline, from cached dropdown values and products. */
export function labelsFrom(qc: QueryClient | null): LabelFor {
  return (field, id) => {
    if (!qc) return undefined
    if (field === 'admixture_1' || field === 'admixture_2') {
      const rows = qc.getQueryData<{ id: number; label: string; family: Recipe['family'] }[]>(['recipes', 'products'])
      return rows?.find((r) => r.id === id)?.label
    }
    const rows = qc.getQueryData<Lookup[]>(['lookups', field, null])
    return rows?.find((r) => r.id === id)?.value
  }
}

// --- Hooks -------------------------------------------------------------------------

export function useOutbox(): Op[] {
  return useSyncExternalStore(outbox.subscribe, outbox.getSnapshot, outbox.getSnapshot)
}

export function useTrialOps(trialId: string | undefined): Op[] {
  const all = useOutbox()
  return useMemo(() => (trialId ? all.filter((o) => o.trialId === trialId) : []), [all, trialId])
}

/** Changes waiting to sync, and how many of them the server refused. */
export function useSyncCounts() {
  const all = useOutbox()
  return useMemo(() => ({ waiting: all.length, problems: all.filter((o) => o.state === 'failed').length }), [all])
}

/** Id of the change being sent right now (re-read on every queue change). */
export function useInFlight() {
  useOutbox()
  return outbox.inFlight
}
