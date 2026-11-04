import { router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useAuth } from '@/auth/AuthProvider'
import type { Recipe } from '@/shared/types'
import { Button, EmptyState, ErrorState, H1, Loading, Small, Strong, TextField } from '@/ui/kit'
import { color, font, radius, TOUCH } from '@/ui/theme'

import { usePaged } from '@/features/projects/api'
import { plural } from '@/features/projects/format'
import { useDebounced, useRefresh } from '@/features/projects/hooks'
import { goBack } from '@/features/projects/TabHeader'

import { FAMILY_OPTIONS } from './balance'
import { RecipeStatusChip } from './parts'

const FAMILIES = [{ value: '', label: 'All' }, ...FAMILY_OPTIONS.filter((f) => f.value !== 'other')]

export function RecipesScreen() {
  const { hasRole } = useAuth()
  const [family, setFamily] = useState('')
  const [text, setText] = useState('')
  const search = useDebounced(text.trim(), 300)
  const query = { search: search || undefined, family: family || undefined, ordering: '-updated_at' }
  const list = usePaged<Recipe>(['recipes', 'infinite', query], '/recipes/', query)
  const { refreshing, onRefresh } = useRefresh(() => list.refetch())
  const canEdit = hasRole('AD', 'SAD', 'CT')
  const filtered = Boolean(search || family)

  return (
    <View style={{ flex: 1, backgroundColor: color.concrete }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: color.surface, borderBottomWidth: 1, borderColor: color.line, paddingHorizontal: 16, paddingBottom: 14, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to More" onPress={() => goBack('/more')} hitSlop={8} style={{ minHeight: TOUCH, justifyContent: 'center' }}>
            <Text style={{ fontFamily: font.semibold, fontSize: 15, color: color.link }}>‹ More</Text>
          </Pressable>
          {canEdit ? <Button title="New recipe" variant="primary" onPress={() => router.push('/recipes/new')} style={{ flexGrow: 0, minHeight: 44 }} /> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <H1>Recipe master</H1>
          {list.isSuccess ? <Small>{plural(list.count, 'recipe')}</Small> : null}
        </View>
        <TextField accessibilityLabel="Search recipes by product, formulation name or location" placeholder="Product, formulation or customer"
          value={text} onChangeText={setText} autoCorrect={false} clearButtonMode="while-editing" />
      </SafeAreaView>

      <FlatList
        data={list.items}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReachedThreshold={0.4}
        onEndReached={() => { if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage() }}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel="Product family" contentContainerStyle={{ gap: 8 }}>
              {FAMILIES.map((f) => {
                const on = f.value === family
                return (
                  <Pressable key={f.value || 'all'} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setFamily(f.value)}
                    style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 22, justifyContent: 'center', borderWidth: on ? 0 : 1, borderColor: color.line, backgroundColor: on ? color.ink : color.surface }}>
                    <Text style={{ fontFamily: font.semibold, fontSize: 15, color: on ? '#fff' : color.subtle }}>{f.label}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>
            <Small>{hasRole('CT') ? 'You see recipes you formulated.' : 'Active recipes appear in the product list on trials.'}</Small>
          </View>
        }
        renderItem={({ item: r }) => (
          <Pressable accessibilityRole="link" accessibilityLabel={`${r.label}, ${r.status_label}. ${[r.formulation_name, r.location_name].filter(Boolean).join(', ')}`}
            onPress={() => router.push(`/recipes/${r.id}`)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.card, borderWidth: 1, borderColor: color.line, backgroundColor: pressed ? color.head : color.surface })}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Strong style={{ fontSize: 16 }}>{r.product_name}</Strong>
                <Text style={{ fontFamily: font.semibold, fontSize: 13, color: color.subtle, backgroundColor: color.head, paddingHorizontal: 6, borderRadius: 6 }}>V{r.version}</Text>
              </View>
              <Small numberOfLines={1}>{[r.formulation_name || 'No formulation name', r.location_name].filter(Boolean).join(', ')}</Small>
            </View>
            <RecipeStatusChip status={r.status} />
          </Pressable>
        )}
        ListEmptyComponent={
          list.isLoading ? <Loading label="Loading recipes" />
            : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} />
              : filtered ? <EmptyState title="No recipes match" body="Check the spelling, or search by formulation name or SFDC number."
                  action={<Button title="Clear search and filter" onPress={() => { setText(''); setFamily('') }} />} />
                : <EmptyState title="No recipes yet" body="Add a recipe to record an admixture formulation. Active recipes appear in the product list on trials." />
        }
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={color.ink} accessibilityLabel="Loading more recipes" /> : list.isFetchNextPageError ? <ErrorState error={list.error} onRetry={() => { void list.fetchNextPage() }} /> : undefined}
      />
    </View>
  )
}
