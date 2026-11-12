/**
 * Photos and videos under each reading time of the fresh concrete table (UAT, 12 Nov 2026; legacy: a file
 * per time column). Each reading row has a camera button with how many it holds; it opens a sheet to take a
 * photo, record a video (up to 60 seconds) or choose from the library, see what is there and remove it.
 * Files are kept on the phone and uploaded in order, now or when back online (the offline queue); the
 * server stores photos at most 1920 px as JPEG and videos as 720p MP4.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as ImagePicker from 'expo-image-picker'
import { useEffect, useState } from 'react'
import { Alert, Image, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Circle, Path } from 'react-native-svg'

import { api, session } from '@/api/client'
import { errorMessage } from '@/api/errors'
import { useOnline } from '@/offline/connectivity'
import { kick, outbox, useInFlight, useTrialOps } from '@/offline/outbox'
import type { Op } from '@/offline/queue'
import { queueFiles } from '@/offline/trialActions'
import type { Trial } from '@/shared/types'
import { Banner, Button, H2, Row, Small } from '@/ui/kit'
import { color, font, radius, TOUCH } from '@/ui/theme'

import { extOf, kindOf, MEDIA_MAX_PER_READING, MIME, PHOTO_MAX_MB, photoName, planUploads, VIDEO_MAX_MB, VIDEO_MAX_SECONDS, type PickedFile } from './attachments'
import { downloadAndShare } from './download'
import { fileSize } from './format'
import { readingLabel } from './forms'
import { useWorkspace } from './workspace'

type Upload = Extract<Op, { kind: 'upload_attachment' }>
type TrialFile = Trial['attachments'][number]

export function CameraIcon({ size = 20, tint = color.ink }: { size?: number; tint?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 8h3l2-3h6l2 3h3v11H4z" /><Circle cx={12} cy={13} r={3.5} />
    </Svg>
  )
}

/** The camera button in a reading row: how many photos and videos the time holds (uploaded and waiting). */
export function ReadingMediaButton({ reading }: { reading: string }) {
  const { trial } = useWorkspace()
  const ops = useTrialOps(trial.id)
  const [open, setOpen] = useState(false)
  const count = trial.attachments.filter((a) => a.reading === reading).length
    + ops.filter((o): o is Upload => o.kind === 'upload_attachment' && o.reading === reading).length
  if (!count && !trial.actions.attach) return <View style={{ width: 40 }} />
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} hitSlop={4}
        accessibilityLabel={`${readingLabel(reading)} photos and videos, ${count || 'none'}`}
        style={{ width: 40, height: 40, borderRadius: radius.field, borderWidth: 1, borderColor: count ? color.link : color.field, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface }}>
        <CameraIcon size={18} tint={count ? color.link : color.subtle} />
        {count ? (
          <View style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: color.link, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text style={{ color: '#fff', fontFamily: font.bold, fontSize: 11 }}>{count}</Text>
          </View>
        ) : null}
      </Pressable>
      {open ? <ReadingMediaSheet reading={reading} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

/** A thumbnail from the server, with the signed in session (files are private). */
function Thumb({ trialId, file }: { trialId: string; file: TrialFile }) {
  const [failed, setFailed] = useState(false)
  const token = session.accessToken()
  const video = (file.kind ?? kindOf(file.original_name)) === 'video'
  return (
    <View style={{ width: 96, height: 96, borderRadius: radius.field, overflow: 'hidden', backgroundColor: color.head, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' }}>
      {file.has_thumbnail && !failed ? (
        <Image accessibilityIgnoresInvertColors style={{ width: 96, height: 96 }} resizeMode="cover" onError={() => setFailed(true)}
          source={{ uri: `${session.baseUrl}/trials/${trialId}/attachments/${file.id}/thumbnail/`, headers: token ? { Authorization: `Bearer ${token}` } : {} }} />
      ) : <Text style={{ fontFamily: font.bold, fontSize: 12, color: color.subtle }}>{video ? 'VIDEO' : extOf(file.original_name).toUpperCase()}</Text>}
      {video ? (
        <View style={{ position: 'absolute', width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,.55)', alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={14} height={14} viewBox="0 0 24 24"><Path d="M7 4l13 8-13 8z" fill="#fff" /></Svg>
        </View>
      ) : null}
    </View>
  )
}

function ReadingMediaSheet({ reading, onClose }: { reading: string; onClose: () => void }) {
  const { trial, notify } = useWorkspace()
  const qc = useQueryClient()
  const online = useOnline()
  const sending = useInFlight()
  const ops = useTrialOps(trial.id)
  const label = readingLabel(reading)
  const files = trial.attachments.filter((a) => a.reading === reading)
  const waiting = ops.filter((o): o is Upload => o.kind === 'upload_attachment' && o.reading === reading)
  const allWaiting = ops.filter((o): o is Upload => o.kind === 'upload_attachment')
  const [problems, setProblems] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState<number | null>(null)
  const room = MEDIA_MAX_PER_READING - files.length - waiting.length
  const canAttach = trial.actions.attach && room > 0
  const canDelete = trial.actions.edit

  // A video being made smaller on the server: look again every few seconds while the sheet is open.
  const pending = files.some((a) => a.processing === 'pending')
  useEffect(() => {
    if (!pending) return
    const t = setInterval(() => { void qc.invalidateQueries({ queryKey: ['trial', trial.id] }) }, 4000)
    return () => clearInterval(t)
  }, [pending, qc, trial.id])
  // Thumbnails load with the access token: refresh it once if it has run out.
  useQuery({ queryKey: ['auth-me-refresh', trial.id], queryFn: () => api('/auth/me/'), staleTime: 60_000, enabled: online })

  async function add(picked: PickedFile[]) {
    if (!picked.length) return
    const { upload, problems: skipped } = planUploads(picked, trial.attachments.length + allWaiting.length, { label, existing: files.length + waiting.length })
    if (!upload.length) { setProblems(skipped); return }
    setBusy(true)
    try {
      const failed = await queueFiles(trial.id, upload, reading)
      setProblems([...skipped, ...failed])
      const kept = upload.length - failed.length
      if (kept) notify({ tone: 'info', text: `${kept === 1 ? '1 file' : `${kept} files`} for ${label} ${online ? 'uploading now' : 'kept on this phone, uploading when back online'}.` })
    } finally {
      setBusy(false)
    }
  }

  const asFile = (a: ImagePicker.ImagePickerAsset): PickedFile => {
    const name = photoName(a.fileName, a.mimeType ?? (a.type === 'video' ? 'video/mp4' : 'image/jpeg'))
    return { uri: a.uri, name, type: a.mimeType ?? MIME[extOf(name)] ?? 'application/octet-stream', size: a.fileSize, duration: a.duration ? a.duration / 1000 : null }
  }

  async function camera(kind: 'images' | 'videos') {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (!perm.granted) {
        Alert.alert('Camera access is off', 'Allow CCA to use the camera in your phone settings to photograph and film slump tests.', [
          { text: 'Not now', style: 'cancel' },
          ...(perm.canAskAgain ? [] : [{ text: 'Open settings', onPress: () => { Linking.openSettings() } }]),
        ])
        return
      }
      // Photos are compressed on the phone; videos are capped at 60 s and 720p (iOS), and made smaller on the server.
      const r = await ImagePicker.launchCameraAsync(kind === 'images'
        ? { mediaTypes: ['images'], quality: 0.7 }
        : { mediaTypes: ['videos'], videoMaxDuration: VIDEO_MAX_SECONDS, videoQuality: ImagePicker.UIImagePickerControllerQualityType.IFrame1280x720 })
      if (r.canceled || !r.assets?.length) return
      await add(r.assets.map(asFile))
    } catch {
      setProblems(['The camera could not be opened. Try again, or choose from the library.'])
    }
  }

  async function library() {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, selectionLimit: Math.max(1, room), quality: 0.7,
      })
      if (r.canceled || !r.assets?.length) return
      await add(r.assets.map(asFile))
    } catch {
      setProblems(['The photo library could not be opened. Try again.'])
    }
  }

  async function view(a: TrialFile) {
    setOpening(a.id)
    try { await downloadAndShare(`/trials/${trial.id}/attachments/${a.id}/`, a.original_name, a.content_type || MIME[extOf(a.original_name)] || 'application/octet-stream') }
    catch (e) { setProblems([errorMessage(e, 'The file could not be opened. Try again.')]) }
    finally { setOpening(null) }
  }

  function remove(a: TrialFile) {
    Alert.alert(`Remove ${a.original_name}?`, `It is taken off ${label} for everyone.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: () => {
          api(`/trials/${trial.id}/attachments/${a.id}/`, { method: 'DELETE' })
            .then(() => qc.invalidateQueries({ queryKey: ['trial', trial.id] }))
            .catch((e: unknown) => setProblems([errorMessage(e, 'Not removed. Try again.')]))
        },
      },
    ])
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: color.surface }}>
        <Row style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: color.divider }}>
          <H2 style={{ flex: 1 }}>{label} photos and videos</H2>
          <Button title="Done" variant="tertiary" onPress={onClose} />
        </Row>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
          {problems.length ? <Banner tone="error">{problems.join(' ')}</Banner> : null}
          {files.length === 0 && waiting.length === 0 ? <Small>Nothing for {label} yet.</Small> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {files.map((a) => (
              <View key={a.id} style={{ width: 96, gap: 4 }}>
                <Pressable accessibilityRole="button" onPress={() => { void view(a) }}
                  accessibilityLabel={`Open ${a.original_name}${a.processing === 'pending' ? ', being made smaller' : ''}`}>
                  <Thumb trialId={trial.id} file={a} />
                </Pressable>
                <Small numberOfLines={1}>{opening === a.id ? 'Opening…' : a.processing === 'pending' ? 'Making smaller…' : fileSize(a.size)}</Small>
                {canDelete ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${a.original_name}`} onPress={() => remove(a)} hitSlop={6}>
                    <Text style={{ fontFamily: font.semibold, fontSize: 13, color: color.error }}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
            {waiting.map((o) => (
              <View key={o.id} style={{ width: 96, gap: 4 }}>
                <View style={{ width: 96, height: 96, borderRadius: radius.field, borderWidth: 1, borderStyle: 'dashed', borderColor: color.field, alignItems: 'center', justifyContent: 'center', padding: 6 }}>
                  <Text numberOfLines={2} style={{ fontFamily: font.regular, fontSize: 12, color: color.subtle, textAlign: 'center' }}>{o.name}</Text>
                </View>
                <Small numberOfLines={2}>{o.state === 'failed' ? 'Not uploaded' : sending === o.id ? 'Uploading…' : online ? 'Waiting to upload' : 'Uploads when online'}</Small>
              </View>
            ))}
          </View>
          {waiting.filter((o) => o.state === 'failed').map((o) => (
            <View key={`f-${o.id}`} style={{ gap: 8 }}>
              <Banner tone="error">{o.name}: {o.error?.fields.file ?? o.error?.message ?? 'The server refused this file.'}</Banner>
              <Row style={{ gap: 10 }}>
                <Button title="Discard" variant="danger" onPress={() => { void outbox.discard(o.id) }} accessibilityLabel={`Discard ${o.name}`} />
                <Button title="Retry" disabled={!online} onPress={() => { void outbox.retry(o.id).then(kick) }} accessibilityLabel={`Retry ${o.name}`} />
              </Row>
            </View>
          ))}
          {canAttach ? (
            <View style={{ gap: 10 }}>
              <Button title="Take photo" variant="primary" busy={busy} onPress={() => { void camera('images') }} />
              <Button title={`Record video, up to ${VIDEO_MAX_SECONDS} s`} busy={busy} onPress={() => { void camera('videos') }} />
              <Button title="Choose from library" variant="tertiary" busy={busy} onPress={() => { void library() }} />
            </View>
          ) : trial.actions.attach ? <Small>{label} has {MEDIA_MAX_PER_READING} photos or videos, the most a reading time takes. Remove one to add another.</Small> : null}
          <Small>
            Photos up to {PHOTO_MAX_MB} MB and videos up to {VIDEO_MAX_MB} MB and {VIDEO_MAX_SECONDS} seconds, {MEDIA_MAX_PER_READING} per reading time.
            They are stored smaller on the server. Taken offline, they upload when you are back online.
          </Small>
          <View style={{ minHeight: TOUCH }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}
