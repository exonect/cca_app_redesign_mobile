import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'
import Svg, { Circle, Polyline } from 'react-native-svg'

import { api, type Page } from '@/api/client'
import { useAuth } from '@/auth/AuthProvider'
import { SyncChip } from '@/offline/ui'
import type { ProjectListItem, TrialListItem } from '@/shared/types'
import { Button, EmptyState, ErrorState, Loading, ProjectStatusChip, Small, Strong, TrialStatusChip } from '@/ui/kit'
import { color, font, radius } from '@/ui/theme'

import { useProjects } from '@/features/projects/api'
import { AssignCtSheet } from '@/features/projects/AssignCtSheet'
import { CompleteSheet } from '@/features/projects/CompleteSheet'
import { plural, relative } from '@/features/projects/format'
import { useNotice, useRefresh } from '@/features/projects/hooks'
import { projectPlace } from '@/features/projects/ProjectCard'
import { Notice } from '@/features/projects/Sheet'
import { DarkSegmented, TabHeader } from '@/features/projects/TabHeader'

import { dueLabel, type CubeDue } from './cubesDue'

type Tab = 'trials' | 'assigned' | 'drafts' | 'complete' | 'assign'
type Item =
  | { kind: 'trial'; key: string; t: TrialListItem; due: CubeDue[] }
  | { kind: 'project'; key: string; p: ProjectListItem; why: Tab }

export function MyWorkScreen() {
  const { hasRole } = useAuth()
  const manager = hasRole('AD', 'SAD')
  const ct = hasRole('CT')
  const sales = hasRole('SP')
  const [assignFor, setAssignFor] = useState<ProjectListItem | null>(null)
  const [completeFor, setCompleteFor] = useState<ProjectListItem | null>(null)
  const [notice, setNotice, clearNotice] = useNotice()

  // Same queries as the web dashboard's "Waiting on you".
  const support = useProjects({ status: 'support_requested', unassigned: 'true', ordering: 'updated_at', page_size: 25 }, manager)
  const closed = useProjects({ status: 'trials_closed', ordering: 'updated_at', page_size: 25 }, !ct)
  const drafts = useProjects({ status: 'draft', ordering: '-updated_at', page_size: 25 }, sales)
  const assigned = useProjects({ status: 'assigned_to_ct', ordering: 'updated_at', page_size: 25 }, ct)
  const trials = useQuery({
    queryKey: ['trials', 'list', { status: 'in_progress', page_size: 25, ordering: '-updated_at' }],
    queryFn: () => api<Page<TrialListItem>>('/trials/', { query: { status: 'in_progress', page_size: 25, ordering: '-updated_at' } }),
    enabled: !manager,
  })
  // One call for every cube test due today on trials this user works on.
  const due = useQuery({
    queryKey: ['trials', 'due-today'],
    queryFn: () => api<{ trial: string; age: string; age_label: string }[]>('/trials/due-today/'),
    enabled: !manager,
    staleTime: 60_000,
  })
  const dueById = useMemo(() => {
    const m: Record<string, CubeDue[]> = {}
    for (const d of due.data ?? []) (m[d.trial] ??= []).push({ age: d.age, label: d.age_label, dueAt: '' })
    return m
  }, [due.data])

  const tabs: { value: Tab; label: string; items: Item[] }[] = useMemo(() => {
    const trialItems: Item[] = (trials.data?.results ?? []).map((t) => ({ kind: 'trial', key: `t-${t.id}`, t, due: dueById[t.id] ?? [] }))
    trialItems.sort((a, b) => Number(b.kind === 'trial' && b.due.length > 0) - Number(a.kind === 'trial' && a.due.length > 0))
    const proj = (q: typeof support, why: Tab): Item[] => (q.data?.results ?? []).map((p) => ({ kind: 'project', key: `${why}-${p.id}`, p, why }))
    if (manager) return [
      { value: 'assign', label: 'To assign', items: proj(support, 'assign') },
      { value: 'complete', label: 'To complete', items: proj(closed, 'complete') },
    ]
    if (ct) return [
      { value: 'trials', label: 'Open trials', items: trialItems },
      { value: 'assigned', label: 'Assigned', items: proj(assigned, 'assigned') },
    ]
    return [
      { value: 'trials', label: 'Trials', items: trialItems },
      { value: 'drafts', label: 'Drafts', items: proj(drafts, 'drafts') },
      { value: 'complete', label: 'To complete', items: proj(closed, 'complete') },
    ]
  }, [manager, ct, trials.data, dueById, support.data, closed.data, assigned.data, drafts.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const [tabState, setTab] = useState<Tab | null>(null)
  const tab = tabs.find((t) => t.value === tabState) ?? tabs[0]
  const queries = manager ? [support, closed] : ct ? [assigned, trials] : [drafts, closed, trials]
  const loading = queries.some((q) => q.isLoading)
  const failed = queries.find((q) => q.isError)
  const { refreshing, onRefresh } = useRefresh(() => Promise.all([...queries.map((q) => q.refetch()), due.refetch()]))

  const dueTrials = (trials.data?.results ?? []).filter((t) => (dueById[t.id] ?? []).length > 0)
  const dueCount = dueTrials.reduce((n, t) => n + dueById[t.id].length, 0)

  return (
    <View style={{ flex: 1, backgroundColor: color.concrete }}>
      <TabHeader title="My work">
        <DarkSegmented label="Show" value={tab.value} onChange={setTab}
          options={tabs.map((t) => ({ value: t.value, label: loading ? t.label : `${t.label} ${t.items.length}` }))} />
      </TabHeader>
      <FlatList
        data={loading || failed ? [] : tab.items}
        keyExtractor={(i) => i.key}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Notice text={notice} onDone={clearNotice} />
            {dueCount > 0 ? <DueBanner count={dueCount} names={dueTrials.map((t) => t.project_name)} /> : null}
          </View>
        }
        renderItem={({ item }) => item.kind === 'trial'
          ? <TrialCard t={item.t} due={item.due} />
          : <ProjectItem p={item.p} why={item.why} onAssign={() => setAssignFor(item.p)} onComplete={() => setCompleteFor(item.p)} />}
        ListEmptyComponent={
          loading ? <Loading />
            : failed ? <ErrorState error={failed.error} onRetry={() => queries.forEach((q) => q.refetch())} />
              : <EmptyState title="Nothing needs you right now" body={EMPTY[tab.value]} />
        }
      />
      <AssignCtSheet project={assignFor} open={assignFor !== null} onClose={() => setAssignFor(null)} onDone={setNotice} />
      <CompleteSheet project={completeFor} open={completeFor !== null} onClose={() => setCompleteFor(null)} onDone={setNotice} />
    </View>
  )
}

const EMPTY: Record<Tab, string> = {
  trials: 'Trials you are running show here, with cube tests due today first.',
  assigned: 'Projects assigned to you show here until you start their first trial.',
  drafts: 'Draft projects you have not created yet show here.',
  complete: 'Projects whose trials have all closed show here, ready for a decision.',
  assign: 'Support requests without a CT show here.',
}

function DueBanner({ count, names }: { count: number; names: string[] }) {
  const unique = [...new Set(names)]
  const on = unique.length <= 2 ? unique.join(' and ') : `${unique.slice(0, 2).join(', ')} and ${plural(unique.length - 2, 'other project')}`
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.card, backgroundColor: color.below.bg }}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color.below.fg} strokeWidth={2} strokeLinecap="round">
        <Circle cx={12} cy={12} r={9} /><Polyline points="12 7 12 12 15 14" />
      </Svg>
      <Text style={{ flex: 1, fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: '#5A3104' }}>
        <Text style={{ fontFamily: font.bold }}>{plural(count, 'cube test')} due today</Text> on {on}.
      </Text>
    </View>
  )
}

function Shell({ children, onPress, label }: { children: React.ReactNode; onPress: () => void; label: string }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => ({ backgroundColor: pressed ? color.head : color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, paddingHorizontal: 16, paddingVertical: 14, gap: 8 })}>
      {children}
    </Pressable>
  )
}

function Top({ title, sub, chip }: { title: string; sub: string; chip: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Strong style={{ fontSize: 16 }}>{title}</Strong>
        {sub ? <Small style={{ fontSize: 14 }}>{sub}</Small> : null}
      </View>
      {chip}
    </View>
  )
}

function Foot({ left, right, children }: { left: string; right?: string; children?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderColor: color.divider, paddingTop: 8 }}>
      <Text style={{ flex: 1, fontFamily: font.regular, fontSize: 14, color: color.subtle }}>{left}</Text>
      {right ? <Text style={{ fontFamily: font.semibold, fontSize: 14, color: color.link }}>{right}</Text> : null}
      {children}
    </View>
  )
}

function TrialCard({ t, due }: { t: TrialListItem; due: CubeDue[] }) {
  const left = [t.code ?? 'Trial', t.grade].filter(Boolean).join(', ')
  const next = due.length ? dueLabel(due) : t.cast_at ? 'Open trial' : 'Finish mix design'
  return (
    <Shell onPress={() => router.push(`/trial/${t.id}`)} label={`${t.project_name}, ${t.customer_name}. ${left}. ${next}`}>
      <Top title={t.project_name} sub={t.customer_name} chip={<View style={{ alignItems: 'flex-end', gap: 4 }}><TrialStatusChip status={t.status} /><SyncChip trialId={t.id} /></View>} />
      <Foot left={left} right={next} />
    </Shell>
  )
}

function ProjectItem({ p, why, onAssign, onComplete }: { p: ProjectListItem; why: Tab; onAssign: () => void; onComplete: () => void }) {
  const open = () => router.push(why === 'drafts' ? { pathname: '/project/new', params: { id: p.id } } : `/project/${p.id}`)
  const left = {
    assign: `Support requested${p.sales_person ? ` by ${p.sales_person.name}` : ''}, ${relative(p.updated_at)}`,
    complete: `${plural(p.trial_count, 'trial')} closed, ready for a decision`,
    drafts: `Draft, last saved ${relative(p.updated_at)}`,
    assigned: 'Assigned to you, no trial started yet',
    trials: '',
  }[why]
  const title = p.project_name || (why === 'drafts' ? 'Untitled draft' : 'Untitled project')
  return (
    <Shell onPress={open} label={`${title}, ${projectPlace(p)}. ${left}`}>
      <Top title={title} sub={projectPlace(p)} chip={<ProjectStatusChip status={p.status} />} />
      <Foot left={left} right={why === 'drafts' ? 'Finish draft' : why === 'assigned' ? 'Start trial' : undefined}>
        {why === 'assign' ? <Button title="Assign CT" onPress={onAssign} accessibilityLabel={`Assign CT to ${title}`} style={{ flexGrow: 0, minHeight: 44 }} /> : null}
        {why === 'complete' ? <Button title="Mark completed" onPress={onComplete} accessibilityLabel={`Mark ${title} completed`} style={{ flexGrow: 0, minHeight: 44 }} /> : null}
      </Foot>
    </Shell>
  )
}
