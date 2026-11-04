/** Offline status in the interface: the bar above every screen, the per trial
 * "Not synced yet" chip, and the note shown for data not saved on the phone. */
import { router } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Banner, Pill } from '@/ui/kit'
import { color, font, TOUCH } from '@/ui/theme'

import { useOnline } from './connectivity'
import { useInFlight, useSyncCounts, useTrialOps } from './outbox'

const changes = (n: number) => (n === 1 ? '1 change' : `${n} changes`)

/** What the bar says, or null when there is nothing to say. */
export function barText(online: boolean, waiting: number, problems: number, sending: boolean): { text: string; tone: 'offline' | 'problem' | 'sync' } | null {
  if (!online) {
    return { tone: 'offline', text: waiting ? `Offline. ${changes(waiting)} waiting to sync.` : 'Offline. Changes you make are saved on this phone.' }
  }
  if (problems) return { tone: 'problem', text: `${problems === 1 ? '1 change' : `${problems} changes`} could not sync. Tap to review.` }
  if (waiting) return { tone: 'sync', text: sending ? `Syncing. ${changes(waiting)} waiting to sync.` : `${changes(waiting)} waiting to sync.` }
  return null
}

const TONE = {
  offline: { bg: color.ink, fg: '#FFFFFF' },
  problem: { bg: '#FBECEB', fg: '#7A1A14' },
  sync: { bg: '#DCE7F2', fg: '#1F4568' },
}

/** Sits above the screens; tapping it opens the sync list. Takes the top safe
 * area itself, so the screen header below it starts under it. */
export function OfflineBar() {
  const online = useOnline()
  const { waiting, problems } = useSyncCounts()
  const sending = useInFlight() !== null
  const bar = barText(online, waiting, problems, sending)
  if (!bar) return null
  const t = TONE[bar.tone]
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: t.bg }}>
      <Pressable accessibilityRole={waiting ? 'button' : undefined} accessibilityLabel={bar.text} accessibilityHint={waiting ? 'Opens the changes waiting to sync' : undefined}
        accessibilityLiveRegion="polite" disabled={!waiting} onPress={() => router.push('/sync')}
        style={{ minHeight: 32, paddingHorizontal: 16, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, fontFamily: font.semibold, fontSize: 14, color: t.fg }}>{bar.text}</Text>
        {waiting ? <Text style={{ fontFamily: font.semibold, fontSize: 14, color: t.fg }}>›</Text> : null}
      </Pressable>
    </SafeAreaView>
  )
}

/** "Not synced yet" (or "Sync problem") for a trial with changes still on the phone. */
export function SyncChip({ trialId }: { trialId: string }) {
  const ops = useTrialOps(trialId)
  if (!ops.length) return null
  return ops.some((o) => o.state === 'failed')
    ? <Pill text="Sync problem" bg="#FBECEB" fg="#7A1A14" />
    : <Pill text="Not synced yet" bg={color.below.bg} fg={color.below.fg} />
}

/** For a screen whose data is not on the phone while offline. */
export function NotOnPhone({ what }: { what: string }) {
  return <Banner tone="warn">{`You are offline and this ${what} is not saved on this phone. Open it once while online to have it here offline.`}</Banner>
}

/** A short line under the trial header while the trial has changes on the phone. */
export function TrialSyncNote({ trialId }: { trialId: string }) {
  const ops = useTrialOps(trialId)
  const online = useOnline()
  if (!ops.length) return null
  const failed = ops.filter((o) => o.state === 'failed').length
  const text = failed
    ? `${changes(failed)} to this trial could not sync. Review them in the sync list.`
    : `Not synced yet: ${changes(ops.length)} saved on this phone${online ? ', syncing now.' : ' will sync when you are back online.'}`
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={text} onPress={() => router.push('/sync')}
      style={{ minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, backgroundColor: failed ? '#FBECEB' : color.below.bg }}>
      <View><Text style={{ fontFamily: font.semibold, fontSize: 14, color: failed ? '#7A1A14' : color.below.fg }}>{text}</Text></View>
    </Pressable>
  )
}
