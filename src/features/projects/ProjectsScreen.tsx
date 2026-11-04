import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native'

import { useAuth } from '@/auth/AuthProvider'
import type { ProjectStatus } from '@/shared/types'
import { Button, EmptyState, ErrorState, Loading, Small, TextField } from '@/ui/kit'
import { color, font } from '@/ui/theme'

import { usePipeline, useProjectPages } from './api'
import { plural } from './format'
import { useDebounced, useRefresh } from './hooks'
import { ProjectCard } from './ProjectCard'
import { TabHeader } from './TabHeader'

export function ProjectsScreen() {
  const { user, hasRole } = useAuth()
  const params = useLocalSearchParams<{ status?: string }>()
  const [status, setStatus] = useState<ProjectStatus | ''>((params.status as ProjectStatus) ?? '')
  const [text, setText] = useState('')
  const search = useDebounced(text.trim(), 300)
  useEffect(() => { if (params.status !== undefined) setStatus(params.status as ProjectStatus) }, [params.status])

  const base = { search: search || undefined }
  const pipeline = usePipeline(base)
  const list = useProjectPages({ ...base, status: status || undefined, ordering: '-updated_at' })
  const { refreshing, onRefresh } = useRefresh(() => Promise.all([list.refetch(), pipeline.refetch()]))
  const canCreate = !hasRole('CT')

  const stages = (pipeline.data?.stages ?? []).filter((s) => s.count > 0 || s.status === status)
  const filters = [{ status: '' as const, label: 'All', count: pipeline.data?.projects ?? 0 }, ...stages]
  const filtered = Boolean(search || status)
  const scope = hasRole('AD', 'SAD') ? (user?.region_name ? `in ${user.region_name}` : 'in CCA') : hasRole('CT') ? 'assigned to you' : 'you own'

  return (
    <View style={{ flex: 1, backgroundColor: color.concrete }}>
      <TabHeader title="Projects"
        right={canCreate ? (
          <Pressable accessibilityRole="button" accessibilityLabel="New project" onPress={() => router.push('/project/new')}
            style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, borderRadius: 8, backgroundColor: color.action, justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
            <Text style={{ fontFamily: font.semibold, fontSize: 15, color: '#fff' }}>New project</Text>
          </Pressable>
        ) : null}>
        <TextField accessibilityLabel="Search projects" placeholder="Search project, customer or SFDC" value={text} onChangeText={setText}
          returnKeyType="search" autoCorrect={false} clearButtonMode="while-editing" />
      </TabHeader>

      <FlatList
        data={list.items}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <ProjectCard p={item} />}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReachedThreshold={0.4}
        onEndReached={() => { if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage() }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="Filter by status"
              contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -16 }}>
              <View style={{ width: 8 }} />
              {filters.map((f) => (
                <StatusChip key={f.status || 'all'} label={f.label} count={f.count} on={f.status === status} onPress={() => setStatus(f.status)} />
              ))}
              <View style={{ width: 8 }} />
            </ScrollView>
            {pipeline.isError ? <ErrorState error={pipeline.error} onRetry={() => pipeline.refetch()} /> : null}
            {list.isSuccess ? (
              <View accessibilityLiveRegion="polite">
                <Small style={{ fontSize: 14 }}>
                  {plural(list.count, 'project')} {scope}{status ? `, ${filters.find((f) => f.status === status)?.label.toLowerCase() ?? ''}` : ''}, newest activity first
                </Small>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          list.isLoading ? <Loading label="Loading projects" />
            : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} />
              : filtered ? (
                <EmptyState title="No projects match" body="Check the spelling, or search by customer name or the 6 digit SFDC number."
                  action={<Button title="Clear search and filter" onPress={() => { setText(''); setStatus('') }} />} />
              ) : (
                <EmptyState title="No projects yet"
                  body={canCreate ? "Create a project to record a customer's concrete requirement, then run trials against it." : 'Projects appear here once a manager assigns you as their CT.'}
                  action={canCreate ? <Button title="New project" variant="primary" onPress={() => router.push('/project/new')} /> : undefined} />
              )
        }
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={color.ink} accessibilityLabel="Loading more projects" /> : undefined}
      />
    </View>
  )
}

function StatusChip({ label, count, on, onPress }: { label: string; count: number; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${label}, ${count}`} onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 22, borderWidth: on ? 0 : 1, borderColor: color.line, backgroundColor: on ? color.ink : color.surface }}>
      <Text style={{ fontFamily: font.semibold, fontSize: 14, color: on ? '#fff' : color.ink }}>{label}</Text>
      <View style={{ minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? '#fff' : color.status.draft.bg }}>
        <Text style={{ fontFamily: font.bold, fontSize: 13, color: on ? color.ink : color.subtle }}>{count}</Text>
      </View>
    </Pressable>
  )
}
