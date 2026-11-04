/**
 * Changes saved on this phone that have not reached the server: sync
 * problems first (with the server's message, Retry and Discard), then the
 * changes waiting in line.
 */
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState } from 'react'
import { Alert, ScrollView, View } from 'react-native'

import { useOnline } from '@/offline/connectivity'
import { kick, outbox, useInFlight, useOutbox } from '@/offline/outbox'
import type { Op } from '@/offline/queue'
import { AGES } from '@/shared/calc'
import type { Trial } from '@/shared/types'
import { Banner, Body, Button, Card, EmptyState, Header, Small, Strong } from '@/ui/kit'
import { color } from '@/ui/theme'

/** What the change does, in plain words. */
export function describeOp(op: Op): string {
  switch (op.kind) {
    case 'create_trial': return `New trial for ${op.projectName || 'the project'}`
    case 'patch_trial': return op.what ? `${op.what} changes` : 'Trial changes'
    case 'put_cubes': return `${AGES[op.age]?.[0] ?? op.age} cube results`
    case 'start_trial': return 'Start the trial'
    case 'upload_attachment': return `File ${op.name}`
  }
}

/** Which trial it belongs to: its number, or the project for a trial not numbered yet. */
export function trialLabel(qc: QueryClient, ops: Op[], trialId: string): string {
  const t = qc.getQueryData<Trial>(['trial', trialId])
  if (t?.code) return t.code
  const create = ops.find((o) => o.trialId === trialId && o.kind === 'create_trial') as Extract<Op, { kind: 'create_trial' }> | undefined
  const project = t?.project_name ?? create?.projectName
  return project ? `Draft trial, ${project}` : 'Draft trial'
}

export function SyncScreen() {
  const qc = useQueryClient()
  const ops = useOutbox()
  const online = useOnline()
  const sending = useInFlight()
  const [busy, setBusy] = useState(false)
  const problems = ops.filter((o) => o.state === 'failed')
  const waiting = ops.filter((o) => o.state === 'pending')

  async function syncNow() {
    setBusy(true)
    try { await outbox.flush() } catch { /* shown per change */ } finally { setBusy(false) }
  }

  async function retry(op: Op) {
    await outbox.retry(op.id)
    kick()
  }

  function discard(op: Op) {
    const isNew = op.kind === 'create_trial'
    Alert.alert(isNew ? 'Discard this new trial?' : 'Discard this change?',
      isNew
        ? 'The trial and everything entered on it on this phone will be removed. This cannot be undone.'
        : 'It will not be sent to the server, and the trial goes back to what the server has. This cannot be undone.',
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => { void outbox.discard(op.id).then(() => kick()) } },
      ])
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.concrete }}>
      <Header title="Changes to sync" subtitle={online ? undefined : 'Offline'}
        back={{ label: 'back', onPress: () => (router.canGoBack() ? router.back() : router.replace('/')) }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
        {!online ? <Banner tone="info">You are offline. These changes are saved on this phone and sync in order when you are back online.</Banner> : null}
        {ops.length === 0 ? (
          <Card><EmptyState title="Everything is synced" body="Changes you make offline wait here until the server has them." /></Card>
        ) : null}

        {problems.length ? (
          <View style={{ gap: 8 }}>
            <Strong>Could not sync</Strong>
            <Small>The server refused these changes. Fix the trial and retry, or discard the change. Later changes to the same trial wait until then.</Small>
            {problems.map((op) => (
              <Card key={op.id} style={{ borderColor: color.error }}>
                <Strong>{describeOp(op)}</Strong>
                <Small>{trialLabel(qc, ops, op.trialId)}</Small>
                <Banner tone="error">{op.error?.message ?? 'The server refused this change.'}</Banner>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {op.kind !== 'create_trial' ? (
                    <Button title="Open trial" onPress={() => router.push({ pathname: '/trial/[id]', params: { id: op.trialId } })} />
                  ) : null}
                  <Button title="Discard" variant="danger" onPress={() => discard(op)} />
                  <Button title="Retry" variant="primary" disabled={!online} onPress={() => { void retry(op) }} />
                </View>
              </Card>
            ))}
          </View>
        ) : null}

        {waiting.length ? (
          <View style={{ gap: 8 }}>
            <Strong>Waiting to sync</Strong>
            <Card>
              {waiting.map((op) => (
                <View key={op.id} style={{ gap: 2, paddingVertical: 4 }}>
                  <Body>{describeOp(op)}</Body>
                  <Small>{trialLabel(qc, ops, op.trialId)}{sending === op.id ? ', sending now' : ''}</Small>
                </View>
              ))}
            </Card>
            <Button title="Sync now" variant="primary" busy={busy} disabled={!online}
              accessibilityLabel={online ? 'Sync now' : 'Sync now, needs a connection'} onPress={() => { void syncNow() }} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}
