import { useMutation, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState, type ReactNode } from 'react'
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { api } from '@/api/client'
import type { Project, ProjectStatus, Ref, Trial, TrialListItem } from '@/shared/types'
import { Body, Button, Card, EmptyState, ErrorState, H1, H2, Loading, OutcomeChip, PROJECT_STATUS_LABEL, ProjectStatusChip, Small, Strong, TrialStatusChip } from '@/ui/kit'
import { color, font, radius, TOUCH } from '@/ui/theme'

import { invalidateProject, projectKeys, storeProject, useProject, useProjectEvents, useProjectTrials } from './api'
import { AssignCtSheet } from './AssignCtSheet'
import { CompleteSheet } from './CompleteSheet'
import { date, num, shortDate } from './format'
import { useNotice, useRefresh } from './hooks'
import { ConfirmSheet, Notice, NoteSheet, Sheet } from './Sheet'
import { goBack } from './TabHeader'

export const STATUS_ORDER: ProjectStatus[] = ['draft', 'created', 'support_requested', 'assigned_to_ct', 'trial_in_progress', 'trials_closed', 'completed']

type SheetName = 'support' | 'assign' | 'complete' | 'reopen' | 'delete' | 'more' | null

export function ProjectScreen({ id }: { id: string }) {
  const q = useProject(id)
  if (q.data) return <ProjectDetail project={q.data} />
  return (
    <View style={{ flex: 1, backgroundColor: color.concrete }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: color.surface, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: color.line }}>
        <BackLink />
      </SafeAreaView>
      <View style={{ padding: 16 }}>
        {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <Loading label="Loading the project" />}
      </View>
    </View>
  )
}

function BackLink() {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => goBack('/projects')} hitSlop={8}
      style={{ minHeight: TOUCH, justifyContent: 'center', alignSelf: 'flex-start' }}>
      <Text style={{ fontFamily: font.semibold, fontSize: 15, color: color.link }}>‹ Back</Text>
    </Pressable>
  )
}

/** The latest event that moved the project into each stage. */
function useStageSince(p: Project) {
  const events = useProjectEvents(p.id)
  const e = events.data?.find((x) => x.to_status === p.status && x.from_status !== p.status)
  return { since: e?.created_at ?? null, by: e?.actor?.name ?? null, refetch: events.refetch }
}

export function ProjectDetail({ project: p }: { project: Project }) {
  const qc = useQueryClient()
  const insets = useSafeAreaInsets()
  const [sheet, setSheet] = useState<SheetName>(null)
  const [notice, setNotice, clearNotice] = useNotice()
  const [startError, setStartError] = useState<unknown>(null)
  const trials = useProjectTrials(p.id)
  const stage = useStageSince(p)
  const a = p.actions
  const close = () => setSheet(null)

  const { refreshing, onRefresh } = useRefresh(async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: projectKeys.detail(p.id) }), trials.refetch(), stage.refetch()])
  })

  const requestSupport = useMutation({
    mutationFn: (note: string) => api<Project>(`/projects/${p.id}/request-support/`, { body: { note } }),
    onSuccess: (r) => { storeProject(qc, r); setNotice('Support requested'); close() },
  })
  const reopen = useMutation({
    mutationFn: (note: string) => api<Project>(`/projects/${p.id}/reopen/`, { body: { note } }),
    onSuccess: (r) => { storeProject(qc, r); setNotice('Project reopened'); close() },
  })
  const remove = useMutation({
    mutationFn: () => api(`/projects/${p.id}/`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.removeQueries({ queryKey: projectKeys.detail(p.id) })
      invalidateProject(qc)
      router.replace('/projects')
    },
  })
  const startTrial = useMutation({
    mutationFn: () => api<Trial>('/trials/', { body: { project: p.id } }),
    onMutate: () => setStartError(null),
    onSuccess: (t) => { invalidateProject(qc, p.id); router.push(`/trial/${t.id}`) },
    onError: setStartError,
  })

  // One primary (red) action: the most useful next step the user may take.
  const primary = a.start_trial ? 'start_trial' : a.complete ? 'complete' : a.assign_ct && !p.ct ? 'assign_ct' : a.submit ? 'edit' : null
  const editLabel = p.status === 'draft' ? 'Finish draft' : 'Edit'
  const goEdit = () => router.push({ pathname: '/project/new', params: { id: p.id } })

  type Act = { key: string; title: string; onPress: () => void; busy?: boolean; danger?: boolean }
  const acts: Act[] = []
  if (a.start_trial) acts.push({ key: 'start_trial', title: `Start trial${trials.data ? ` ${trials.data.count + 1}` : ''}`, onPress: () => startTrial.mutate(), busy: startTrial.isPending })
  if (a.complete) acts.push({ key: 'complete', title: 'Mark completed', onPress: () => setSheet('complete') })
  if (a.assign_ct) acts.push({ key: 'assign_ct', title: p.ct ? 'Change CT' : 'Assign CT', onPress: () => setSheet('assign') })
  if (a.edit) acts.push({ key: 'edit', title: editLabel, onPress: goEdit })
  if (a.request_support) acts.push({ key: 'support', title: 'Request support', onPress: () => setSheet('support') })
  if (a.reopen) acts.push({ key: 'reopen', title: 'Reopen', onPress: () => setSheet('reopen') })
  if (a.delete) acts.push({ key: 'delete', title: 'Delete draft', onPress: () => setSheet('delete'), danger: true })
  const main = acts.find((x) => x.key === primary)
  const rest = acts.filter((x) => x !== main)
  // Footer: the primary plus one more inline; the rest under "More actions".
  const inline = rest.slice(0, main ? 1 : 2)
  const overflow = rest.slice(inline.length)

  const current = STATUS_ORDER.indexOf(p.status)
  const place = [p.customer_name, p.city?.value].filter(Boolean).join(', ')
  const statusNote = p.status === 'completed' ? 'Read only. Only an Admin can reopen it.'
    : [stage.since ? `Since ${shortDate(stage.since)}` : null, stage.by ? `by ${stage.by}` : null].filter(Boolean).join(' ')

  return (
    <View style={{ flex: 1, backgroundColor: color.concrete }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: color.surface, borderBottomWidth: 1, borderColor: color.line, paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}>
        <BackLink />
        <View style={{ gap: 4 }}>
          <H1>{p.project_name || 'Untitled project'}</H1>
          <Body style={{ color: color.muted }}>{[place, p.sfdc_no && `SFDC ${p.sfdc_no}`].filter(Boolean).join(', ')}</Body>
        </View>
        <View accessible accessibilityLabel={`Project stage ${current + 1} of ${STATUS_ORDER.length}, ${PROJECT_STATUS_LABEL[p.status]}`} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {STATUS_ORDER.map((s, i) => (
              <View key={s} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= current ? (p.status === 'completed' ? color.met.solid : color.link) : color.line }} />
            ))}
          </View>
          <Text style={{ fontFamily: font.regular, fontSize: 14, color: color.ink }}>
            <Text style={{ fontFamily: font.semibold }}>{PROJECT_STATUS_LABEL[p.status]}.</Text>
            {statusNote ? <Text style={{ color: color.muted }}> {statusNote}</Text> : null}
          </Text>
        </View>
      </SafeAreaView>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Notice text={notice} onDone={clearNotice} />
        {startError ? <ErrorState error={startError} /> : null}
        <RequirementCard p={p} />
        <TrialsSection p={p} q={trials} onStart={a.start_trial ? () => startTrial.mutate() : undefined} starting={startTrial.isPending} />
        <CustomerCard p={p} />
      </ScrollView>

      {main || inline.length ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12), backgroundColor: color.surface, borderTopWidth: 1, borderColor: color.line, gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {inline.map((x) => <Button key={x.key} title={x.title} onPress={x.onPress} busy={x.busy} variant={x.danger ? 'danger' : 'secondary'} />)}
            {main ? <Button title={main.title} variant="primary" onPress={main.onPress} busy={main.busy} style={{ flexGrow: 1.4 }} /> : null}
          </View>
          {overflow.length ? <Button title="More actions" variant="tertiary" onPress={() => setSheet('more')} /> : null}
        </View>
      ) : null}

      <Sheet open={sheet === 'more'} onClose={close} title="More actions">
        {overflow.map((x) => (
          <Button key={x.key} title={x.title} variant={x.danger ? 'danger' : 'secondary'} onPress={() => { close(); setTimeout(x.onPress, 350) }} />
        ))}
      </Sheet>
      <AssignCtSheet project={p} open={sheet === 'assign'} onClose={close} onDone={setNotice} />
      <CompleteSheet project={p} open={sheet === 'complete'} onClose={close} onDone={setNotice} />
      <NoteSheet open={sheet === 'support'} onClose={() => { requestSupport.reset(); close() }} title="Request technical support"
        intro="Admins and Sales Admins are notified and assign a CT to run the trials." noteLabel="Note for the managers"
        confirmLabel="Request support" busy={requestSupport.isPending} error={requestSupport.error} onConfirm={(n) => requestSupport.mutate(n)} />
      <NoteSheet open={sheet === 'reopen'} onClose={() => { reopen.reset(); close() }} title="Reopen this project?"
        intro="The project goes back to Trials closed so it can be edited and more trials can be run." noteLabel="Reason for reopening"
        confirmLabel="Reopen" busy={reopen.isPending} error={reopen.error} onConfirm={(n) => reopen.mutate(n)} />
      <ConfirmSheet open={sheet === 'delete'} onClose={() => { remove.reset(); close() }} title="Delete this draft project?"
        body={`The draft ${p.project_name || 'Untitled project'}${p.customer_name ? ` for ${p.customer_name}` : ''} and everything entered on it will be removed. This cannot be undone.`}
        cancelLabel="Keep draft" confirmLabel="Delete draft" danger busy={remove.isPending} error={remove.error} onConfirm={() => remove.mutate()} />
    </View>
  )
}

// --- Sections --------------------------------------------------------------------

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 }}>
      {rows.map(([k, v]) => (
        <View key={k} style={{ width: '50%', paddingRight: 12, gap: 1 }} accessible accessibilityLabel={`${k}: ${v || 'not set'}`}>
          <Small>{k}</Small>
          {v ? <Strong>{v}</Strong> : <Body style={{ color: color.muted }}>Not set</Body>}
        </View>
      ))}
    </View>
  )
}

const list = (refs: Ref[], suffix = '') => refs.map((r) => `${r.value}${suffix}`).join(', ')

function RequirementCard({ p }: { p: Project }) {
  const kind = p.requirement_type === 'flow' ? 'Flow' : 'Slump'
  const workability = p.slump_flow ? `${p.requirement_type === 'flow' ? 'Flow ' : ''}${p.slump_flow.value} mm${p.retention_time ? ` at ${num(p.retention_time.value, 1)} h` : ''}` : ''
  const strength = p.compressive_strengths.length ? `${list(p.compressive_strengths)} N/mm²${p.strength_age ? `, ${p.strength_age.value}` : ''}` : ''
  return (
    <Card title="What the customer needs">
      <Facts rows={[
        ['Grade', list(p.grades_of_concrete)],
        ['Free W/C', list(p.wc_ratios_ssd)],
        [kind, workability],
        ['Strength', strength],
        ['Cement', [list(p.cement_grades), list(p.cement_brands)].filter(Boolean).join(', ')],
        ['Mineral admixture', list(p.mineral_admixtures)],
        ['Cementitious', p.cementitious_contents.length ? `${p.cementitious_contents.join(' or ')} kg/m³` : ''],
        ['Sand', [p.sand_type?.value, p.sand_zone?.value].filter(Boolean).join(', ')],
      ]} />
      {p.remarks ? <Body style={{ color: color.subtle }}><Text style={{ fontFamily: font.semibold, color: color.ink }}>Remarks. </Text>{p.remarks}</Body> : null}
    </Card>
  )
}

function TrialsSection({ p, q, onStart, starting }: {
  p: Project; q: ReturnType<typeof useProjectTrials>; onStart?: () => void; starting: boolean
}) {
  const trials = q.data?.results ?? []
  return (
    <View style={{ gap: 8 }}>
      <H2>Trials</H2>
      {q.isLoading ? <Loading label="Loading trials" /> : null}
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
      {q.isSuccess && trials.length === 0 ? (
        <Card>
          <EmptyState title="No trials yet"
            body={onStart ? 'Start a trial to record the mix design, fresh concrete tests and cube results for this project.'
              : p.status === 'draft' ? 'Trials can start once the project is created.' : 'Trials appear here when the Sales Person or the CT starts one.'}
            action={onStart ? <Button title="Start trial" busy={starting} onPress={onStart} /> : undefined} />
        </Card>
      ) : null}
      {trials.map((t, i) => <TrialRow key={t.id} t={t} n={trials.length - i} />)}
    </View>
  )
}

function TrialRow({ t, n }: { t: TrialListItem; n: number }) {
  const open = t.status === 'in_progress'
  const detail = t.status === 'closed'
    ? [t.cast_at ? `Cast ${shortDate(t.cast_at)}` : null, t.strength_28d ? `28 d at ${num(t.strength_28d)} N/mm²` : null].filter(Boolean).join(', ')
    : [t.cast_at ? `Cast ${shortDate(t.cast_at)}` : `Created ${shortDate(t.created_at)}`, t.grade].filter(Boolean).join(', ')
  let chip: ReactNode = <TrialStatusChip status={t.status} />
  if (t.status === 'closed') chip = <OutcomeChip outcome={t.outcome} />
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`Trial ${n}, ${t.code ?? 'draft'}. ${t.product ?? 'No product yet'}. ${detail}. ${t.status === 'closed' ? t.outcome_label || 'Not concluded' : t.status_label}`}
      onPress={() => router.push(`/trial/${t.id}`)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.card, borderWidth: 1, borderColor: color.line, backgroundColor: pressed ? color.head : color.surface })}>
      <View style={{ width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: open ? color.link : color.status.draft.bg }}>
        <Text style={{ fontFamily: font.bold, fontSize: 15, color: open ? '#fff' : color.subtle }}>{n}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Strong numberOfLines={1}>{t.product ?? t.code ?? 'Draft trial'}</Strong>
        <Small style={{ fontSize: 14 }} numberOfLines={2}>{detail || (t.code ?? '')}</Small>
      </View>
      {chip}
    </Pressable>
  )
}

function CustomerCard({ p }: { p: Project }) {
  const phone = p.contact_phone ? `+91 ${p.contact_phone.slice(0, 5)} ${p.contact_phone.slice(5)}` : ''
  return (
    <Card title="Customer and contact" right={<ProjectStatusChip status={p.status} />}>
      <Facts rows={[
        ['Contact person', p.contact_person_name],
        ['Sales Person', p.sales_person?.name ?? ''],
        ['CT', p.ct?.name ?? (p.status === 'draft' ? '' : 'Unassigned')],
        ['Region', p.region?.value ?? ''],
        ['Potential', p.potential_cr === null ? '' : `₹${num(p.potential_cr)} Cr`],
        ['Price, bulk', p.selling_basic_price === null ? '' : `${num(p.selling_basic_price)} INR/kg`],
        ['Price, barrel', p.bulk_and_barrel === null ? '' : `${num(p.bulk_and_barrel)} INR/kg`],
        ['Admixture base', p.admixture_base?.value ?? 'None'],
      ]} />
      {p.contact_phone ? <ContactLink label={phone} a11y={`Call ${p.contact_person_name || 'the contact'} on ${phone}`} url={`tel:+91${p.contact_phone}`} /> : null}
      {p.contact_email ? <ContactLink label={p.contact_email} a11y={`Email ${p.contact_email}`} url={`mailto:${p.contact_email}`} /> : null}
      <Small>Created {date(p.created_at)}{p.created_by ? ` by ${p.created_by.name}` : ''}. Updated {date(p.updated_at)}.</Small>
    </Card>
  )
}

function ContactLink({ label, a11y, url }: { label: string; a11y: string; url: string }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={a11y} onPress={() => { void Linking.openURL(url).catch(() => undefined) }}
      style={{ minHeight: TOUCH, justifyContent: 'center' }}>
      <Text style={{ fontFamily: font.semibold, fontSize: 15, color: color.link }}>{label}</Text>
    </Pressable>
  )
}
