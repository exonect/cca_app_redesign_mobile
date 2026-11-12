/** Step 5, conclusion: requirement checks, Met / Below radio cards, remarks,
 * signatories with a signature pad each, attachments (take photo, choose
 * file, remove), then Close trial with the confirm_close dialog. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native'
import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg'

import { api, ApiError, fieldErrors } from '@/api/client'
import { errorMessage } from '@/api/errors'
import { useOnline } from '@/offline/connectivity'
import { kick, outbox, useInFlight, useTrialOps } from '@/offline/outbox'
import type { Op } from '@/offline/queue'
import { queueFiles, readyToClose } from '@/offline/trialActions'
import type { Outcome, Trial } from '@/shared/types'
import { Banner, Button, Field, OutcomeChip, Screen, Small, TextField } from '@/ui/kit'
import { color, font, radius, TOUCH } from '@/ui/theme'

import { extOf, MIME, photoName, planUploads, type PickedFile } from './attachments'
import { downloadAndShare } from './download'
import { date, fileSize, shortDate } from './format'
import {
  conclusionForm, conclusionPayload, conclusionProblems, LIMITS, readingLabel, SIGNATORIES, SIGNATORY_MAX, splitWarnings, type ConclusionForm,
} from './forms'
import { RadioCard, Section, StepFooter } from './parts'
import { SignaturePad } from './SignaturePad'
import { queuedNote, savedNotice, useReloadTrial, useStepForm, useWorkspace } from './workspace'

const REMARKS_MAX = LIMITS.remarks
const SHOWN = ['remarks', ...SIGNATORIES.flatMap((s) => [s.name, s.sign])]

export function ConclusionStep({ readOnly, banners }: { readOnly: boolean; banners: ReactNode }) {
  const { trial, project, header, accept, saveAll, notify, dirty, saving, startTrial, starting } = useWorkspace()
  const { form, setForm, errors } = useStepForm<ConclusionForm>('conclusion', (t) => conclusionForm(t, project), conclusionPayload, conclusionProblems, SHOWN)
  const [outcome, setOutcome] = useState<Outcome>(trial.outcome)
  const [outcomeError, setOutcomeError] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const closing = trial.actions.close
  // Legacy "Update Cube": an Admin or Sales Admin can change the conclusion and remarks of a closed trial.
  const [revising, setRevising] = useState(false)
  const choosing = closing || revising
  const online = useOnline()
  const synced = useTrialOps(trial.id).length === 0

  const check = useQuery({
    queryKey: ['trial', trial.id, 'close-check'],
    queryFn: () => api<{ warnings: string[]; checks: Trial['results']['checks'] }>(`/trials/${trial.id}/close-check/`),
    // The server's checks only make sense once it has every change made on this phone.
    enabled: trial.status === 'in_progress' && synced,
  })
  const checks = check.data?.checks ?? trial.results?.checks ?? []
  const met = checks.filter((c) => c.status === 'met').length
  const pending = checks.filter((c) => c.status === 'pending').length
  const notMet = checks.filter((c) => c.status === 'not_met').length

  const reload = useReloadTrial(trial.id)
  // One close at a time: saving first takes a moment, and a second tap must not close twice.
  const closingNow = useRef(false)
  const close = useMutation({
    mutationFn: (confirmed: boolean) => api<Trial>(`/trials/${trial.id}/close/`, {
      body: { outcome, remarks: form.remarks, ...(confirmed ? { confirm: true } : {}) },
    }),
  })

  async function closeTrial(confirmed = false) {
    if (closingNow.current) return
    setOutcomeError(null)
    if (!outcome) {
      const msg = 'Choose a conclusion before closing the trial.'
      setOutcomeError(msg)
      notify({ tone: 'error', text: msg })
      return
    }
    if (form.remarks.trim().length > REMARKS_MAX) { notify({ tone: 'error', text: `Remarks: use ${REMARKS_MAX} characters or fewer.` }); return }
    closingNow.current = true
    try {
      if (!confirmed && !(await saveAll())) return
      // Close is online only: it needs the server's checks and warnings, after this phone's changes have synced.
      const blocked = await readyToClose(trial.id)
      if (blocked) { notify({ tone: 'error', text: blocked }); return }
      if (!confirmed) {
        // Legacy: closing always asks first, listing anything not measured yet.
        const warnings = check.data?.warnings ?? []
        const what = outcome === 'met' ? 'met expectation' : 'below expectation'
        Alert.alert(warnings.length ? 'Close the trial anyway?' : 'Close this trial?',
          warnings.length
            ? `The conclusion will rest on the results entered so far:\n\n${warnings.map((w) => `• ${w}`).join('\n')}\n\nAn Admin or Sales Admin can still add cube results after closing.`
            : `Close ${trial.project_name}, trial ${trial.code ?? ''}, as ${what}? An Admin or Sales Admin can still add cube results after closing.`,
          [{ text: 'Keep it open', style: 'cancel' }, { text: 'Close trial', style: 'destructive', onPress: () => { void closeTrial(true) } }])
        return
      }
      const t = await close.mutateAsync(confirmed)
      accept(t)
      notify({ tone: 'ok', text: `Trial closed. ${t.code ?? ''}, ${t.outcome_label.toLowerCase()}.`.replace(' ,', ',') })
    } catch (e) {
      if (e instanceof ApiError && e.code === 'confirm_close') {
        const warnings = check.data?.warnings?.length ? check.data.warnings : splitWarnings(e.message)
        Alert.alert('Close the trial anyway?',
          `The conclusion will rest on the results entered so far:\n\n${warnings.map((w) => `• ${w}`).join('\n')}\n\nAn Admin or Sales Admin can still add cube results after closing.`,
          [{ text: 'Keep it open', style: 'cancel' }, { text: 'Close trial', style: 'destructive', onPress: () => { void closeTrial(true) } }])
        return
      }
      const f = fieldErrors(e)
      if (f.outcome) setOutcomeError(f.outcome)
      notify({ tone: 'error', text: f.outcome ?? errorMessage(e, 'The trial was not closed. Try again.') })
      reload(e)
    } finally {
      closingNow.current = false
    }
  }

  const revise = useMutation({
    mutationFn: () => api<Trial>(`/trials/${trial.id}/conclusion/`, { body: { outcome, remarks: form.remarks } }),
  })
  async function saveConclusion() {
    setOutcomeError(null)
    if (!outcome) { setOutcomeError('Choose met or below expectation.'); return }
    if (form.remarks.trim().length > REMARKS_MAX) { notify({ tone: 'error', text: `Remarks: use ${REMARKS_MAX} characters or fewer.` }); return }
    if (!online) { notify({ tone: 'error', text: 'Changing the conclusion needs a connection. Try again when you are back online.' }); return }
    try {
      const t = await revise.mutateAsync()
      accept(t)
      setRevising(false)
      notify({ tone: 'ok', text: `Conclusion changed to ${t.outcome_label.toLowerCase()}.` })
    } catch (e) {
      const f = fieldErrors(e)
      if (f.outcome) setOutcomeError(f.outcome)
      notify({ tone: 'error', text: f.outcome ?? errorMessage(e, 'The conclusion was not changed. Try again.') })
      reload(e)
    }
  }
  const cancelRevise = () => { setRevising(false); setOutcome(trial.outcome); setOutcomeError(null); setForm((f) => ({ ...f, remarks: trial.remarks ?? '' })) }

  const footer = revising ? (
    <StepFooter note="Saved with the remarks. The project timeline records the change.">
      <Button title="Cancel" onPress={cancelRevise} style={{ flex: 1 }} />
      <Button variant="primary" title="Save conclusion" onPress={() => { void saveConclusion() }} busy={revise.isPending} style={{ flex: 1.4 }} />
    </StepFooter>
  ) : trial.actions.start ? (
    <StepFooter><Button variant="primary" title="Start trial" onPress={startTrial} busy={starting} style={{ flex: 1 }} /></StepFooter>
  ) : closing ? (
    <StepFooter note={online
      ? 'Locks the trial and moves the project to Trials closed if this is the last open trial.'
      : 'Closing needs a connection. Everything else on this trial can be saved offline.'}>
      <Button variant="primary" title="Close trial" onPress={() => { void closeTrial(false) }} busy={close.isPending} disabled={saving} style={{ flex: 1 }} />
    </StepFooter>
  ) : !readOnly ? (
    <StepFooter><Button title="Save" onPress={async () => { if (await saveAll()) notify(savedNotice(trial.id, 'Conclusion saved')) }} disabled={!dirty} busy={saving} style={{ flex: 1 }} /></StepFooter>
  ) : <StepFooter><View /></StepFooter>

  return (
    <Screen header={header} footer={footer} scroll={false} padded={false}>
      {/* Own ScrollView so it can stop scrolling while a finger signs. */}
      <ScrollView scrollEnabled={!drawing} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}>
      {banners}
      <Section title="Requirement vs achieved" flush aside={checks.length ? (
        <Text accessibilityLiveRegion="polite" style={{ fontFamily: font.semibold, fontSize: 14, color: color.subtle }}>
          {met} met{notMet ? `, ${notMet} not met` : ''}{pending ? `, ${pending} pending` : ''}
        </Text>
      ) : undefined}>
        {check.isPending && trial.status === 'in_progress' && !trial.results?.checks?.length ? <ActivityIndicator style={{ padding: 12 }} color={color.ink} /> : null}
        {checks.length === 0 && !check.isPending ? (
          <Small style={{ paddingHorizontal: 16, paddingBottom: 12 }}>No requirement to check against. Add W/C, retention, strength or cementitious targets to the project.</Small>
        ) : checks.map((c) => (
          <View key={c.key} accessible accessibilityLabel={`${c.label}, required ${c.target}, achieved ${c.achieved ?? 'not yet'}, ${c.status === 'met' ? 'met' : c.status === 'not_met' ? 'not met' : 'pending'}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderColor: color.divider }}>
            <CheckIcon status={c.status} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: font.semibold, fontSize: 15, color: color.ink }}>{c.label}</Text>
              <Small>Required {c.target}</Small>
            </View>
            <Text style={{ fontFamily: font.bold, fontSize: 16, color: c.status === 'pending' ? color.muted : c.status === 'not_met' ? color.below.fg : color.ink, textAlign: 'right' }}>
              {c.achieved ?? 'Pending'}
            </Text>
          </View>
        ))}
      </Section>

      {closing && check.data && check.data.warnings.length > 0 ? (
        <Banner tone="warn">{`Before you close: ${check.data.warnings.join(' ')}`}</Banner>
      ) : null}

      {trial.status === 'closed' && !revising ? (
        <Section title="Trial conclusion">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <OutcomeChip outcome={trial.outcome} />
            <Small>Closed {date(trial.closed_at)}</Small>
          </View>
          {trial.actions.change_conclusion ? (
            <Button title="Change conclusion" onPress={() => { setOutcome(trial.outcome); setRevising(true) }} style={{ alignSelf: 'flex-start', flexGrow: 0 }} />
          ) : null}
        </Section>
      ) : (
        <View accessibilityRole="radiogroup" accessibilityLabel="Trial conclusion, required" style={{ gap: 8 }}>
          <Text style={{ fontFamily: font.semibold, fontSize: 15, color: color.ink }}>Trial conclusion</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <RadioCard title="Met expectation" body="Can be offered to the customer." selected={outcome === 'met'} disabled={!choosing}
              invalid={!!outcomeError} onPress={() => { setOutcome('met'); setOutcomeError(null) }} />
            <RadioCard title="Below expectation" body="Say what was missed in the remarks." selected={outcome === 'below'} disabled={!choosing}
              invalid={!!outcomeError} onPress={() => { setOutcome('below'); setOutcomeError(null) }} />
          </View>
          {outcomeError ? <Text accessibilityLiveRegion="polite" style={{ fontFamily: font.regular, fontSize: 13, color: color.error }}>{outcomeError}</Text> : null}
          {!closing && trial.status === 'draft' ? <Small>Start the trial before concluding it.</Small> : null}
        </View>
      )}

      <Field label="Remarks" error={errors.remarks} hint={`${form.remarks.length} of ${REMARKS_MAX} characters`}>
        <TextField accessibilityLabel="Remarks" multiline numberOfLines={3} maxLength={REMARKS_MAX} value={form.remarks} editable={!readOnly || closing || revising}
          invalid={!!errors.remarks} onChangeText={(v) => setForm((f) => ({ ...f, remarks: v }))}
          style={{ minHeight: 72, textAlignVertical: 'top', fontFamily: font.regular }} />
      </Field>

      <Section title="Signatures">
        {SIGNATORIES.map((s) => (
          <View key={s.name} style={{ gap: 8, paddingBottom: 6 }}>
            <Field label={s.label} error={errors[s.name]} hint={s.name === 'signatory_sales' ? (form.signatory_sales ? 'The person who created the project. Filled in automatically.' : 'No creator recorded on the project.') : undefined}>
              <TextField accessibilityLabel={`${s.label}, name`} placeholder="Name" value={form[s.name]} editable={!readOnly && s.name !== 'signatory_sales'} invalid={!!errors[s.name]} maxLength={SIGNATORY_MAX}
                onChangeText={(v) => setForm((f) => ({ ...f, [s.name]: v }))} />
            </Field>
            <SignaturePad label={form[s.name] || s.label} value={form[s.sign]} disabled={readOnly} onDrawing={setDrawing}
              onChange={(v) => setForm((f) => ({ ...f, [s.sign]: v }))} />
            {errors[s.sign] ? <Text accessibilityLiveRegion="polite" style={{ fontFamily: font.regular, fontSize: 13, color: color.error }}>{errors[s.sign]}</Text> : null}
          </View>
        ))}
      </Section>

      <Attachments />
      </ScrollView>
    </Screen>
  )
}

function CheckIcon({ status }: { status: 'met' | 'not_met' | 'pending' }) {
  const bg = status === 'met' ? color.met.solid : status === 'not_met' ? color.below.solid : color.status.draft.bg
  return (
    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={status === 'pending' ? color.subtle : '#fff'} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        {status === 'met' && <Polyline points="4 12 10 18 20 6" />}
        {status === 'not_met' && <><Path d="M7 7l10 10" /><Path d="M17 7L7 17" /></>}
        {status === 'pending' && <><Circle cx={12} cy={12} r={7} strokeWidth={2.5} /><Path d="M12 8v4l2.5 2" strokeWidth={2.5} /></>}
      </Svg>
    </View>
  )
}

function Attachments() {
  const { trial, notify } = useWorkspace()
  const qc = useQueryClient()
  const reload = useReloadTrial(trial.id)
  const online = useOnline()
  const sending = useInFlight()
  const ops = useTrialOps(trial.id)
  const waiting = ops.filter((o): o is Extract<Op, { kind: 'upload_attachment' }> => o.kind === 'upload_attachment')
  const [problems, setProblems] = useState<string[]>([])
  const [keeping, setKeeping] = useState(false)
  const [opening, setOpening] = useState<number | null>(null)
  const canAttach = trial.actions.attach
  const canDelete = trial.actions.edit
  const refresh = () => qc.invalidateQueries({ queryKey: ['trial', trial.id] })

  // Every photo and file is first copied into the app's own storage, then
  // uploaded in order with a client_id: now when online, later when not.
  async function upload(files: PickedFile[]) {
    if (!files.length) return
    const { upload: good, problems: skipped } = planUploads(files, trial.attachments.length + waiting.length)
    setKeeping(true)
    try {
      const failed = await queueFiles(trial.id, good)
      setProblems([...skipped, ...failed])
      const kept = good.length - failed.length
      if (kept) {
        const what = kept === 1 ? 'File saved' : `${kept} files saved`
        notify({ tone: 'info', text: online ? `${what}. Uploading now.` : queuedNote(what) })
      }
    } finally {
      setKeeping(false)
    }
  }

  async function retryUpload(op: Op) { await outbox.retry(op.id); kick() }
  function discardUpload(op: Extract<Op, { kind: 'upload_attachment' }>) {
    Alert.alert('Discard this file?', `${op.name} will not be uploaded and is removed from this phone.`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => { void outbox.discard(op.id) } },
    ])
  }

  async function takePhoto() {
    try { await photo() } catch { setProblems(['The camera could not be opened. Try again, or use Choose file.']) }
  }

  async function photo() {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Camera access is off', 'Allow CCA to use the camera in your phone settings to photograph cubes and slump tests.', [
        { text: 'Not now', style: 'cancel' },
        ...(perm.canAskAgain ? [] : [{ text: 'Open settings', onPress: () => { Linking.openSettings() } }]),
      ])
      return
    }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
    if (r.canceled || !r.assets?.length) return
    const a = r.assets[0]
    const name = photoName(a.fileName, a.mimeType)
    await upload([{ uri: a.uri, name, type: a.mimeType ?? MIME[extOf(name)] ?? 'image/jpeg', size: a.fileSize }])
  }

  async function chooseFile() {
    let r: DocumentPicker.DocumentPickerResult
    try {
      r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: Object.values(MIME).filter((v, i, xs) => xs.indexOf(v) === i) })
    } catch {
      setProblems(['Files could not be opened on this phone. Try again.'])
      return
    }
    if (r.canceled || !r.assets?.length) return
    await upload(r.assets.map((a) => ({ uri: a.uri, name: a.name, type: a.mimeType ?? MIME[extOf(a.name)] ?? 'application/octet-stream', size: a.size })))
  }

  const remove = useMutation({
    mutationFn: (id: number) => api(`/trials/${trial.id}/attachments/${id}/`, { method: 'DELETE' }),
    onSuccess: () => { refresh(); notify({ tone: 'ok', text: 'File removed' }) },
    onError: (e) => { notify({ tone: 'error', text: errorMessage(e, 'The file was not removed. Try again.') }); reload(e) },
  })

  function confirmRemove(id: number, name: string) {
    Alert.alert('Remove this file?', name, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(id) },
    ])
  }

  async function open(id: number, name: string, type: string) {
    setOpening(id)
    try { await downloadAndShare(`/trials/${trial.id}/attachments/${id}/`, name, type || MIME[extOf(name)] || 'application/octet-stream') }
    catch (e) { notify({ tone: 'error', text: errorMessage(e, 'The file could not be opened. Try again.') }) }
    finally { setOpening(null) }
  }

  return (
    <Section title="Attachments">
      <View accessibilityLiveRegion="polite" style={{ gap: 6 }}>
        {keeping ? <Small>Saving files on this phone…</Small> : null}
        {problems.length > 0 ? <Banner tone="error">{problems.join('\n')}</Banner> : null}
      </View>
      {waiting.map((op) => (
        <View key={op.id} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 44, height: 44, borderRadius: radius.field, alignItems: 'center', justifyContent: 'center', backgroundColor: color.below.bg }}>
              <Text style={{ fontFamily: font.bold, fontSize: 12, color: color.below.fg }}>{extOf(op.name).toUpperCase().slice(0, 4)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: 15, color: color.ink }}>{op.name}</Text>
              <Small>{op.reading ? `${readingLabel(op.reading)} reading. ` : ''}{op.state === 'failed' ? 'Not uploaded' : sending === op.id ? 'Uploading…' : online ? 'Not synced yet, waiting to upload' : 'Not synced yet, uploads when back online'}</Small>
            </View>
          </View>
          {op.state === 'failed' ? (
            <>
              <Banner tone="error">{op.error?.fields.file ?? op.error?.message ?? 'The server refused this file.'}</Banner>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="Discard" variant="danger" onPress={() => discardUpload(op)} />
                <Button title="Retry" disabled={!online} onPress={() => { void retryUpload(op) }} />
              </View>
            </>
          ) : null}
        </View>
      ))}
      {trial.attachments.length === 0 && waiting.length === 0
        ? <Small>No files yet. Add cube test reports, photos or videos from the site.</Small>
        : trial.attachments.map((a) => {
          const e = extOf(a.original_name).toUpperCase()
          return (
            <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 44, height: 44, borderRadius: radius.field, alignItems: 'center', justifyContent: 'center', backgroundColor: e === 'PDF' ? '#FCE4E4' : color.status.assigned_to_ct.bg }}>
                <Text style={{ fontFamily: font.bold, fontSize: 12, color: e === 'PDF' ? '#8E0E14' : color.status.assigned_to_ct.fg }}>{e.slice(0, 4)}</Text>
              </View>
              <Pressable accessibilityRole="link" accessibilityLabel={`Open ${a.original_name}`} onPress={() => open(a.id, a.original_name, a.content_type)}
                disabled={opening === a.id} style={{ flex: 1, minWidth: 0, minHeight: TOUCH, justifyContent: 'center' }}>
                <Text numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: 15, color: color.link }}>{a.original_name}</Text>
                <Small>{opening === a.id ? 'Opening…' : `${a.reading ? `${readingLabel(a.reading)} reading, ` : ''}${fileSize(a.size)}, added ${shortDate(a.created_at)} by ${a.uploaded_by}${a.processing === 'pending' ? '. Being made smaller' : ''}`}</Small>
              </Pressable>
              {canDelete && (
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${a.original_name}`} onPress={() => confirmRemove(a.id, a.original_name)}
                  disabled={remove.isPending && remove.variables === a.id}
                  style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center', opacity: remove.isPending && remove.variables === a.id ? 0.4 : 1 }}>
                  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color.error} strokeWidth={2} strokeLinecap="round">
                    <Path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
                  </Svg>
                </Pressable>
              )}
            </View>
          )
        })}
      {canAttach && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <IconButton label="Take photo" icon="camera" onPress={takePhoto} disabled={keeping} />
          <IconButton label="Choose file" icon="file" onPress={chooseFile} disabled={keeping} />
        </View>
      )}
      {canAttach ? <Small>Cube reports and other files: PDF or XLSX up to 25 MB, photos up to 20 MB, videos up to 100 MB and 1 minute, 30 files per trial. Photos and videos of a slump test go on its reading time in the fresh concrete step. The server stores photos and videos smaller. Files added offline upload when you are back online.</Small> : null}
    </Section>
  )
}

function IconButton({ label, icon, onPress, disabled }: { label: string; icon: 'camera' | 'file'; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minHeight: 48, borderRadius: radius.field, borderWidth: 1, borderColor: color.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: pressed ? color.head : color.surface, opacity: disabled ? 0.5 : 1 })}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {icon === 'camera'
          ? <><Path d="M4 8h3l2-3h6l2 3h3v11H4z" /><Circle cx={12} cy={13} r={3.5} /></>
          : <><Path d="M14 3H6v18h12V7z" /><Polyline points="14 3 14 7 18 7" /><Rect x={9} y={12} width={6} height={0.5} /></>}
      </Svg>
      <Text style={{ fontFamily: font.semibold, fontSize: 15, color: color.ink }}>{label}</Text>
    </Pressable>
  )
}
