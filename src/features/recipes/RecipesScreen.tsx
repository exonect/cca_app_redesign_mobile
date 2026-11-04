import { router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useAuth } from '@/auth/AuthProvider'
import type { Recipe } from '@/shared/types'
import { Button, EmptyState, ErrorState, H1, Loading, Small, Strong, TextField } from '@/ui/kit'
import { color, font, radius, TOUCH } from '@/ui/theme'

import { usePaged } from '@/features/projects/api'
import { date, plural } from '@/features/projects/format'
import { useDebounced, useRefresh } from '@/features/projects/hooks'
import { goBack } from '@/features/projects/TabHeader'

import { FAMILY_OPTIONS, STATUS_OPTIONS } from './balance'
import { isoDate, maskDate, recipeQuery } from './filters'
import { RecipeStatusChip } from './parts'

const FAMILIES = [{ value: '', label: 'All' }, ...FAMILY_OPTIONS]
const STATUSES = [{ value: '', label: 'Any status' }, ...STATUS_OPTIONS]

function ChipRow({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel={label} contentContainerStyle={{ gap: 8 }}>
      {options.map((f) => {
        const on = f.value === value
        return (
          <Pressable key={f.value || 'all'} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(f.value)}
            style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 22, justifyContent: 'center', borderWidth: on ? 0 : 1, borderColor: color.line, backgroundColor: on ? color.ink : color.surface }}>
            <Text style={{ fontFamily: font.semibold, fontSize: 15, color: on ? '#fff' : color.subtle }}>{f.label}</Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

export function RecipesScreen() {
  const { hasRole } = useAuth()
  const [family, setFamily] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [text, setText] = useState('')
  const search = useDebounced(text.trim(), 500)
  const query = recipeQuery({ search, family, status, from, to })
  const list = usePaged<Recipe>(['recipes', 'infinite', query], '/recipes/', query)
  const { refreshing, onRefresh } = useRefresh(() => list.refetch())
  // Legacy mobile: Admins and CTs add recipes from Recipe master.
  const canAdd = hasRole('AD', 'CT')
  const filtered = Boolean(search || family || status || query.created_from || query.created_to)
  const clear = () => { setText(''); setFamily(''); setStatus(''); setFrom(''); setTo('') }

  return (
    <View style={{ flex: 1, backgroundColor: color.concrete }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: color.surface, borderBottomWidth: 1, borderColor: color.line, paddingHorizontal: 16, paddingBottom: 14, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to More" onPress={() => goBack('/more')} hitSlop={8} style={{ minHeight: TOUCH, justifyContent: 'center' }}>
            <Text style={{ fontFamily: font.semibold, fontSize: 15, color: color.link }}>‹ More</Text>
          </Pressable>
          {canAdd ? <Button title="New recipe" variant="primary" onPress={() => router.push('/recipes/new')} style={{ flexGrow: 0, minHeight: 44 }} /> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <H1>Recipe master</H1>
          {list.isSuccess ? <Small>{plural(list.count, 'recipe')}</Small> : null}
        </View>
        <TextField accessibilityLabel="Search recipes by product, formulation name, location or person" placeholder="Product, formulation, location or person"
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
            <ChipRow label="Product family" options={FAMILIES} value={family} onChange={setFamily} />
            <ChipRow label="Status" options={STATUSES} value={status} onChange={setStatus} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {([['Created from', from, setFrom], ['Created to', to, setTo]] as const).map(([label, value, setValue]) => (
                <View key={label} style={{ flex: 1, gap: 4 }}>
                  <Small>{label}</Small>
                  <TextField accessibilityLabel={`${label}, dd/mm/yyyy`} placeholder="dd/mm/yyyy" keyboardType="number-pad" maxLength={10}
                    invalid={value.length === 10 && isoDate(value) === null} value={value} onChangeText={(t) => setValue(maskDate(t))} />
                </View>
              ))}
            </View>
            <Small>{hasRole('CT') ? 'You see recipes you created.' : 'Active recipes appear in the product list on trials.'}</Small>
          </View>
        }
        renderItem={({ item: r }) => (
          <Pressable accessibilityRole="link" accessibilityLabel={`${r.label}, ${r.status_label}. ${[r.formulation_name, r.location_name].filter(Boolean).join(', ')}`}
            onPress={() => router.push(`/recipes/${r.id}`)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.card, borderWidth: 1, borderColor: color.line, backgroundColor: pressed ? color.head : color.surface })}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Strong style={{ fontSize: 16 }}>{r.product_name || r.label}</Strong>
                {r.product_name ? <Text style={{ fontFamily: font.semibold, fontSize: 13, color: color.subtle, backgroundColor: color.head, paddingHorizontal: 6, borderRadius: 6 }}>V{r.version}</Text> : null}
              </View>
              <Small numberOfLines={1}>{[r.product_name ? r.formulation_name || 'No formulation name' : 'No product name', r.location_name].filter(Boolean).join(', ')}</Small>
              <Small numberOfLines={1}>{[r.formulator_name, date(r.created_at)].filter(Boolean).join(', ')}</Small>
            </View>
            <RecipeStatusChip status={r.status} />
          </Pressable>
        )}
        ListEmptyComponent={
          list.isLoading ? <Loading label="Loading recipes" />
            : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} />
              : filtered ? <EmptyState title="No recipes match" body="Check the spelling, or search by formulation name or SFDC number."
                  action={<Button title="Clear search and filters" onPress={clear} />} />
                : <EmptyState title="No recipes yet" body="Add a recipe to record an admixture formulation. Active recipes appear in the product list on trials." />
        }
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={color.ink} accessibilityLabel="Loading more recipes" /> : list.isFetchNextPageError ? <ErrorState error={list.error} onRetry={() => { void list.fetchNextPage() }} /> : undefined}
      />
    </View>
  )
}
