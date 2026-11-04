import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, usePreventRemove } from 'expo-router'
import { useState, type ReactNode } from 'react'
import { Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { z } from 'zod'

import { api, ApiError, fieldErrors } from '@/api/client'
import { errorMessage } from '@/api/errors'
import { useLookups } from '@/api/hooks'
import { useAuth } from '@/auth/AuthProvider'
import { f2 } from '@/shared/calc'
import type { Recipe } from '@/shared/types'
import type { RecipeWithLock } from '@/shared/typesExt'
import { Banner, Body, Button, Card, Chips, ErrorState, Field, H1, Loading, NumberField, Picker, Small, Strong, TextField } from '@/ui/kit'
import { color, font, radius, TOUCH } from '@/ui/theme'

import { FlagBanner } from '@/features/flags/FlagBanner'
import { date } from '@/features/projects/format'
import { ConfirmSheet } from '@/features/projects/Sheet'
import { goBack } from '@/features/projects/TabHeader'

import { compositionOf, FAMILY_OPTIONS, preview, rowProblem, rowsOf, STATUS_OPTIONS, type Row } from './balance'
import { CompositionView, RecipeStatusChip } from './parts'

export function RecipeScreen({ id }: { id: string }) {
  const isNew = id === 'new'
  const { hasRole } = useAuth()
  // edit: change this recipe; version: a new version prefilled from it (a locked recipe cannot be changed).
  const [mode, setMode] = useState<'view' | 'edit' | 'version'>(isNew ? 'edit' : 'view')
  const q = useQuery({ queryKey: ['recipe', id], queryFn: () => api<RecipeWithLock>(`/recipes/${id}/`), enabled: !isNew })
  // Legacy rights: Admins, Sales Admins (from a trial) and CTs add recipes; only an Admin edits or changes status.
  const canCreate = hasRole('AD', 'SAD', 'CT')
  const canEdit = hasRole('AD')

  if (isNew && !canCreate) return <Shell title="Recipe"><Body>Only Admins, Sales Admins and CTs can add recipes.</Body></Shell>
  if (!isNew && !q.data) {
    return <Shell title="Recipe">{q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <Loading label="Loading recipe" />}</Shell>
  }
  if (mode === 'version' && q.data) return <RecipeForm recipe={null} template={q.data} onDone={() => setMode('view')} />
  if (mode === 'edit') return <RecipeForm recipe={q.data ?? null} onDone={() => setMode('view')} />
  return <RecipeDetail recipe={q.data!} canEdit={canEdit} onEdit={() => setMode('edit')} onNewVersion={() => setMode('version')} />
}

/** "Used in 4 trials, so it is locked." */
export const lockedNote = (n: number | undefined) => `Used in ${n === 1 ? '1 trial' : `${n ?? 'some'} trials`}, so it is locked.`

function BackLink({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Back to Recipe master" onPress={onPress ?? (() => goBack('/recipes'))} hitSlop={8}
      style={{ minHeight: TOUCH, justifyContent: 'center', alignSelf: 'flex-start' }}>
      <Text style={{ fontFamily: font.semibold, fontSize: 15, color: color.link }}>‹ Recipe master</Text>
    </Pressable>
  )
}

function Shell({ title, children, sub, right, footer, onBack }: { title: string; children: ReactNode; sub?: ReactNode; right?: ReactNode; footer?: ReactNode; onBack?: () => void }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={{ flex: 1, backgroundColor: color.concrete }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: color.surface, borderBottomWidth: 1, borderColor: color.line, paddingHorizontal: 16, paddingBottom: 14, gap: 6 }}>
        <BackLink onPress={onBack} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <H1 style={{ flex: 1 }}>{title}</H1>
          {right}
        </View>
        {sub}
      </SafeAreaView>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      {footer ? (
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12), backgroundColor: color.surface, borderTopWidth: 1, borderColor: color.line }}>
          {footer}
        </View>
      ) : null}
    </View>
  )
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ width: '50%', paddingRight: 12, gap: 1 }} accessible accessibilityLabel={`${k}: ${v || 'not set'}`}>
      <Small>{k}</Small>
      {v ? <Strong>{v}</Strong> : <Body style={{ color: color.muted }}>Not set</Body>}
    </View>
  )
}

export function RecipeDetail({ recipe: r, canEdit, onEdit, onNewVersion }: { recipe: RecipeWithLock; canEdit: boolean; onEdit: () => void; onNewVersion: () => void }) {
  const qc = useQueryClient()
  // On a locked recipe only the status (active or on hold) can still change.
  const status = useMutation({
    mutationFn: (next: Recipe['status']) => api<RecipeWithLock>(`/recipes/${r.id}/`, { method: 'PATCH', body: { status: next } }),
    onSuccess: (saved) => { qc.setQueryData(['recipe', String(saved.id)], saved); void qc.invalidateQueries({ queryKey: ['recipes'] }) },
  })
  const footer = !canEdit ? undefined : r.locked ? (
    <>
      <Button title={r.status === 'active' ? 'Put on hold' : 'Make active'} busy={status.isPending}
        onPress={() => status.mutate(r.status === 'active' ? 'on_hold' : 'active')} />
      <Button title="Create new version" variant="primary" onPress={onNewVersion} />
    </>
  ) : <Button title="Edit recipe" variant="primary" onPress={onEdit} />
  return (
    <Shell title={r.product_name ? `${r.product_name} V${r.version}` : r.label} right={<RecipeStatusChip status={r.status} />}
      sub={<Small style={{ fontSize: 14 }}>{[r.formulation_name || 'No formulation name yet', r.location_name].filter(Boolean).join(', ')}</Small>}
      footer={footer}>
      {!canEdit ? <Banner tone="info">Only an Admin can change recipes or their status.</Banner> : null}
      {r.locked ? <Banner tone="info">{`${lockedNote(r.trial_count)} Changes go into a new version; the trials keep this one.`}</Banner> : null}
      {status.isError ? <ErrorState error={status.error} /> : null}
      <FlagBanner flags={r.flags} refresh={[['recipe', String(r.id)], ['recipes']]} what="recipe" />
      <Card title="RM composition">
        <CompositionView components={r.components} total={r.total} />
      </Card>
      <Card title="Recipe details">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 }}>
          <Fact k="Product family" v={r.family_label} />
          <Fact k="SFDC number" v={r.sfdc_no} />
          <Fact k="Customer" v={r.customer_name} />
          <Fact k="Customer project" v={r.project_name} />
          <Fact k="Formulator" v={r.formulator_name ?? ''} />
          <Fact k="Recipe date" v={date(r.created_at)} />
        </View>
        <Small>Only active recipes appear in the product list on trials.</Small>
      </Card>
    </Shell>
  )
}

// --- Edit -----------------------------------------------------------------------

const SFDC_MESSAGE = 'Enter all 6 digits of the SFDC number, including leading zeros.'
/** Mirrors the server (legacy rules): family chosen (starts blank), product name optional up to 100
 * (spaces collapsed), SFDC 6 digits and required on a new recipe, customer and project up to 256. */
export const recipeSchemaFor = (isNew: boolean) => z.object({
  family: z.string().refine((f) => ['neutrol', 'tecnos', 'plastard', 'other'].includes(f), 'Choose the product family.'),
  product_name: z.string().transform((v) => v.split(/\s+/).filter(Boolean).join(' '))
    .pipe(z.string().max(100, 'Use 100 characters or fewer.')),
  sfdc_no: isNew
    ? z.string().trim().min(1, 'Enter the 6 digit SFDC number.').regex(/^\d{6}$/, SFDC_MESSAGE)
    : z.string().trim().regex(/^(\d{6})?$/, SFDC_MESSAGE),
  location: z.string().min(1, 'Choose the formulation location.'),
  customer_name: z.string().trim().max(256, 'Use 256 characters or fewer.'),
  project_name: z.string().trim().max(256, 'Use 256 characters or fewer.'),
  status: z.enum(['active', 'on_hold']),
})
export const recipeSchema = recipeSchemaFor(false)
type Form = z.input<typeof recipeSchema>
type FormKey = keyof Form
type Body = Omit<Form, 'location'> & { location: number; components: Record<string, string>; confirm_new_version?: boolean }
const BLANK: Form = { family: '', product_name: '', sfdc_no: '', location: '', customer_name: '', project_name: '', status: 'active' }

/** recipe: edit it. recipe null: a new recipe, or with template a new version
 * prefilled from that recipe (same product name and composition, saved
 * through POST with the new version confirmation). */
export function RecipeForm({ recipe, template, onDone }: { recipe: Recipe | null; template?: Recipe; onDone: () => void }) {
  const isNew = recipe === null
  const source = recipe ?? template ?? null
  // SFDC number and family are part of the formulation name: fixed once it exists (legacy edit form).
  const named = Boolean(recipe?.formulation_name)
  const { user, hasRole } = useAuth()
  const qc = useQueryClient()
  const cities = useLookups('city')
  const [initial] = useState<Form>(() => source ? {
    family: source.family === 'other' && !recipe ? '' : source.family, product_name: source.product_name, sfdc_no: source.sfdc_no, location: String(source.location),
    customer_name: source.customer_name, project_name: source.project_name, status: source.status,
  } : BLANK)
  const [v, setV] = useState<Form>(initial)
  const [errors, setErrors] = useState<Partial<Record<FormKey, string>>>({})
  const [initialRows] = useState<Row[]>(() => (source ? rowsOf(source.components) : []))
  const [rows, setRows] = useState<Row[]>(initialRows)
  const [compError, setCompError] = useState<string>()
  const [formError, setFormError] = useState<string>()
  const [tried, setTried] = useState(false)
  const [versionPrompt, setVersionPrompt] = useState<{ message: string; body: Body } | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Unsaved changes: leaving (back link, Cancel, hardware back, swipe) asks first.
  const [leaving, setLeaving] = useState(false)
  const dirty = !leaving && (JSON.stringify(v) !== JSON.stringify(initial) || JSON.stringify(rows) !== JSON.stringify(initialRows))
  const confirmLeave = (go: () => void) => Alert.alert('Leave without saving?', 'This recipe has changes that are not saved yet.', [
    { text: 'Stay', style: 'cancel' },
    { text: 'Leave without saving', style: 'destructive', onPress: go },
  ])
  const allowLeave = usePreventRemove(dirty, ({ repeat }) => confirmLeave(repeat))
  const cancel = () => (dirty ? confirmLeave(() => { setLeaving(true); onDone() }) : onDone())

  const set = <K extends FormKey>(k: K, x: Form[K]) => { setV((s) => ({ ...s, [k]: x })); setErrors((e) => ({ ...e, [k]: undefined })) }

  const save = useMutation({
    mutationFn: (body: Body) => isNew
      ? api<Recipe>('/recipes/', { method: 'POST', body })
      : api<Recipe>(`/recipes/${recipe.id}/`, { method: 'PATCH', body }),
    onSuccess: (saved) => {
      setVersionPrompt(null)
      void qc.invalidateQueries({ queryKey: ['recipes'] })
      qc.setQueryData(['recipe', String(saved.id)], saved)
      setLeaving(true)
      // A changed set of raw materials saves a new formulation: open it (the edited recipe is unchanged).
      if (isNew || saved.id !== recipe.id) { allowLeave(); router.replace(`/recipes/${saved.id}`) } else onDone()
    },
    onError: (e, body) => {
      if (e instanceof ApiError && e.status === 409 && e.code === 'locked' && recipe) {
        // Used by a trial since this form opened: say so plainly; the detail shows Create new version.
        setVersionPrompt(null)
        setFormError(e.message)
        void qc.invalidateQueries({ queryKey: ['recipe', String(recipe.id)] })
        return
      }
      if (e instanceof ApiError && e.status === 409 && e.code === 'new_version') {
        setVersionPrompt({ message: e.message, body })
        return
      }
      setVersionPrompt(null)
      const { components, ...rest } = fieldErrors(e)
      setCompError(components)
      const mapped = Object.fromEntries(Object.entries(rest).filter(([k]) => k in BLANK)) as Partial<Record<FormKey, string>>
      setErrors(mapped)
      const unmapped = Object.entries(rest).filter(([k]) => !(k in BLANK)).map(([, m]) => m)
      setFormError(unmapped[0] ?? (components || Object.keys(mapped).length ? undefined : errorMessage(e, 'The recipe could not be saved. Try again.')))
    },
  })
  const remove = useMutation({
    mutationFn: () => api(`/recipes/${recipe!.id}/`, { method: 'DELETE' }),
    onSuccess: () => { setLeaving(true); allowLeave(); void qc.invalidateQueries({ queryKey: ['recipes'] }); qc.removeQueries({ queryKey: ['recipe', String(recipe!.id)] }); router.replace('/recipes') },
  })

  const p = preview(rows)
  const rowsBlank = rows.some((r) => r.pct.trim() === '')

  const submit = () => {
    setTried(true)
    setFormError(undefined)
    setCompError(undefined)
    const r = recipeSchemaFor(isNew).safeParse(v)
    const e: Partial<Record<FormKey, string>> = {}
    if (!r.success) for (const i of r.error.issues) { const k = String(i.path[0]) as FormKey; e[k] ??= i.message }
    setErrors(e)
    let comp: string | undefined
    if (rows.length === 0) comp = 'Add at least one raw material.'
    else if (rowsBlank || !p.exact) comp = p.errors[0] ?? 'Fix the highlighted quantities so the total is exactly 100.00%.'
    setCompError(comp)
    if (!r.success || comp) return
    // A new version was asked for explicitly, so it is confirmed up front.
    const fixed = named ? { sfdc_no: recipe!.sfdc_no, family: recipe!.family } : {}
    save.mutate({ ...r.data, ...fixed, location: Number(r.data.location), components: compositionOf(rows), ...(template ? { confirm_new_version: true } : {}) })
  }

  const errorCount = Object.values(errors).filter(Boolean).length + (compError ? 1 : 0)
  const cityOptions = (cities.data ?? []).map((c) => ({ value: String(c.id), label: c.value }))
  if (source && !cityOptions.some((c) => c.value === String(source.location))) cityOptions.push({ value: String(source.location), label: source.location_name })

  return (
    <Shell title={template ? `New version of ${template.product_name}` : isNew ? 'New recipe' : `Edit ${recipe.label}`} onBack={isNew && !template ? undefined : cancel}
      sub={template ? <Small style={{ fontSize: 14 }}>{`Starts from V${template.version}. Change the composition; V${template.version} stays as it is for its trials.`}</Small>
        : !isNew && recipe.formulation_name ? <Small style={{ fontSize: 14 }}>Formulation {recipe.formulation_name}</Small> : undefined}
      footer={<>
        {isNew && !template ? null : <Button title="Cancel" onPress={cancel} />}
        <Button title="Save recipe" variant="primary" busy={save.isPending} onPress={submit} />
      </>}>
      {tried && errorCount > 0 ? (
        <View accessibilityLiveRegion="polite"><Banner tone="error">{errorCount === 1 ? '1 field needs' : `${errorCount} fields need`} attention.</Banner></View>
      ) : null}
      {formError ? <Banner tone="error">{formError}</Banner> : null}

      <Card title="Recipe details" style={{ gap: 14 }}>
        {named ? (
          <Field label="Product family" hint="Part of the formulation name">
            <TextField accessibilityLabel="Product family, fixed" editable={false} value={recipe!.family_label} />
          </Field>
        ) : (
          <Field label="Product family" required error={errors.family}>
            <Chips label="Product family" single options={FAMILY_OPTIONS} value={[v.family]} onChange={(x) => x[0] && set('family', x[0])} />
          </Field>
        )}
        <Field label="Product name" error={errors.product_name} hint="For example Neutrol 585. Optional: without one the recipe is listed by its formulation name.">
          <TextField accessibilityLabel="Product name" invalid={Boolean(errors.product_name)} maxLength={100} value={v.product_name} onChangeText={(t) => set('product_name', t)} />
        </Field>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Field label="Version">
              <TextField accessibilityLabel="Version, set automatically" editable={false} value={recipe ? (recipe.product_name ? `V${recipe.version}` : 'None') : template ? 'Next version' : 'New'} />
            </Field>
          </View>
          <View style={{ flex: 1.4 }}>
            <Field label="SFDC number" required={isNew} error={errors.sfdc_no} hint={named ? 'Part of the formulation name' : '6 digits'}>
              <TextField accessibilityLabel="SFDC number" keyboardType="number-pad" maxLength={6} invalid={Boolean(errors.sfdc_no)} editable={!named}
                value={v.sfdc_no} onChangeText={(t) => set('sfdc_no', t)} />
            </Field>
          </View>
        </View>
        <Field label="Formulation location" required error={errors.location}>
          <Picker label="Formulation location" value={v.location || null} options={cityOptions} invalid={Boolean(errors.location)}
            placeholder={cities.isLoading ? 'Loading cities…' : 'Choose city'} onChange={(x) => set('location', x ?? '')} />
        </Field>
        <Field label="Status" hint="Only active recipes appear on trials.">
          <Chips label="Status" single options={STATUS_OPTIONS} value={[v.status]} onChange={(x) => x[0] && set('status', x[0])} />
        </Field>
        <Field label="Customer" error={errors.customer_name}>
          <TextField accessibilityLabel="Customer" maxLength={256} invalid={Boolean(errors.customer_name)} value={v.customer_name} onChangeText={(t) => set('customer_name', t)} />
        </Field>
        <Field label="Customer project" error={errors.project_name}>
          <TextField accessibilityLabel="Customer project" maxLength={256} invalid={Boolean(errors.project_name)} value={v.project_name} onChangeText={(t) => set('project_name', t)} />
        </Field>
        <Small>
          Formulator {recipe ? recipe.formulator_name ?? 'not recorded' : [user?.full_name, user?.emp_id].filter(Boolean).join(', ')}.
          {isNew ? ' The formulation name is generated on save from the family, SFDC number, your employee ID and the month.' : ` Recipe date ${date(recipe.created_at)}.`}
        </Small>
      </Card>

      <CompositionEditor rows={rows} onChange={(r) => { setRows(r); setCompError(undefined) }} error={compError} showRowErrors={tried} />

      {recipe && hasRole('AD') ? <Button title="Delete recipe" variant="danger" onPress={() => { remove.reset(); setDeleting(true) }} /> : null}

      <ConfirmSheet open={Boolean(versionPrompt)} title="Save as a new version?" onClose={() => setVersionPrompt(null)}
        body={<View style={{ gap: 8 }}><Body>{versionPrompt?.message}</Body><Body style={{ color: color.muted }}>The earlier versions stay unchanged and keep their trials.</Body></View>}
        confirmLabel="Save new version" cancelLabel="Go back" busy={save.isPending}
        onConfirm={() => versionPrompt && save.mutate({ ...versionPrompt.body, confirm_new_version: true })} />
      {recipe ? (
        <ConfirmSheet open={deleting} danger title={`Delete ${recipe.label}?`} onClose={() => setDeleting(false)}
          body="The recipe and its composition will be removed. This cannot be undone. A recipe used in trials cannot be deleted; put it on hold instead."
          confirmLabel="Delete recipe" cancelLabel="Keep recipe" busy={remove.isPending} error={remove.error} onConfirm={() => remove.mutate()} />
      ) : null}
    </Shell>
  )
}

export function CompositionEditor({ rows, onChange, error, showRowErrors }: { rows: Row[]; onChange: (r: Row[]) => void; error?: string; showRowErrors: boolean }) {
  const codes = useLookups('rm_code')
  const used = new Set(rows.map((r) => r.code.toUpperCase()))
  const available = (codes.data ?? []).filter((c) => c.value.toUpperCase() !== 'J000' && !used.has(c.value.toUpperCase()))
  const p = preview(rows)
  const over = p.errors.find((e) => e.includes('over 100%'))
  const totalTone = p.exact ? { bg: color.met.bg, fg: color.met.fg } : over ? { bg: '#FBECEB', fg: color.error } : { bg: color.head, fg: color.ink }

  return (
    <Card title="Raw material composition" right={<Small>{rows.length} of {codes.data?.length ?? '…'} codes</Small>}>
      {error ? <View accessibilityLiveRegion="polite"><Banner tone="error">{error}</Banner></View> : null}
      {rows.map((r, i) => {
        const missing = showRowErrors && r.pct.trim() === ''
        const problem = rowProblem(r)
        const bad = (r.pct.trim() !== '' && (!Number.isFinite(Number(r.pct)) || Number(r.pct) < 0)) || !!problem
        return (
          <View key={r.code} style={{ gap: 4, borderBottomWidth: 1, borderColor: color.divider, paddingBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Strong style={{ flex: 1 }}>{r.code}</Strong>
              <View style={{ width: 130 }}>
                <NumberField accessibilityLabel={`Quantity of ${r.code}, percent`} unit="%" invalid={missing || bad} value={r.pct}
                  onChangeText={(t) => onChange(rows.map((x, j) => (j === i ? { ...x, pct: t } : x)))} />
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${r.code}`} onPress={() => onChange(rows.filter((_, j) => j !== i))}
                style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center', borderRadius: radius.field }}>
                <Text style={{ fontSize: 22, color: color.muted }}>×</Text>
              </Pressable>
            </View>
            {missing || bad ? (
              <Text accessibilityLiveRegion="polite" style={{ fontFamily: font.regular, fontSize: 13, color: color.error }}>
                {problem ?? (bad ? `Enter a number of 0 or more for ${r.code}.` : `Enter a percentage, or remove ${r.code}.`)}
              </Text>
            ) : null}
          </View>
        )
      })}
      <Field label="Raw material to add" hint={codes.isError ? 'RM codes could not be loaded.' : undefined}>
        <Picker label="Raw material to add" value={null} disabled={codes.isLoading || available.length === 0}
          placeholder={codes.isLoading ? 'Loading codes…' : available.length ? 'Choose RM code' : 'All codes added'}
          options={available.map((c) => ({ value: c.value.toUpperCase(), label: c.value }))}
          onChange={(x) => { if (x) onChange([...rows, { code: x, pct: '' }]) }} />
      </Field>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 10, borderRadius: radius.field, backgroundColor: color.head }}>
        <Strong style={{ flex: 1 }}>J000 <Text style={{ fontFamily: font.regular, color: color.muted }}>balance, computed</Text></Strong>
        <Strong>{f2(p.balance)}</Strong>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, borderTopWidth: 2, borderColor: color.ink, paddingTop: 6 }}>
        <Text style={{ flex: 1, fontFamily: font.condBold, fontSize: 18, color: color.ink }}>Total</Text>
        <View accessibilityLiveRegion="polite" accessibilityLabel={`Total ${f2(p.total)} percent`} testID="recipe-total"
          style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, justifyContent: 'center', backgroundColor: totalTone.bg }}>
          <Text style={{ fontFamily: font.bold, fontSize: 15, color: totalTone.fg }}>{f2(p.total)}</Text>
        </View>
      </View>
      {over ? <Text accessibilityLiveRegion="assertive" style={{ fontFamily: font.semibold, fontSize: 13, color: color.error }}>{over}</Text> : null}
      <Small>J000 takes whatever is left to reach 100.00%. A composition identical to an existing recipe is rejected on save, with the name of the recipe it matches.</Small>
    </Card>
  )
}
