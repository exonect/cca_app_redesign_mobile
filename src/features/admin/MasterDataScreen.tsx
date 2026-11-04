import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'

import { api, fieldErrors } from '@/api/client'
import { useLookups } from '@/api/hooks'
import type { Lookup } from '@/shared/types'
import { Button, EmptyState, ErrorState, Field, H2, Loading, Picker, Small, Strong, TextField } from '@/ui/kit'
import { color, font, radius } from '@/ui/theme'

import { date, plural } from '@/features/projects/format'
import { useNotice, useRefresh } from '@/features/projects/hooks'
import { Notice, Sheet } from '@/features/projects/Sheet'

import { AdminHeader, Switch } from './AdminGate'

type Category = { category: string; label: string; active: number; inactive: number }
type Value = Lookup & { updated_at?: string }

/** Lists grouped as on the web; anything new on the server lands in "Other". Grading limits stay on the web. */
const GROUPS: { title: string; keys: string[] }[] = [
  { title: 'Location', keys: ['region', 'city'] },
  { title: 'Cement', keys: ['cement_brand', 'cement_grade'] },
  { title: 'Concrete', keys: ['grade_of_concrete', 'wc_ratio_ssd', 'wc_ratio_corrected', 'cementitious_content', 'requirement_type', 'retention_time', 'slump_flow', 'strength_age', 'compressive_strength'] },
  { title: 'Materials', keys: ['mineral_admixture', 'sand_type', 'sand_zone', 'fine_aggregate_source', 'coarse_aggregate_source'] },
  { title: 'Trial', keys: ['bleeding', 'setting'] },
  { title: 'Admixture', keys: ['admixture_brand', 'admixture_base', 'admixture_source', 'rm_code'] },
]
const NUMERIC = new Set(['wc_ratio_ssd', 'wc_ratio_corrected', 'cementitious_content', 'retention_time', 'slump_flow', 'compressive_strength'])

export function MasterDataScreen() {
  const cats = useQuery({ queryKey: ['lookups', 'categories'], queryFn: () => api<Category[]>('/lookups/categories/') })
  const [selected, setSelected] = useState<Category | null>(null)
  const [find, setFind] = useState('')
  const { refreshing, onRefresh } = useRefresh(() => cats.refetch())

  const sections = useMemo(() => {
    const all = cats.data ?? []
    const known = new Set(GROUPS.flatMap((g) => g.keys))
    const q = find.trim().toLowerCase()
    const match = (c: Category) => !q || c.label.toLowerCase().includes(q)
    const out = GROUPS.map((g) => ({ title: g.title, items: g.keys.map((k) => all.find((c) => c.category === k)).filter((c): c is Category => !!c && match(c)) }))
    const other = all.filter((c) => !known.has(c.category) && match(c))
    if (other.length) out.push({ title: 'Other', items: other })
    return out.filter((g) => g.items.length)
  }, [cats.data, find])

  if (selected) {
    const fresh = cats.data?.find((c) => c.category === selected.category) ?? selected
    return <ValuesScreen key={fresh.category} category={fresh} onBack={() => setSelected(null)} />
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.concrete }}>
      <AdminHeader title="Master data" sub="The values people pick from in projects, trials and recipes. Changes apply to new entries straight away.">
        <TextField accessibilityLabel="Find a list" placeholder="Find a list" value={find} onChangeText={setFind} autoCorrect={false} />
      </AdminHeader>
      <FlatList
        data={sections}
        keyExtractor={(s) => s.title}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
        refreshing={refreshing}
        onRefresh={onRefresh}
        renderItem={({ item: s }) => (
          <View style={{ gap: 6 }}>
            <H2>{s.title}</H2>
            <View style={{ backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, overflow: 'hidden' }}>
              {s.items.map((c, i) => (
                <Pressable key={c.category} accessibilityRole="button" accessibilityLabel={`${c.label}, ${plural(c.active, 'active value')}${c.inactive ? `, ${c.inactive} inactive` : ''}`}
                  onPress={() => setSelected(c)}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderColor: color.divider, backgroundColor: pressed ? color.head : undefined })}>
                  <Strong style={{ flex: 1 }}>{c.label}</Strong>
                  <Small>{c.active + c.inactive}</Small>
                  <Text style={{ color: color.muted, fontSize: 20 }}>›</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        ListEmptyComponent={
          cats.isLoading ? <Loading label="Loading lists" />
            : cats.isError ? <ErrorState error={cats.error} onRetry={() => cats.refetch()} />
              : <EmptyState title={find.trim() ? `No list matches "${find.trim()}"` : 'No lists'} />
        }
        ListFooterComponent={
          <View style={{ borderRadius: radius.card, backgroundColor: '#DCE7F2', padding: 14, gap: 4 }}>
            <Strong style={{ color: '#1F4568' }}>Values are deactivated, not deleted.</Strong>
            <Text style={{ fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: '#1F4568' }}>
              A deactivated value disappears from pick lists for new entries but stays on every project, trial and export that already uses it. Grading limits are edited on the web.
            </Text>
          </View>
        }
      />
    </View>
  )
}

function singular(noun: string) {
  return noun.replace(/ies$/, 'y').replace(/(?<!s)s$/, '')
}

function ValuesScreen({ category, onBack }: { category: Category; onBack: () => void }) {
  const qc = useQueryClient()
  const key = category.category
  const isCity = key === 'city'
  const numeric = NUMERIC.has(key)
  const values = useQuery({
    queryKey: ['lookups', key, 'admin'],
    queryFn: () => api<Value[]>('/lookups/', { query: { category: key, include_inactive: 'true' } }),
  })
  const regions = useLookups('region')
  const regionName = (id: number | null) => regions.data?.find((r) => r.id === id)?.value ?? ''
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [edit, setEdit] = useState<Value | null>(null)
  const [notice, setNotice, clearNotice] = useNotice()
  const { refreshing, onRefresh } = useRefresh(() => values.refetch())
  const refresh = () => qc.invalidateQueries({ queryKey: ['lookups'] })

  const toggle = useMutation({
    mutationFn: (v: Value) => api<Value>(`/lookups/${v.id}/`, { method: 'PATCH', body: { is_active: !v.is_active } }),
    onSuccess: (v) => { void refresh(); setNotice(v.is_active ? `${v.value} reactivated` : `${v.value} deactivated`) },
  })

  const rows = (values.data ?? []).filter((v) => !q.trim() || v.value.toLowerCase().includes(q.trim().toLowerCase()))
  const total = values.data?.length ?? category.active + category.inactive
  const active = values.data?.filter((v) => v.is_active).length ?? category.active
  const noun = singular(category.label.toLowerCase())

  return (
    <View style={{ flex: 1, backgroundColor: color.concrete }}>
      <AdminHeaderBack title={category.label} onBack={onBack}
        sub={`${plural(total, 'value')}, ${active} active.${numeric ? ' Numbers only.' : ''}${isCity ? ' Each city belongs to a region.' : ''}`}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <TextField accessibilityLabel={`Search ${category.label}`} placeholder="Search values" value={q} onChangeText={setQ} autoCorrect={false} />
          </View>
          {!adding ? <Button title="Add value" variant="primary" onPress={() => { setAdding(true); setEdit(null) }} style={{ flexGrow: 0 }} /> : null}
        </View>
      </AdminHeaderBack>
      <FlatList
        data={values.isSuccess ? rows : []}
        keyExtractor={(v) => String(v.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshing={refreshing}
        onRefresh={onRefresh}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 10, paddingBottom: 10 }}>
            <Notice text={notice} onDone={clearNotice} />
            {toggle.isError ? <ErrorState error={toggle.error} /> : null}
            {adding ? (
              <View style={{ backgroundColor: color.surface, borderWidth: 1, borderColor: color.ink, borderRadius: radius.card, padding: 14 }}>
                <ValueEditor label={`New ${noun}`} numeric={numeric} isCity={isCity} submitLabel="Add value"
                  onCancel={() => setAdding(false)}
                  onSave={(body) => api<Value>('/lookups/', { method: 'POST', body: { category: key, ...body } })}
                  onSaved={(v) => { void refresh(); setAdding(false); setNotice(`${v.value} added`) }} />
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item: v, index }) => (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingLeft: 14, paddingRight: 4,
            backgroundColor: v.is_active ? color.surface : '#FAFAFB', borderWidth: 1, borderTopWidth: index ? 0 : 1, borderColor: color.line,
            borderTopLeftRadius: index ? 0 : radius.card, borderTopRightRadius: index ? 0 : radius.card,
            borderBottomLeftRadius: index === rows.length - 1 ? radius.card : 0, borderBottomRightRadius: index === rows.length - 1 ? radius.card : 0,
          }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${v.value}`} onPress={() => { setEdit(v); setAdding(false) }} style={{ flex: 1, paddingVertical: 8, gap: 1 }}>
              <Text style={{ fontFamily: font.semibold, fontSize: 15, color: v.is_active ? color.ink : color.muted }}>{v.value}</Text>
              <Small>{[isCity ? regionName(v.parent) : null, v.updated_at ? `Changed ${date(v.updated_at)}` : null, v.is_active ? null : 'Inactive'].filter(Boolean).join(', ')}</Small>
            </Pressable>
            <Switch on={v.is_active} label={`${v.value} active`} disabled={toggle.isPending && toggle.variables?.id === v.id} onChange={() => toggle.mutate(v)} />
          </View>
        )}
        ListEmptyComponent={
          values.isLoading ? <Loading label="Loading values" />
            : values.isError ? <ErrorState error={values.error} onRetry={() => values.refetch()} />
              : adding ? undefined
                : <EmptyState title={q.trim() ? `No values match "${q.trim()}"` : 'No values yet'} body={q.trim() ? 'Check the spelling.' : `Add the first ${noun} so people can pick it.`} />
        }
      />
      <Sheet open={edit !== null} onClose={() => setEdit(null)} title={edit ? `Edit ${edit.value}` : 'Edit value'}>
        {edit ? (
          <ValueEditor key={edit.id} label="Value" numeric={numeric} isCity={isCity} initial={edit} submitLabel="Save"
            onCancel={() => setEdit(null)}
            onSave={(body) => api<Value>(`/lookups/${edit.id}/`, { method: 'PATCH', body })}
            onSaved={(saved) => { void refresh(); setEdit(null); setNotice(`${saved.value} saved`) }} />
        ) : null}
      </Sheet>
    </View>
  )
}

function AdminHeaderBack({ title, sub, onBack, children }: { title: string; sub?: string; onBack: () => void; children?: React.ReactNode }) {
  return (
    <AdminHeader title={title} sub={sub}
      right={<Button title="All lists" variant="tertiary" onPress={onBack} accessibilityLabel="Back to all lists" style={{ flexGrow: 0 }} />}>
      {children}
    </AdminHeader>
  )
}

function ValueEditor({ label, numeric, isCity, initial, submitLabel, onSave, onSaved, onCancel }: {
  label: string; numeric: boolean; isCity: boolean; initial?: Value; submitLabel: string
  onSave: (body: { value: string; parent?: number | null }) => Promise<Value>; onSaved: (v: Value) => void; onCancel: () => void
}) {
  const regions = useLookups('region')
  const [value, setValue] = useState(initial?.value ?? '')
  const [parent, setParent] = useState<number | null>(initial?.parent ?? null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = useMutation({
    mutationFn: () => onSave({ value, ...(isCity ? { parent } : {}) }),
    onSuccess: onSaved,
    onError: (e) => {
      const f = fieldErrors(e)
      setErrors(Object.keys(f).length ? f : { _: e instanceof Error ? e.message : 'The value was not saved. Try again.' })
    },
  })
  const submit = () => {
    setErrors({})
    if (!value.trim()) { setErrors({ value: 'Enter a value.' }); return }
    if (isCity && !parent) { setErrors({ parent: 'Choose the region this city belongs to.' }); return }
    save.mutate()
  }
  const other = errors._ ?? errors.non_field_errors
  return (
    <View style={{ gap: 12 }}>
      <Field label={label} error={errors.value ?? errors.category}>
        <TextField accessibilityLabel={label} autoFocus value={value} keyboardType={numeric ? 'decimal-pad' : 'default'}
          invalid={Boolean(errors.value ?? errors.category)} onChangeText={setValue} onSubmitEditing={submit} returnKeyType="done" />
      </Field>
      {isCity ? (
        <Field label="Region" error={errors.parent}>
          <Picker label="Region" value={parent} invalid={Boolean(errors.parent)} placeholder="Choose region"
            options={(regions.data ?? []).map((r) => ({ value: r.id, label: r.value }))} onChange={setParent} />
        </Field>
      ) : null}
      {other ? <Text accessibilityLiveRegion="polite" style={{ fontFamily: font.regular, fontSize: 13, color: color.error }}>{other}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Cancel" onPress={onCancel} />
        <Button title={submitLabel} variant="primary" busy={save.isPending} onPress={submit} />
      </View>
    </View>
  )
}
