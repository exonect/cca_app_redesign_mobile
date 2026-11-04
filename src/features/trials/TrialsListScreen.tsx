/** Trials list (/trial): the trials the person can see, newest first, with
 * status filter chips, search, pull to refresh and endless scroll. */
import { useInfiniteQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native'

import { api, type Page } from '@/api/client'
import { AGES } from '@/shared/calc'
import type { TrialListItem, TrialStatus } from '@/shared/types'
import { Chips, EmptyState, ErrorState, Header, Loading, OutcomeChip, Small, TextField, TrialStatusChip } from '@/ui/kit'
import { color, font, radius } from '@/ui/theme'

import { num, shortDate } from './format'

const PAGE_SIZE = 25
const STATUSES: { value: TrialStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' }, { value: 'in_progress', label: 'In progress' }, { value: 'closed', label: 'Closed' },
]

export function detail(t: TrialListItem) {
  const parts = [t.product, t.grade].filter(Boolean).join(', ')
  if (t.strength_28d) return `${parts ? `${parts}. ` : ''}28 days ${num(t.strength_28d)} N/mm²`
  if (t.status === 'in_progress' && t.cast_at) {
    const due = new Date(new Date(t.cast_at).getTime() + AGES['28d'][1] * 3_600_000)
    return `${parts ? `${parts}. ` : ''}Cast ${shortDate(t.cast_at)}, 28 days due ${shortDate(due)}`
  }
  return parts || 'Not started'
}

export function TrialsListScreen() {
  const [status, setStatus] = useState<TrialStatus[]>(['in_progress'])
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 350); return () => clearTimeout(t) }, [search])

  const q = useInfiniteQuery({
    queryKey: ['trials', { status, term }],
    queryFn: ({ pageParam }) => api<Page<TrialListItem>>('/trials/', {
      query: { status, search: term || undefined, ordering: '-updated_at', page: pageParam, page_size: PAGE_SIZE },
    }),
    initialPageParam: 1,
    getNextPageParam: (last, all) => (last.next ? all.length + 1 : undefined),
  })
  const rows = q.data?.pages.flatMap((p) => p.results) ?? []

  return (
    <View style={{ flex: 1, backgroundColor: color.concrete }}>
      <Header title="Trials" back={{ label: 'More', onPress: () => (router.canGoBack() ? router.back() : router.replace('/more')) }} />
      <FlatList
        data={rows}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => { q.refetch() }} tintColor={color.ink} />}
        onEndReached={() => { if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage() }}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={(
          <View style={{ gap: 10, paddingBottom: 4 }}>
            <TextField accessibilityLabel="Search trials by number, project or customer" placeholder="Search number, project or customer"
              value={search} onChangeText={setSearch} returnKeyType="search" autoCorrect={false} />
            <Chips label="Status" options={STATUSES} value={status} onChange={setStatus} />
          </View>
        )}
        ListEmptyComponent={q.isPending ? <Loading label="Loading trials" />
          : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} />
            : <EmptyState title="No trials match" body={status.length || term ? 'Clear the search or choose another status.' : 'Trials appear here once a project has one.'} />}
        ListFooterComponent={q.isFetchingNextPage ? <Loading label="Loading more" /> : q.isFetchNextPageError ? <ErrorState error={q.error} onRetry={() => { void q.fetchNextPage() }} /> : undefined}
        renderItem={({ item: t }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`${t.code ?? 'Draft trial'}, ${t.project_name}, ${t.status_label}`}
            onPress={() => router.push({ pathname: '/trial/[id]', params: { id: t.id } })}
            style={({ pressed }) => ({ backgroundColor: pressed ? color.head : color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, padding: 14, gap: 6 })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: font.condBold, fontSize: 17, color: color.ink }}>{t.code ?? 'Draft trial'}</Text>
              <TrialStatusChip status={t.status} />
            </View>
            <Text numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: 15, color: color.ink }}>{t.project_name}</Text>
            <Small>{t.customer_name}</Small>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Small style={{ flexShrink: 1 }}>{detail(t)}</Small>
              {t.outcome ? <OutcomeChip outcome={t.outcome} /> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  )
}
