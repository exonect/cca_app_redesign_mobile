import { useMutation, useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'

import { api } from '@/api/client'
import { fieldErrorsByPath, statusOf } from '@/api/errors'
import type { ProjectListItem, SearchGroup } from '@/shared/types'
import { Banner, Button, EmptyState, ErrorState, H2, Loading, Small, Strong, TextField } from '@/ui/kit'
import { color, font, radius } from '@/ui/theme'

import { projectKeys, usePaged } from '@/features/projects/api'
import { num, plural, shortDate } from '@/features/projects/format'
import { useDebounced, useRefresh } from '@/features/projects/hooks'
import { projectPlace } from '@/features/projects/ProjectCard'
import { Sheet } from '@/features/projects/Sheet'
import { TabHeader } from '@/features/projects/TabHeader'

import { countCriteria, criteriaChips, emptyCriteria, fromServer, mapServerErrors, toRequest, type Criteria } from './criteria'
import { CriteriaSheet } from './CriteriaSheet'

type SearchResponse = { criteria: Record<string, unknown>; products: number; trials: number; results: SearchGroup[] }
const PREVIEW = 3
const CHIP_LIMIT = 6

export function SearchScreen() {
  const [project, setProject] = useState<ProjectListItem | null>(null)
  const [criteria, setCriteria] = useState<Criteria>(emptyCriteria())
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState(false)
  const [allChips, setAllChips] = useState(false)
  // Legacy: a search with no criteria listed every product.
  const [listAll, setListAll] = useState(false)

  const request = useMemo(() => toRequest(criteria), [criteria])
  const n = countCriteria(request)
  const ran = n > 0 || listAll
  const search = useQuery({
    queryKey: ['search', request],
    queryFn: () => api<SearchResponse>('/search/', { method: 'POST', body: request }),
    enabled: ran,
  })
  const prefill = useMutation({
    mutationFn: (p: ProjectListItem) => api<Record<string, unknown>>('/search/criteria/', { query: { project: p.id } }),
    onSuccess: (raw, p) => { setProject(p); setCriteria(fromServer(raw)); setAllChips(false) },
  })
  const { refreshing, onRefresh } = useRefresh(() => search.refetch())
  // A refused search (400) is about the criteria: show where, not Try again.
  const refused = search.isError && statusOf(search.error) === 400 ? mapServerErrors(fieldErrorsByPath(search.error)) : undefined

  const chips = criteriaChips(criteria)
  const shown = allChips ? chips : chips.slice(0, CHIP_LIMIT)
  const hidden = chips.length - shown.length
  const groups = search.data?.results ?? []

  const header = (
    <View style={{ gap: 14 }}>
      <View style={{ backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <H2>Criteria</H2>
          <Button title="Edit criteria" variant="tertiary" onPress={() => setEditing(true)} style={{ flexGrow: 0 }} />
        </View>
        {prefill.isPending ? <Loading label="Filling criteria" /> : null}
        {prefill.isError ? <ErrorState error={prefill.error} /> : null}
        {chips.length === 0 && !prefill.isPending ? (
          <View style={{ gap: 8 }}>
            <Small>Pick a project to fill the criteria from its requirement, or set them yourself with Edit criteria.</Small>
            {!listAll ? <Button title="List every product" variant="secondary" onPress={() => setListAll(true)} /> : null}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {shown.map((c) => (
              <Pressable key={c.label} accessibilityRole="button" accessibilityLabel={`Edit criterion: ${c.label}`} onPress={() => setEditing(true)}
                style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: color.field, backgroundColor: color.head, justifyContent: 'center' }}>
                <Text style={{ fontFamily: font.semibold, fontSize: 14, color: color.ink }}>{c.text}</Text>
              </Pressable>
            ))}
            {hidden > 0 ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Show ${hidden} more criteria`} onPress={() => setAllChips(true)}
                style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 18, justifyContent: 'center' }}>
                <Text style={{ fontFamily: font.semibold, fontSize: 14, color: color.link }}>+{hidden} more</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </View>
      {ran && search.data ? (
        <View accessibilityLiveRegion="polite">
          <Text style={{ fontFamily: font.regular, fontSize: 15, color: color.subtle }}>
            {search.data.products === 0 ? <Text style={{ fontFamily: font.bold, color: color.ink }}>No products found</Text> : (
              <>
                <Text style={{ fontFamily: font.bold, color: color.ink }}>{plural(search.data.products, 'product')}</Text>
                {` from ${plural(search.data.trials, 'matching trial')}`}
              </>
            )}
            {n === 0 ? ', no criteria, every product listed' : `, ${plural(n, 'criterion', 'criteria')} applied`}
          </Text>
        </View>
      ) : null}
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: color.concrete }}>
      <TabHeader title="Product search">
        <Pressable accessibilityRole="button" accessibilityLabel={project ? `Search for ${project.project_name}, change project` : 'Choose a project to search for'}
          onPress={() => setPicking(true)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: color.ink2 }}>
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: font.semibold, fontSize: 15, color: '#fff' }}>
            {project ? `Search for ${project.project_name || 'Untitled project'}` : 'Search for a project'}
          </Text>
          <Text style={{ color: color.line, fontSize: 16 }}>⌄</Text>
        </Pressable>
      </TabHeader>

      <FlatList
        data={ran && search.isSuccess ? groups : []}
        keyExtractor={(g) => g.product}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
        refreshing={refreshing}
        onRefresh={ran ? onRefresh : undefined}
        ListHeaderComponent={header}
        renderItem={({ item, index }) => <ProductGroup g={item} expanded={index === 0} />}
        ListEmptyComponent={
          !ran ? undefined
            : search.isPending ? <Loading label="Searching past trials" />
              : refused ? (
                <View style={{ gap: 10 }}>
                  <ErrorState error={search.error} />
                  <Button title="Fix criteria" variant="primary" onPress={() => setEditing(true)} />
                </View>
              )
              : search.isError ? <ErrorState error={search.error} onRetry={() => search.refetch()} />
                : (
                  <EmptyState title="No past trials match all of these criteria"
                    body="Widen the search: remove the criteria you can live without, starting with sources and sand zone, or enter more than one value, for example W/C 0.38, 0.40."
                    action={<Button title="Edit criteria" onPress={() => setEditing(true)} />} />
                )
        }
        ListFooterComponent={ran && groups.length ? (
          <Small>Search covers closed trials that met expectation and imported history. A trial matches when every criterion you set falls inside its tolerance.</Small>
        ) : undefined}
      />

      <ProjectPickerSheet open={picking} onClose={() => setPicking(false)} onPick={(p) => { setPicking(false); prefill.mutate(p) }} />
      <CriteriaSheet open={editing} initial={criteria} serverErrors={refused} onClose={() => setEditing(false)}
        onApply={(c) => { setCriteria(c); setEditing(false); setAllChips(false); setListAll(false) }} />
    </View>
  )
}

function ProductGroup({ g, expanded }: { g: SearchGroup; expanded: boolean }) {
  const [open, setOpen] = useState(expanded)
  const [all, setAll] = useState(false)
  const rows = all ? g.matches : g.matches.slice(0, PREVIEW)
  return (
    <View style={{ backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, overflow: 'hidden' }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={`${g.product}, ${plural(g.trials, 'matched trial')}, ${g.met} met expectation, best 28 day strength ${g.best_28d ? `${num(g.best_28d)} newtons per square millimetre` : 'not tested'}`}
        onPress={() => setOpen(!open)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Strong style={{ fontSize: 17 }}>{g.product}</Strong>
          <Small style={{ fontSize: 14 }}>{plural(g.trials, 'matched trial')}, {g.met} met{g.typical_dosage ? `, typical ${num(g.typical_dosage)}%` : ''}</Small>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Small>Best 28 d, N/mm²</Small>
          <Text style={{ fontFamily: font.bold, fontSize: 20, color: color.ink }}>{g.best_28d ? num(g.best_28d) : 'None'}</Text>
        </View>
        <Text style={{ color: color.muted, fontSize: 16 }}>{open ? '⌃' : '⌄'}</Text>
      </Pressable>
      {open ? (
        <View style={{ borderTopWidth: 1, borderColor: color.divider }}>
          {rows.map((m) => {
            const detail = [m.dosage ? `at ${num(m.dosage)}%` : null, m.date ? `cast ${shortDate(m.date)}` : null, m.free_wc ? `W/C ${num(m.free_wc)}` : null].filter(Boolean).join(', ')
            const tappable = !m.restricted && m.source === 'trial' && Boolean(m.trial)
            const title = m.restricted ? 'Trial outside your projects' : m.project || m.label || 'Past trial'
            return (
              <Pressable key={m.id} disabled={!tappable} accessibilityRole={tappable ? 'link' : undefined}
                accessibilityLabel={`${title}. ${detail}. 28 day ${m.strength_28d ? num(m.strength_28d) : 'not tested'}${tappable || m.restricted ? '' : '. Imported history'}`}
                onPress={() => tappable && router.push(`/trial/${m.trial}`)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: color.divider }}>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: 15, color: tappable ? color.link : color.ink }}>{title}</Text>
                  <Small numberOfLines={1}>{[m.label, detail].filter(Boolean).join(', ')}{tappable || m.restricted ? '' : ', imported'}</Small>
                </View>
                <Text style={{ fontFamily: font.bold, fontSize: 15, color: color.ink }}>{num(m.strength_28d)}</Text>
              </Pressable>
            )
          })}
          {g.matches.length > PREVIEW ? (
            <Button title={all ? 'Show fewer' : `Show ${g.matches.length - PREVIEW} more ${g.matches.length - PREVIEW === 1 ? 'trial' : 'trials'}`} variant="tertiary" onPress={() => setAll(!all)} />
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

/** Choose one of the projects the user can see. */
function ProjectPickerSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (p: ProjectListItem) => void }) {
  const [text, setText] = useState('')
  const q = useDebounced(text.trim(), 300)
  const query = { search: q || undefined, ordering: '-updated_at' }
  const list = usePaged<ProjectListItem>(projectKeys.infinite(query), '/projects/', query, open)
  return (
    <Sheet open={open} onClose={onClose} title="Search for a project" tall>
      <TextField accessibilityLabel="Find a project" placeholder="Project, customer or SFDC number" value={text} onChangeText={setText} autoCorrect={false} />
      <Small>Picking a project fills the criteria from its requirement.</Small>
      {list.isLoading ? <Loading label="Finding projects" /> : null}
      {list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : null}
      {list.isSuccess && list.items.length === 0 ? <Banner>{q ? `No projects match "${q}".` : 'You have no projects yet.'}</Banner> : null}
      <View>
        {list.items.map((p) => (
          <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`${p.project_name}, ${projectPlace(p)}`} onPress={() => onPick(p)}
            style={({ pressed }) => ({ minHeight: 56, paddingVertical: 10, borderBottomWidth: 1, borderColor: color.divider, backgroundColor: pressed ? color.head : undefined, gap: 2 })}>
            <Strong>{p.project_name || 'Untitled project'}</Strong>
            <Small>{[projectPlace(p), p.sfdc_no && `SFDC ${p.sfdc_no}`].filter(Boolean).join(', ')}</Small>
          </Pressable>
        ))}
        {list.hasNextPage ? <Button title="Show more projects" variant="tertiary" busy={list.isFetchingNextPage} onPress={() => list.fetchNextPage()} /> : null}
      </View>
    </Sheet>
  )
}
