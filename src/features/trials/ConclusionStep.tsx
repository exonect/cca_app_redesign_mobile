/** Step 5, conclusion: requirement checks, Met / Below radio cards, remarks,
 * signatories with a signature pad each, attachments (take photo, choose
 * file, remove), then Close trial with the confirm_close dialog. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { useState, type ReactNode } from 'react'
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native'
import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg'

import { api, ApiError, fieldErrors } from '@/api/client'
import type { Outcome, Trial } from '@/shared/types'
import { Banner, Button, Field, OutcomeChip, Screen, Small, TextField } from '@/ui/kit'
import { color, font, radius, TOUCH } from '@/ui/theme'

import { attachmentForm, attachmentProblem, extOf, MIME, photoName, type PickedFile } from './attachments'
import { downloadAndShare } from './download'
import { date, fileSize, shortDate } from './format'
import { conclusionForm, conclusionPayload, SIGNATORIES, splitWarnings, type ConclusionForm } from './forms'
import { RadioCard, Section, StepFooter } from './parts'
import { SignaturePad } from './SignaturePad'
import { useStepForm, useWorkspace } from './workspace'

const REMARKS_MAX = 1000

export function ConclusionStep({ readOnly, banners }: { readOnly: boolean; banners: ReactNode }) {
  const { trial, project, header, accept, saveAll, notify, dirty, saving, startTrial, starting } = useWorkspace()
  const { form, setForm, errors } = useStepForm<ConclusionForm>('conclusion', (t) => conclusionForm(t, project), conclusionPayload)
  const [outcome, setOutcome] = useState<Outcome>(trial.outcome)
  const [outcomeError, setOutcomeError] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const closing = trial.actions.close

  const check = useQuery({
    queryKey: ['trial', trial.id, 'close-check'],
    queryFn: () => api<{ warnings: string[]; checks: Trial['results']['checks'] }>(`/trials/${trial.id}/close-check/`),
    enabled: trial.status === 'in_progress',
  })
  const checks = check.data?.checks ?? trial.results?.checks ?? []
  const met = checks.filter((c) => c.status === 'met').length
  const pending = checks.filter((c) => c.status === 'pending').length
  const notMet = checks.filter((c) => c.status === 'not_met').length

  const close = useMutation({
    mutationFn: (confirmed: boolean) => api<Trial>(`/trials/${trial.id}/close/`, {
      body: { outcome, remarks: form.remarks, ...(confirmed ? { confirm: true } : {}) },
    }),
  })

  async function closeTrial(confirmed = false) {
    setOutcomeError(null)
    if (!outcome) {
      const msg = 'Choose a conclusion before closing the trial.'
      setOutcomeError(msg)
      notify({ tone: 'error', text: msg })
      return
    }
    if (!confirmed && !(await saveAll())) return
    try {
      const t = await close.mutateAsync(confirmed)
      accept(t)
      notify({ tone: 'ok', text: `Trial closed. ${t.code ?? ''}, ${t.outcome_label.toLowerCase()}.`.replace(' ,', ',') })
    } catch (e) {
      if (e instanceof ApiError && e.code === 'confirm_close') {
        const warnings = check.data?.warnings?.length ? check.data.warnings : splitWarnings(e.message)
        Alert.alert('Close the trial anyway?',
          `The conclusion will rest on the results entered so far:\n\n${warnings.map((w) => `• ${w}`).join('\n')}\n\nAn Admin or Sales Admin can still add cube results after closing.`,
          [{ text: 'Keep it open', style: 'cancel' }, { text: 'Close trial', style: 'destructive', onPress: () => { closeTrial(true) } }])
        return
      }
      const f = fieldErrors(e)
      if (f.outcome) setOutcomeError(f.outcome)
      notify({ tone: 'error', text: f.outcome ?? (e instanceof Error ? e.message : 'The trial was not closed. Try again.') })
    }
  }

  const salesPerson = project?.sales_person?.name
  const footer = trial.actions.start ? (
    <StepFooter><Button variant="primary" title="Start trial" onPress={startTrial} busy={starting} style={{ flex: 1 }} /></StepFooter>
  ) : closing ? (
    <StepFooter note="Locks the trial and moves the project to Trials closed if this is the last open trial.">
      <Button title="Save" onPress={async () => { if (await saveAll()) notify({ tone: 'ok', text: 'Conclusion saved' }) }} disabled={!dirty} busy={saving && !close.isPending} style={{ flex: 1 }} />
      <Button variant="primary" title="Close trial" onPress={() => closeTrial(false)} busy={close.isPending} style={{ flex: 1.4 }} />
    </StepFooter>
  ) : !readOnly ? (
    <StepFooter><Button title="Save" onPress={async () => { if (await saveAll()) notify({ tone: 'ok', text: 'Conclusion saved' }) }} disabled={!dirty} busy={saving} style={{ flex: 1 }} /></StepFooter>
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

      {trial.status === 'closed' ? (
        <Section title="Trial conclusion">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <OutcomeChip outcome={trial.outcome} />
            <Small>Closed {date(trial.closed_at)}</Small>
          </View>
        </Section>
      ) : (
        <View accessibilityRole="radiogroup" accessibilityLabel="Trial conclusion, required" style={{ gap: 8 }}>
          <Text style={{ fontFamily: font.semibold, fontSize: 15, color: color.ink }}>Trial conclusion</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <RadioCard title="Met expectation" body="Can be offered to the customer." selected={outcome === 'met'} disabled={!closing}
              invalid={!!outcomeError} onPress={() => { setOutcome('met'); setOutcomeError(null) }} />
            <RadioCard title="Below expectation" body="Say what was missed in the remarks." selected={outcome === 'below'} disabled={!closing}
              invalid={!!outcomeError} onPress={() => { setOutcome('below'); setOutcomeError(null) }} />
          </View>
          {outcomeError ? <Text accessibilityLiveRegion="polite" style={{ fontFamily: font.regular, fontSize: 13, color: color.error }}>{outcomeError}</Text> : null}
          {!closing && trial.status === 'draft' ? <Small>Start the trial before concluding it.</Small> : null}
        </View>
      )}

      <Field label="Remarks" error={errors.remarks} hint={`${form.remarks.length} of ${REMARKS_MAX} characters`}>
        <TextField accessibilityLabel="Remarks" multiline numberOfLines={3} maxLength={REMARKS_MAX} value={form.remarks} editable={!readOnly}
          invalid={!!errors.remarks} onChangeText={(v) => setForm((f) => ({ ...f, remarks: v }))}
          style={{ minHeight: 72, textAlignVertical: 'top', fontFamily: font.regular }} />
      </Field>

      <Section title="Signatures">
        {SIGNATORIES.map((s) => (
          <View key={s.name} style={{ gap: 8, paddingBottom: 6 }}>
            <Field label={s.label} error={errors[s.name]} hint={s.name === 'signatory_sales' && salesPerson ? 'From the project; change it if someone else signs.' : undefined}>
              <TextField accessibilityLabel={`${s.label}, name`} placeholder="Name" value={form[s.name]} editable={!readOnly} invalid={!!errors[s.name]}
                onChangeText={(v) => setForm((f) => ({ ...f, [s.name]: v }))} />
            </Field>
            <SignaturePad label={form[s.name] || s.label} value={form[s.sign]} disabled={readOnly} onDrawing={setDrawing}
              onChange={(v) => setForm((f) => ({ ...f, [s.sign]: v }))} />
            {errors[s.sign] ? <Text style={{ fontFamily: font.regular, fontSize: 13, color: color.error }}>{errors[s.sign]}</Text> : null}
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
  const [problems, setProblems] = useState<string[]>([])
  const [uploading, setUploading] = useState(0)
  const [opening, setOpening] = useState<number | null>(null)
  const canAttach = trial.actions.attach
  const canDelete = trial.actions.edit
  const refresh = () => qc.invalidateQueries({ queryKey: ['trial', trial.id] })

  async function upload(files: PickedFile[]) {
    if (!files.length) return
    const bad = files.map(attachmentProblem).filter((x): x is string => !!x)
    setProblems(bad)
    const good = files.filter((f) => !attachmentProblem(f))
    setUploading(good.length)
    let ok = 0
    for (const f of good) {
      try {
        await api(`/trials/${trial.id}/attachments/`, { form: attachmentForm(f) })
        ok += 1
      } catch (e) {
        const msg = fieldErrors(e).file ?? (e instanceof Error ? e.message : 'Upload failed.')
        setProblems((p) => [...p, `${f.name}: ${msg}`])
      }
      setUploading((x) => x - 1)
    }
    if (ok) { await refresh(); notify({ tone: 'ok', text: ok === 1 ? 'File added' : 'Files added' }) }
  }

  async function takePhoto() {
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
    const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: Object.values(MIME).filter((v, i, xs) => xs.indexOf(v) === i) })
    if (r.canceled || !r.assets?.length) return
    await upload(r.assets.map((a) => ({ uri: a.uri, name: a.name, type: a.mimeType ?? MIME[extOf(a.name)] ?? 'application/octet-stream', size: a.size })))
  }

  const remove = useMutation({
    mutationFn: (id: number) => api(`/trials/${trial.id}/attachments/${id}/`, { method: 'DELETE' }),
    onSuccess: () => { refresh(); notify({ tone: 'ok', text: 'File removed' }) },
    onError: (e) => notify({ tone: 'error', text: e instanceof Error ? e.message : 'The file was not removed. Try again.' }),
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
    catch (e) { notify({ tone: 'error', text: e instanceof Error ? e.message : 'Download failed.' }) }
    finally { setOpening(null) }
  }

  return (
    <Section title="Attachments">
      <View accessibilityLiveRegion="polite" style={{ gap: 6 }}>
        {uploading > 0 ? <Small>Uploading {uploading} {uploading === 1 ? 'file' : 'files'}…</Small> : null}
        {problems.length > 0 ? <Banner tone="error">{problems.join('\n')}</Banner> : null}
      </View>
      {trial.attachments.length === 0
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
                <Small>{opening === a.id ? 'Opening…' : `${fileSize(a.size)}, added ${shortDate(a.created_at)} by ${a.uploaded_by}`}</Small>
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
          <IconButton label="Take photo" icon="camera" onPress={takePhoto} disabled={uploading > 0} />
          <IconButton label="Choose file" icon="file" onPress={chooseFile} disabled={uploading > 0} />
        </View>
      )}
      {canAttach ? <Small>PDF, JPG, PNG, XLSX or MP4, up to 25 MB each.</Small> : null}
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
