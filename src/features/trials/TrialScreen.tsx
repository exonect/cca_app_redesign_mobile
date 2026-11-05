/**
 * The trial screen (/trial/[id]?step=1..5): compact header with the trial
 * number, "Step n of 5", status chip and a tappable five part progress bar
 * that switches steps; each step renders its own body and sticky actions.
 * Unsaved work is guarded on step switches and on leaving the screen.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Path, Polyline } from 'react-native-svg'

import { api, ApiError, fieldErrors } from '@/api/client'
import { errorMessage } from '@/api/errors'
import { isOnline } from '@/offline/connectivity'
import { labelsFrom, outbox, useTrialOps } from '@/offline/outbox'
import { trialView } from '@/offline/overlay'
import { currentView, startTrial as startOrQueue } from '@/offline/trialActions'
import { NotOnPhone, TrialSyncNote } from '@/offline/ui'
import { FlagBanner } from '@/features/flags/FlagBanner'
import type { FieldNote, Project, Trial } from '@/shared/types'
import type { TrialWithFlags } from '@/shared/typesExt'
import { Banner, Button, ErrorState, Header, Loading, Screen, Small, TrialStatusChip } from '@/ui/kit'
import { color, font, TOUCH } from '@/ui/theme'

import { ConclusionStep } from './ConclusionStep'
import { CubesStep } from './CubesStep'
import { downloadAndShare } from './download'
import { downloadTrialExcel } from './excel'
import { localCompleteness, parseStep, STEPS, stepDone, stepOfField, type StepNo } from './forms'
import { FreshStep } from './FreshStep'
import { MixStep } from './MixStep'
import { SieveStep } from './SieveStep'
import { queuedNote, useAccept, useReloadTrial, useSaverRegistry, WorkspaceContext, type Notice, type WorkspaceValue } from './workspace'

const SHORT = ['Sieve', 'Mix', 'Fresh', 'Cubes', 'Close']

function leaveTo(projectId?: string) {
  if (router.canGoBack()) router.back()
  else if (projectId) router.replace({ pathname: '/project/[id]', params: { id: projectId } })
  else router.replace('/')
}

export function TrialScreen() {
  const params = useLocalSearchParams<{ id: string; step?: string }>()
  const id = String(params.id ?? '')
  const qc = useQueryClient()
  // Changes on this phone that have not synced; a trial made offline exists only here until it syncs.
  const ops = useTrialOps(id)
  const madeHere = ops.some((o) => o.kind === 'create_trial')
  const q = useQuery({ queryKey: ['trial', id], queryFn: () => api<Trial>(`/trials/${id}/`), enabled: !!id && !madeHere })
  const view = useMemo(() => trialView(q.data, ops, labelsFrom(qc)), [q.data, ops, qc])
  const projectId = view?.project
  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<Project>(`/projects/${projectId}/`),
    enabled: !!projectId,
  })
  const paused = (x: { isPending: boolean; fetchStatus: string }) => x.isPending && x.fetchStatus === 'paused'

  if (!view && paused(q)) {
    return <Screen header={<Header title="Trial" back={{ label: 'back', onPress: () => leaveTo() }} />}><NotOnPhone what="trial" /></Screen>
  }
  if (!view || (projectId && project.isPending && !paused(project))) {
    if (q.isError) return <TrialError error={q.error} onRetry={() => q.refetch()} />
    return <Screen header={<Header title="Trial" back={{ label: 'back', onPress: () => leaveTo() }} />}><Loading label="Loading trial" /></Screen>
  }
  if (q.isError && !madeHere) return <TrialError error={q.error} onRetry={() => q.refetch()} />
  return <Workspace trial={view} project={project.data} projectError={project.isError} step={parseStep(params.step)} synced={ops.length === 0} />
}

function TrialError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const missing = error instanceof ApiError && error.status === 404
  return (
    <Screen header={<Header title="Trial" back={{ label: 'back', onPress: () => leaveTo() }} />}>
      {missing
        ? <Banner tone="error">This trial was not found. It may have been deleted, or it belongs to a project you cannot see.</Banner>
        : <ErrorState error={error} onRetry={onRetry} />}
    </Screen>
  )
}

/** What the trial still needs before Start: the server's list, or worked out on
 * the phone while changes are waiting to sync. */
export function stillNeeded(trial: Trial, synced: boolean): FieldNote[] {
  if (trial.status !== 'draft') return []
  return synced && trial.completeness ? trial.completeness : localCompleteness(trial)
}

function Workspace({ trial, project, projectError, step, synced }: {
  trial: Trial; project: Project | undefined; projectError: boolean; step: StepNo; synced: boolean
}) {
  const qc = useQueryClient()
  const registry = useSaverRegistry()
  const acceptTrial = useAccept(trial.id)
  const reload = useReloadTrial(trial.id)
  const [castError, setCastError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [saving, setSaving] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const notify = useCallback((n: Notice) => {
    if (timer.current) clearTimeout(timer.current)
    setNotice(n)
    // Confirmations fade after a few seconds; errors stay until the next action.
    if (n && n.tone !== 'error') timer.current = setTimeout(() => setNotice(null), 4000)
  }, [])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const accept = useCallback((t: Trial) => acceptTrial(t), [acceptTrial])

  const saveAll = useCallback(async () => {
    setSaving(true)
    try { return await registry.saveAll() } finally { setSaving(false) }
  }, [registry])

  const switchTo = useCallback((n: StepNo) => {
    setNotice(null)
    router.setParams({ step: String(n) })
  }, [])

  const goTo = useCallback((n: StepNo, force = false) => {
    if (n === step) return
    if (force || !registry.isDirty()) { switchTo(n); return }
    Alert.alert('Save your changes?', `${STEPS[step - 1].label} has changes that are not saved yet.`, [
      { text: 'Stay here', style: 'cancel' },
      { text: 'Leave without saving', style: 'destructive', onPress: () => switchTo(n) },
      { text: 'Save and continue', onPress: async () => { if (await saveAll()) switchTo(n) } },
    ])
  }, [step, registry, switchTo, saveAll])

  const next = useCallback(async () => {
    if (registry.isDirty() && !(await saveAll())) return
    if (step < 5) switchTo((step + 1) as StepNo)
  }, [registry, saveAll, step, switchTo])

  const [starting, setStarting] = useState(false)
  const [missing, setMissing] = useState<FieldNote[] | null>(null)
  // What this phone itself counted as still needed when Start was refused: those items leave the
  // list once a save fills them in; anything else the server listed stays until Start is tried again.
  const needed = stillNeeded(trial, synced)
  const [knownAtRefusal, setKnownAtRefusal] = useState<ReadonlySet<string>>(() => new Set())
  const startingNow = useRef(false)
  const trialRef = useRef(trial)
  trialRef.current = trial
  const startTrial = useCallback(async () => {
    // One start at a time: saving first takes a moment, and a second tap must not start twice.
    if (startingNow.current) return
    startingNow.current = true
    setStarting(true)
    setCastError(null)
    try {
      if (registry.isDirty() && !(await saveAll())) return
      // Offline the start is kept on the phone; the trial gets its number when it syncs.
      const { trial: t, queued } = await startOrQueue(qc, trialRef.current)
      setMissing(null)
      if (queued) notify({ tone: 'info', text: queuedNote('Trial started') + ' It gets its number then.' })
      else {
        accept(t)
        notify({ tone: 'ok', text: `Trial started. Its number is ${t.code}.` })
      }
    } catch (e) {
      const f = fieldErrors(e)
      if (Object.keys(f).length > 1 || (Object.keys(f).length === 1 && !f.cast_at)) {
        // Legacy Create Trial rules: list everything still missing, each linked to its step.
        if (f.cast_at) setCastError(f.cast_at)
        const now = currentView(qc, trialRef.current.id) ?? trialRef.current
        setKnownAtRefusal(new Set(stillNeeded(now, synced).map((n) => n.field)))
        setMissing(Object.entries(f).map(([field, message]) => ({ field, message })))
        notify({ tone: 'error', text: 'The trial cannot start yet. What is missing is listed at the top.' })
      } else if (f.cast_at) {
        setCastError(f.cast_at)
        if (step !== 2) switchTo(2)
        notify({ tone: 'error', text: f.cast_at })
      } else {
        notify({ tone: 'error', text: errorMessage(e, 'The trial was not started. Try again.') })
        reload(e)
      }
    } finally {
      startingNow.current = false
      setStarting(false)
    }
  }, [registry, saveAll, qc, accept, notify, step, switchTo, reload, synced])

  // Legacy: an Admin deletes a trial of any status, after confirming. Online only.
  const [deleting, setDeleting] = useState(false)
  function confirmDelete() {
    if (!isOnline()) { notify({ tone: 'error', text: 'Deleting a trial needs a connection. Try again when you are back online.' }); return }
    if (outbox.hasWaiting(trial.id)) { notify({ tone: 'error', text: 'This trial has changes that have not synced yet. Delete it once they have synced.' }); return }
    Alert.alert(`Delete trial ${trial.code ?? '(draft)'}?`,
      `Are you sure you want to delete this trial of ${trial.project_name}? Its cube results and files are removed too. This cannot be undone.`, [
        { text: 'Keep the trial', style: 'cancel' },
        { text: 'Delete trial', style: 'destructive', onPress: () => { void deleteTrial() } },
      ])
  }
  async function deleteTrial() {
    setDeleting(true)
    try {
      await api(`/trials/${trial.id}/`, { method: 'DELETE' })
      for (const k of ['sieve', 'mix', 'fresh', 'cubes', 'conclusion']) registry.remove(k)
      qc.removeQueries({ queryKey: ['trial', trial.id] })
      void qc.invalidateQueries({ queryKey: ['trials'] })
      void qc.invalidateQueries({ queryKey: ['project', trial.project] })
      leaveTo(trial.project)
    } catch (e) {
      notify({ tone: 'error', text: errorMessage(e, 'The trial was not deleted. Try again.') })
      reload(e)
    } finally {
      setDeleting(false)
    }
  }

  // Leaving the screen (back button, gesture, tab) with unsaved work asks first.
  usePreventRemove(registry.dirty, ({ repeat }) => {
    Alert.alert('Leave without saving?', 'This trial has changes that are not saved yet. Stay to save them, or leave and lose them.', [
      { text: 'Stay on this trial', style: 'cancel' },
      { text: 'Leave without saving', style: 'destructive', onPress: repeat },
      { text: 'Save and leave', onPress: async () => { if (await saveAll()) repeat() } },
    ])
  })

  async function pdf() {
    setPdfBusy(true)
    try { await downloadAndShare(`/trials/${trial.id}/report.pdf`, `${trial.code ?? 'draft_trial'}.pdf`, 'application/pdf') }
    catch (e) { notify({ tone: 'error', text: errorMessage(e, 'The PDF could not be made. Try again.') }) }
    finally { setPdfBusy(false) }
  }

  // Legacy trial row menu: "Download in PDF" and "Download in Excel" (Excel for started and closed trials).
  async function excel() {
    setPdfBusy(true)
    try { await downloadTrialExcel({ trial: trial.id }) }
    catch (e) { notify({ tone: 'error', text: errorMessage(e, 'The Excel file could not be downloaded. Try again.') }) }
    finally { setPdfBusy(false) }
  }
  function chooseDownload() {
    if (trial.status === 'draft') { void pdf(); return }
    Alert.alert('Download this trial', undefined, [
      { text: 'PDF report', onPress: () => { void pdf() } },
      { text: 'Excel', onPress: () => { void excel() } },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const done = stepDone(trial, project)
  const header = (
    <TrialHeader trial={trial} project={project} step={step} done={done} onStep={(n) => goTo(n)} onPdf={chooseDownload} pdfBusy={pdfBusy}
      onDelete={trial.actions.delete ? confirmDelete : undefined} deleting={deleting} />
  )

  // A refused Start's list keeps only what is still missing: each item goes once a save fills it in.
  const neededKey = needed.map((n) => n.field).join('|')
  const open = useMemo(() => {
    const now = new Set(neededKey.split('|'))
    const left = missing?.filter((m) => !knownAtRefusal.has(m.field) || now.has(m.field)) ?? []
    return left.length ? left : null
  }, [missing, neededKey, knownAtRefusal])

  const value: WorkspaceValue = useMemo(() => ({
    trial, project, step, header, accept, report: registry.report, remove: registry.remove, dirty: registry.dirty,
    isDirty: registry.isDirty, saving, saveAll, goTo, next, startTrial, starting, missing: open, setMissing, castError, setCastError,
    notice, notify,
  }), [trial, project, step, header, accept, registry, saving, saveAll, goTo, next, startTrial, starting, open, castError, notice, notify])

  const readOnly = !trial.actions.edit
  const banners = (
    <>
      <TrialSyncNote trialId={trial.id} />
      <FlagBanner flags={(trial as TrialWithFlags).flags} refresh={[['trial', trial.id], ['trials']]} what="trial" />
      {trial.status === 'closed' && (
        <Banner tone="info">This trial is closed and read only.{trial.actions.edit_cubes ? ' You can still add cube results in Cube strength.' : ''}</Banner>
      )}
      {trial.status === 'in_progress' && (
        <Banner tone="info">
          This trial is in progress, so its steps are read only, as in the old app.{trial.actions.close ? ' Add cube results and files, then close it with a conclusion in step 5.' : ''}
        </Banner>
      )}
      {trial.status === 'draft' && trial.actions.start && !open && (
        <Banner tone="info">
          This trial is a draft. Complete it, then start the trial to give it a number.
          {needed.length ? ` Still needed before it can start: ${needed.length} ${needed.length === 1 ? 'item' : 'items'}, listed when you tap Start trial.` : ''}
        </Banner>
      )}
      {open && trial.status === 'draft' ? <MissingList missing={open} onGo={(n) => goTo(n)} onClose={() => setMissing(null)} /> : null}
      {projectError && <Banner tone="warn">The customer requirement could not be loaded. Results are still checked on the server.</Banner>}
    </>
  )

  return (
    <WorkspaceContext.Provider value={value}>
      {/* A corrected flag changes the saved value: the step's form starts again from it. */}
      <View key={`${step}-${trial.status}-${(trial as TrialWithFlags).flags?.length ?? 0}`} style={{ flex: 1 }}>
        {step === 1 && <SieveStep readOnly={readOnly} banners={banners} />}
        {step === 2 && <MixStep readOnly={readOnly} banners={banners} />}
        {step === 3 && <FreshStep readOnly={readOnly} banners={banners} />}
        {step === 4 && <CubesStep canEdit={trial.actions.edit_cubes} banners={banners} />}
        {step === 5 && <ConclusionStep readOnly={readOnly} banners={banners} />}
      </View>
    </WorkspaceContext.Provider>
  )
}

/** A refused Start: everything still missing, each linked to its step (legacy Create Trial rules). */
function MissingList({ missing, onGo, onClose }: { missing: FieldNote[]; onGo: (n: StepNo) => void; onClose: () => void }) {
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ backgroundColor: '#FBECEB', borderRadius: 10, padding: 12, gap: 6 }}>
      <Text accessibilityRole="header" style={{ fontFamily: font.semibold, fontSize: 15, color: '#7A1A14' }}>The trial cannot start yet</Text>
      <Small style={{ color: '#7A1A14' }}>As in the old app, a trial goes In progress only when these are entered:</Small>
      {missing.map((m) => {
        const n = stepOfField(m.field)
        return (
          <Pressable key={m.field} accessibilityRole="link" accessibilityLabel={`${STEPS[n - 1].label}: ${m.message}`} onPress={() => onGo(n)}
            style={{ minHeight: TOUCH, justifyContent: 'center' }}>
            <Text style={{ fontFamily: font.regular, fontSize: 14, color: color.ink }}>
              <Text style={{ fontFamily: font.semibold, color: color.link, textDecorationLine: 'underline' }}>{STEPS[n - 1].label}</Text>: {m.message}
            </Text>
          </Pressable>
        )
      })}
      <Button title="Hide this list" variant="tertiary" onPress={onClose} style={{ alignSelf: 'flex-start', flexGrow: 0 }} />
    </View>
  )
}

function TrialHeader({ trial, project, step, done, onStep, onPdf, pdfBusy, onDelete, deleting }: {
  trial: Trial; project: Project | undefined; step: StepNo; done: boolean[]; onStep: (n: StepNo) => void; onPdf: () => void; pdfBusy: boolean
  onDelete?: () => void; deleting?: boolean
}) {
  const projectName = project?.project_name ?? trial.project_name
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: color.surface, borderBottomWidth: 1, borderColor: color.line, paddingLeft: 8, paddingRight: 12, paddingBottom: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Back to ${projectName}`} hitSlop={4}
          onPress={() => leaveTo(trial.project)} style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color.link} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <Polyline points="15 5 8 12 15 19" />
          </Svg>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text accessibilityRole="header" numberOfLines={1} style={{ fontFamily: font.condBold, fontSize: 19, lineHeight: 22, color: color.ink }}>
            {trial.code ?? (trial.status === 'draft' ? 'Draft trial' : 'Trial, numbered on sync')}
          </Text>
          <Text numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 13, color: color.muted }}>
            Step {step} of 5, {STEPS[step - 1].label.toLowerCase()}
          </Text>
        </View>
        <TrialStatusChip status={trial.status} />
        <Pressable accessibilityRole="button" accessibilityLabel={trial.status === 'draft' ? 'Download PDF' : 'Download PDF or Excel'} accessibilityState={{ busy: pdfBusy, disabled: pdfBusy }}
          disabled={pdfBusy} onPress={onPdf} style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center', opacity: pdfBusy ? 0.5 : 1 }}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 4v11" /><Polyline points="7 10 12 15 17 10" /><Path d="M5 19h14" />
          </Svg>
        </Pressable>
        {onDelete ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Delete trial" accessibilityState={{ busy: deleting, disabled: deleting }}
            disabled={deleting} onPress={onDelete} style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center', opacity: deleting ? 0.5 : 1 }}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color.error} strokeWidth={2} strokeLinecap="round">
              <Path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
            </Svg>
          </Pressable>
        ) : null}
      </View>
      <View accessibilityRole="tablist" accessibilityLabel="Trial steps" style={{ flexDirection: 'row', gap: 3, paddingLeft: 8 }}>
        {STEPS.map((s, i) => {
          const now = s.n === step
          return (
            <Pressable key={s.n} accessibilityRole="tab" accessibilityState={{ selected: now }}
              accessibilityLabel={`Step ${s.n}, ${s.label}${done[i] ? ', complete' : ''}`}
              onPress={() => onStep(s.n as StepNo)} style={{ flex: 1, minHeight: TOUCH, paddingTop: 6, gap: 4 }}>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: now ? color.logo : done[i] ? color.met.solid : color.line }} />
              <Text numberOfLines={1} style={{ fontFamily: now ? font.semibold : font.regular, fontSize: 12, color: now ? color.ink : color.muted, textAlign: 'center' }}>
                {done[i] && !now ? '✓ ' : ''}{SHORT[i]}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </SafeAreaView>
  )
}
