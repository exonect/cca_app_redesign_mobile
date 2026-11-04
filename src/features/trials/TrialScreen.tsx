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
import { labelsFrom, useTrialOps } from '@/offline/outbox'
import { trialView } from '@/offline/overlay'
import { startTrial as startOrQueue } from '@/offline/trialActions'
import { NotOnPhone, TrialSyncNote } from '@/offline/ui'
import { FlagBanner } from '@/features/flags/FlagBanner'
import type { Project, Trial } from '@/shared/types'
import type { TrialWithFlags } from '@/shared/typesExt'
import { Banner, Button, ErrorState, Header, Loading, Screen, TrialStatusChip } from '@/ui/kit'
import { color, font, TOUCH } from '@/ui/theme'

import { ConclusionStep } from './ConclusionStep'
import { CubesStep } from './CubesStep'
import { downloadAndShare } from './download'
import { parseStep, STEPS, stepDone, type StepNo } from './forms'
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
  return <Workspace trial={view} project={project.data} projectError={project.isError} step={parseStep(params.step)} />
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

function Workspace({ trial, project, projectError, step }: { trial: Trial; project: Project | undefined; projectError: boolean; step: StepNo }) {
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
      if (queued) notify({ tone: 'info', text: queuedNote('Trial started') + ' It gets its number then.' })
      else {
        accept(t)
        notify({ tone: 'ok', text: `Trial started. Its number is ${t.code}.` })
      }
    } catch (e) {
      const f = fieldErrors(e)
      if (f.cast_at) {
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
  }, [registry, saveAll, qc, accept, notify, step, switchTo, reload])

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

  const done = stepDone(trial, project)
  const header = (
    <TrialHeader trial={trial} project={project} step={step} done={done} onStep={(n) => goTo(n)} onPdf={pdf} pdfBusy={pdfBusy} />
  )

  const value: WorkspaceValue = useMemo(() => ({
    trial, project, step, header, accept, report: registry.report, remove: registry.remove, dirty: registry.dirty,
    isDirty: registry.isDirty, saving, saveAll, goTo, next, startTrial, starting, castError, setCastError,
    notice, notify,
  }), [trial, project, step, header, accept, registry, saving, saveAll, goTo, next, startTrial, starting, castError, notice, notify])

  const readOnly = !trial.actions.edit
  const banners = (
    <>
      <TrialSyncNote trialId={trial.id} />
      <FlagBanner flags={(trial as TrialWithFlags).flags} refresh={[['trial', trial.id], ['trials']]} what="trial" />
      {trial.status === 'closed' && (
        <Banner tone="info">This trial is closed and read only.{trial.actions.edit_cubes ? ' You can still add cube results in Cube strength.' : ''}</Banner>
      )}
      {trial.status === 'draft' && trial.actions.start && (
        <Banner tone="info">This trial is a draft. Enter the trial date and time in Mix design, then start the trial to give it a number.</Banner>
      )}
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

function TrialHeader({ trial, project, step, done, onStep, onPdf, pdfBusy }: {
  trial: Trial; project: Project | undefined; step: StepNo; done: boolean[]; onStep: (n: StepNo) => void; onPdf: () => void; pdfBusy: boolean
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
        <Pressable accessibilityRole="button" accessibilityLabel="Download PDF" accessibilityState={{ busy: pdfBusy, disabled: pdfBusy }}
          disabled={pdfBusy} onPress={onPdf} style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center', opacity: pdfBusy ? 0.5 : 1 }}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 4v11" /><Polyline points="7 10 12 15 17 10" /><Path d="M5 19h14" />
          </Svg>
        </Pressable>
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
