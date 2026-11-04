import { useMutation, useQueryClient } from '@tanstack/react-query'
import { router, type Href } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, SectionList, Text, View } from 'react-native'

import { useUnreadCount } from '@/api/hooks'
import { api } from '@/api/client'
import type { Notification } from '@/shared/types'
import { Button, EmptyState, ErrorState, H2, Loading, Small } from '@/ui/kit'
import { color, font, radius } from '@/ui/theme'

import { usePaged } from '@/features/projects/api'
import { initials, istDay, shortDate, time } from '@/features/projects/format'
import { useRefresh } from '@/features/projects/hooks'
import { DarkSegmented, TabHeader } from '@/features/projects/TabHeader'

import { appRoute } from './links'

type Tab = 'unread' | 'all'

export function AlertsScreen() {
  const [tab, setTab] = useState<Tab>('unread')
  const qc = useQueryClient()
  const unread = useUnreadCount().data?.unread ?? 0
  const query = { unread: tab === 'unread' ? 'true' : undefined, page_size: 30 }
  const list = usePaged<Notification>(['notifications', 'list', tab], '/notifications/', query)
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] })
  const { refreshing, onRefresh } = useRefresh(() => Promise.all([list.refetch(), qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] })]))

  const readOne = useMutation({ mutationFn: (id: number) => api(`/notifications/${id}/read/`, { method: 'POST' }), onSuccess: refresh })
  const readAll = useMutation({ mutationFn: () => api('/notifications/read-all/', { method: 'POST' }), onSuccess: refresh })

  const today = istDay(new Date())
  const sections = [
    { title: `Today, ${shortDate(new Date())}`, data: list.items.filter((n) => istDay(n.created_at) === today), today: true },
    { title: 'Earlier', data: list.items.filter((n) => istDay(n.created_at) !== today), today: false },
  ].filter((s) => s.data.length).map((s, i) => ({ ...s, top: i === 0 }))

  const open = (n: Notification) => {
    if (!n.is_read) readOne.mutate(n.id)
    const to = appRoute(n.link, n.trial_id)
    if (to) router.push(to as Href)
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.concrete }}>
      <TabHeader title="Alerts">
        <DarkSegmented label="Show" value={tab} onChange={setTab}
          options={[{ value: 'unread', label: unread ? `Unread ${unread > 99 ? '99+' : unread}` : 'Unread' }, { value: 'all', label: 'All' }]} />
      </TabHeader>
      <SectionList
        sections={sections}
        keyExtractor={(n) => String(n.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshing={refreshing}
        onRefresh={onRefresh}
        stickySectionHeadersEnabled={false}
        onEndReachedThreshold={0.4}
        onEndReached={() => { if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage() }}
        ListHeaderComponent={readAll.isError ? <ErrorState error={readAll.error} /> : undefined}
        renderSectionHeader={({ section }) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: section.top ? 0 : 16, paddingBottom: 8 }}>
            <H2>{section.title}</H2>
            {section.top && unread > 0 ? (
              <Button title="Mark all as read" variant="tertiary" busy={readAll.isPending} onPress={() => readAll.mutate()} style={{ flexGrow: 0 }} />
            ) : null}
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <AlertRow n={item} onPress={() => open(item)} first={index === 0} last={index === section.data.length - 1} sameDay={section.today} />
        )}
        ListEmptyComponent={
          list.isLoading ? <Loading />
            : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} />
              : <EmptyState title={tab === 'unread' ? "You're all caught up" : 'No notifications yet'}
                  body="You'll hear here when projects you work on change, when trials close and when cube tests are due." />
        }
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={color.ink} accessibilityLabel="Loading more" /> : undefined}
      />
    </View>
  )
}

function AlertRow({ n, onPress, first, last, sameDay }: { n: Notification; onPress: () => void; first: boolean; last: boolean; sameDay: boolean }) {
  const system = !n.actor_name
  const when = sameDay ? time(n.created_at) : shortDate(n.created_at)
  return (
    <Pressable accessibilityRole="link"
      accessibilityLabel={`${n.is_read ? '' : 'Unread. '}${n.title}. ${n.project_name ?? ''}. ${n.message}. ${when}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: pressed ? color.head : color.surface,
        borderLeftWidth: 1, borderRightWidth: 1, borderTopWidth: first ? 1 : 0, borderBottomWidth: 1, borderColor: color.line,
        borderTopLeftRadius: first ? radius.card : 0, borderTopRightRadius: first ? radius.card : 0,
        borderBottomLeftRadius: last ? radius.card : 0, borderBottomRightRadius: last ? radius.card : 0,
      })}>
      <View style={{ width: 10, height: 10, marginTop: 13, borderRadius: 5, backgroundColor: n.is_read ? 'transparent' : color.link }} />
      <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: system ? color.status.draft.bg : '#DCE7F2' }}>
        <Text style={{ fontFamily: font.bold, fontSize: 13, color: system ? color.subtle : '#1F4568' }}>{system ? 'CCA' : initials(n.actor_name)}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Text style={{ flex: 1, fontFamily: n.is_read ? font.medium : font.bold, fontSize: 15, color: color.ink }}>{n.title}</Text>
          <Small>{when}</Small>
        </View>
        {n.project_name ? <Text style={{ fontFamily: font.semibold, fontSize: 14, color: color.subtle }}>{n.project_name}</Text> : null}
        <Text style={{ fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.muted }}>{n.message}</Text>
      </View>
    </Pressable>
  )
}
