import { useMutation, useQueryClient } from '@tanstack/react-query'
import { router, usePreventRemove } from 'expo-router'
import { useRef, useState, type ReactNode } from 'react'
import { Alert, Pressable, ScrollView, Text, View, type ScrollViewInstance } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { api, fieldErrors } from '@/api/client'
import { errorMessage, statusOf } from '@/api/errors'
import { useLookups } from '@/api/hooks'
import { useAuth } from '@/auth/AuthProvider'
import type { Project, Ref } from '@/shared/types'
import { Banner, Body, Button, Card, Chips, ErrorState, Field, H1, Loading, NumberField, Picker, Small, Strong, TextField } from '@/ui/kit'
import { color, font, radius, TOUCH } from '@/ui/theme'

import { invalidateProject, storeProject, useProject, useSalesPersons } from './api'
import { num } from './format'
import {
  CATEGORY, cementitiousProblem, EMPTY, fromProject, isFormField, LABELS, missingStep1, PRICE_MESSAGE, priceMissing, REMARKS_MAX,
  requiredAfterDraft, stepForErrors, STEP1_FIELDS, toPayload, validate, withCurrent, withPendingCementitious, type FkField,
  type FormErrors, type FormField, type M2mField, type ProjectFormValues,
} from './formModel'
import { goBack } from './TabHeader'

type Step = 1 | 2

export function ProjectFormScreen({ id }: { id?: string }) {
  const { hasRole } = useAuth()
  const existing = useProject(id)
  const back = () => goBack(id ? '/projects' : '/projects')

  if (!id && hasRole('CT')) {
    return <Blocked title="CTs do not create projects" body="Ask the Sales Person or a Sales Admin to create it." onBack={back} />
  }
  if (id && existing.isLoading) return <Shell onBack={back}><Loading label="Loading the project" /></Shell>
  if (id && existing.isError) return <Shell onBack={back}><ErrorState error={existing.error} onRetry={() => existing.refetch()} /></Shell>
  if (existing.data && !existing.data.actions.edit) {
    return <Blocked title="You cannot edit this project" onBack={back}
      body={existing.data.status === 'completed' ? 'Completed projects are read only. An Admin can reopen it if it needs changes.'
        : 'Only its Sales Person, an Admin or a Sales Admin can edit it.'} />
  }
  return <ProjectForm key={id ?? 'new'} project={existing.data ?? null} />
}

function Shell({ children, onBack }: { children: ReactNode; onBack: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: color.concrete }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: color.surface, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: color.line }}>
        <BackLink label="Projects" onPress={onBack} />
      </SafeAreaView>
      <View style={{ padding: 16 }}>{children}</View>
    </View>
  )
}

function Blocked({ title, body, onBack }: { title: string; body: string; onBack: () => void }) {
  return <Shell onBack={onBack}><View style={{ gap: 8 }}><H1>{title}</H1><Body style={{ color: color.muted }}>{body}</Body></View></Shell>
}

function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Back to ${label}`} onPress={onPress} hitSlop={8} style={{ minHeight: TOUCH, justifyContent: 'center', alignSelf: 'flex-start' }}>
      <Text style={{ fontFamily: font.semibold, fontSize: 15, color: color.link }}>‹ {label}</Text>
    </Pressable>
  )
}

export function ProjectForm({ project }: { project: Project | null }) {
  const { user, hasRole } = useAuth()
  const picksSalesPerson = hasRole('AD', 'SAD')
  const qc = useQueryClient()
  const insets = useSafeAreaInsets()
  const scroll = useRef<ScrollViewInstance>(null)
  const [step, setStep] = useState<Step>(1)
  const [savedId, setSavedId] = useState<string | null>(project?.id ?? null)
  const [values, setValues] = useState<ProjectFormValues>(project ? fromProject(project) : { ...EMPTY })
  const [saved, setSaved] = useState<ProjectFormValues>(values)
  // Cementitious value typed but not yet added with Add: kept here so it survives
  // switching steps, counts as unsaved, and is added (or flagged) on save.
  const [cemText, setCemText] = useState('')
  const dirty = JSON.stringify(values) !== JSON.stringify(saved) || cemText.trim() !== ''
  const [errors, setErrors] = useState<FormErrors>({})
  const [banner, setBanner] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const isDraft = !project || project.status === 'draft'

  const top = () => scroll.current?.scrollTo({ y: 0, animated: true })
  const goTo = (s: Step) => { setStep(s); requestAnimationFrame(top) }

  const set = <K extends FormField>(k: K, v: ProjectFormValues[K]) => {
    setValues((x) => ({ ...x, [k]: v }))
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e))
    setNotice(null)
  }

  const showServerErrors = (e: unknown) => {
    const fields = fieldErrors(e)
    const known = Object.keys(fields).filter(isFormField)
    setErrors(Object.fromEntries(known.map((f) => [f, fields[f]])))
    // Errors on fields this form has no input for still need saying.
    const other = Object.entries(fields).filter(([k]) => !isFormField(k)).map(([, v]) => v)
    setBanner(other[0] ?? (known.length ? null : errorMessage(e, 'Saving failed. Try again.')))
    // The project changed under us (completed, deleted, no longer ours): reload it.
    const status = statusOf(e)
    if (savedId && (status === 409 || status === 404 || status === 403)) invalidateProject(qc, savedId)
    const s = stepForErrors(known)
    if (s) goTo(s)
    else top()
  }

  // Leaving with unsaved entries (back link, hardware back, swipe) asks first.
  const allowLeave = usePreventRemove(dirty, ({ repeat }) => {
    Alert.alert('Leave without saving?', 'This project has changes that are not saved yet.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave without saving', style: 'destructive', onPress: repeat },
    ])
  })
  const leaveTo = (id: string) => { allowLeave(); router.replace(`/project/${id}`) }

  const save = async (v: ProjectFormValues): Promise<Project> => {
    const body = toPayload(v, picksSalesPerson)
    const p = savedId
      ? await api<Project>(`/projects/${savedId}/`, { method: 'PATCH', body })
      : await api<Project>('/projects/', { method: 'POST', body })
    setSavedId(p.id)
    storeProject(qc, p)
    return p
  }

  const saveDraft = useMutation({
    mutationFn: (v: ProjectFormValues) => save(v),
    onSuccess: (p) => { setNotice('Draft saved'); const v = fromProject(p); setValues(v); setSaved(v) },
    onError: showServerErrors,
  })
  const create = useMutation({
    mutationFn: async (v: ProjectFormValues) => {
      const p = await save(v)
      // Saved as a draft even if submitting fails, so nothing typed is lost.
      setSaved(v)
      return api<Project>(`/projects/${p.id}/submit/`, { method: 'POST' })
    },
    onSuccess: (p) => { storeProject(qc, p); leaveTo(p.id) },
    onError: showServerErrors,
  })
  const saveChanges = useMutation({
    mutationFn: (v: ProjectFormValues) => save(v),
    onSuccess: (p) => leaveTo(p.id),
    onError: showServerErrors,
  })
  const busy = saveDraft.isPending || create.isPending || saveChanges.isPending

  const fail = (e: FormErrors) => {
    setErrors(e)
    const s = stepForErrors(Object.keys(e).filter((k) => e[k as FormField]))
    if (s && s !== step) goTo(s)
    else top()
  }

  /** The values to save, with a typed but not added cementitious value added; null (and the error shown) when it is not valid. */
  const takePending = (): ProjectFormValues | null => {
    const r = withPendingCementitious(values, cemText)
    if (r.error) { fail({ ...validate(values), cementitious_contents: r.error }); return null }
    if (r.values !== values) { setValues(r.values); setCemText('') }
    return r.values
  }

  const onSaveDraft = () => {
    setBanner(null)
    const v = takePending()
    if (!v) return
    const e = validate(v)
    if (Object.keys(e).length) fail(e)
    else saveDraft.mutate(v)
  }
  const onContinue = () => {
    setBanner(null)
    const e = validate(values, STEP1_FIELDS)
    for (const f of missingStep1(values, picksSalesPerson)) e[f] ??= `${LABELS[f]} is required.`
    if (Object.keys(e).length) { setErrors(e); top() }
    else goTo(2)
  }
  const onCreate = () => {
    setBanner(null)
    const v = takePending()
    if (!v) return
    const e = validate(v)
    if (priceMissing(v)) e.selling_basic_price ??= PRICE_MESSAGE
    if (Object.keys(e).length) fail(e)
    else create.mutate(v)
  }
  const onSaveChanges = () => {
    setBanner(null)
    const v = takePending()
    if (!v) return
    // Like the server: formats always; past draft, what submit required must stay filled in.
    const e = { ...(isDraft ? {} : requiredAfterDraft(v, picksSalesPerson)), ...validate(v) }
    if (Object.keys(e).length) fail(e)
    else saveChanges.mutate(v)
  }

  const all = (Object.keys(errors) as FormField[]).filter((f) => errors[f])
  const here = all.filter((f) => (step === 1 ? STEP1_FIELDS.includes(f) : !STEP1_FIELDS.includes(f)))
  const elsewhere = all.length - here.length
  const title = project ? (isDraft ? 'Finish draft project' : `Edit ${project.project_name || 'project'}`) : 'New project'
  const creator = [user?.full_name, user?.role_label, user?.region_name].filter(Boolean).join(', ')

  return (
    <View style={{ flex: 1, backgroundColor: color.concrete }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: color.surface, borderBottomWidth: 1, borderColor: color.line, paddingHorizontal: 16, paddingBottom: 14, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <BackLink label={project ? (project.project_name || 'Project') : 'Projects'} onPress={() => goBack('/projects')} />
          <Small>Step {step} of 2</Small>
        </View>
        <H1>{title}</H1>
        {!project && creator ? <Small>Created by {creator}</Small> : null}
        <View accessible accessibilityLabel={`Step ${step} of 2, ${step === 1 ? 'customer details' : 'technical requirements'}`} style={{ gap: 6, paddingTop: 4 }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {[1, 2].map((n) => <View key={n} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: n <= step ? color.link : color.line }} />)}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Strong style={{ fontSize: 14 }}>{step === 1 ? 'Customer details' : 'Technical requirements'}</Strong>
            <Small>{step === 1 ? 'Next: technical details' : 'Customer details complete'}</Small>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {notice ? <View accessibilityLiveRegion="polite"><Banner tone="ok">{notice}</Banner></View> : null}
        {here.length > 0 || elsewhere > 0 ? (
          <View accessibilityRole="alert" accessibilityLiveRegion="assertive"
            style={{ borderWidth: 2, borderColor: color.error, borderRadius: radius.card, backgroundColor: color.surface, padding: 12, gap: 6 }}>
            <Strong>{here.length === 1 ? '1 field needs' : `${here.length} fields need`} attention{step === 1 ? ' before you continue' : ''}.</Strong>
            {here.length ? <Body style={{ color: color.subtle }}>{here.map((f) => LABELS[f]).join(', ')}</Body> : null}
            {elsewhere > 0 ? (
              <>
                <Body>{step === 2 ? 'Customer details' : 'Technical requirements'} also {elsewhere === 1 ? 'has 1 field' : `has ${elsewhere} fields`} to fix.</Body>
                <Button title={`Go to ${step === 2 ? 'customer details' : 'technical requirements'}`} onPress={() => goTo(step === 1 ? 2 : 1)} style={{ flexGrow: 0, alignSelf: 'flex-start' }} />
              </>
            ) : null}
          </View>
        ) : null}
        {banner ? <Banner tone="error">{banner}</Banner> : null}

        {step === 1
          ? <CustomerStep v={values} e={errors} set={set} project={project} picksSalesPerson={picksSalesPerson} ownName={project?.sales_person?.name ?? user?.full_name ?? ''} />
          : <TechnicalStep v={values} e={errors} set={set} project={project} cemText={cemText} setCemText={setCemText} />}

        {step === 1 && isDraft ? (
          <Small>Save draft keeps what you have entered, even with fields missing. The project becomes Created, and Sales Admins are notified, only when step 2 is complete and every field passes.</Small>
        ) : null}
        {step === 2 ? <Small>All fields are required except admixture base. Enter at least one of the two prices.</Small> : null}
        {step === 2 ? <Button title="Back to customer details" variant="tertiary" onPress={() => goTo(1)} style={{ alignSelf: 'flex-start', flexGrow: 0 }} /> : null}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12), backgroundColor: color.surface, borderTopWidth: 1, borderColor: color.line }}>
        {isDraft ? <Button title="Save draft" onPress={onSaveDraft} busy={saveDraft.isPending} disabled={busy} /> : null}
        {!isDraft && step === 1 ? <Button title="Save changes" onPress={onSaveChanges} busy={saveChanges.isPending} disabled={busy} /> : null}
        {step === 1 ? <Button title="Continue" variant="primary" onPress={onContinue} disabled={busy} /> : null}
        {step === 2 && isDraft ? <Button title="Create project" variant="primary" onPress={onCreate} busy={create.isPending} disabled={busy} /> : null}
        {step === 2 && !isDraft ? <Button title="Save changes" variant="primary" onPress={onSaveChanges} busy={saveChanges.isPending} disabled={busy} /> : null}
      </View>
    </View>
  )
}

// --- Steps ---------------------------------------------------------------------

type StepProps = {
  v: ProjectFormValues; e: FormErrors; project: Project | null
  set: <K extends FormField>(k: K, v: ProjectFormValues[K]) => void
}

function Text_({ f, label, v, e, set, hint, ...input }: StepProps & { f: FormField; label: string; hint?: string } & Parameters<typeof TextField>[0]) {
  return (
    <Field label={label} error={e[f]} hint={hint}>
      <TextField accessibilityLabel={label} invalid={Boolean(e[f])} value={String(v[f])} onChangeText={(t) => set(f, t as never)} {...input} />
    </Field>
  )
}

function LookupPicker({ name, label, v, e, set, project, parent, format = (s) => s, hint, placeholder, onChange }: StepProps & {
  name: FkField; label: string; parent?: number | null; format?: (s: string) => string; hint?: string; placeholder?: string; onChange?: () => void
}) {
  const q = useLookups(CATEGORY[name], parent === undefined ? {} : { parent })
  const options = withCurrent(q.data, project?.[name] as Ref | null).map((o) => ({ value: o.id, label: format(o.value) }))
  return (
    <Field label={label} error={e[name]} hint={q.isError ? 'This list could not be loaded. Pull down on the project to try again.' : hint}>
      <Picker label={label} value={v[name] ? Number(v[name]) : null} options={options} invalid={Boolean(e[name])}
        disabled={parent === null} placeholder={placeholder ?? (q.isLoading ? 'Loading…' : 'Choose')}
        onChange={(x) => { set(name, x === null ? '' : String(x)); onChange?.() }} />
    </Field>
  )
}

function LookupChips({ name, label, hint, v, e, set, project, format = (s) => s }: StepProps & { name: M2mField; label: string; hint?: string; format?: (s: string) => string }) {
  const q = useLookups(CATEGORY[name])
  const options = withCurrent(q.data, project?.[name] as Ref[]).map((o) => ({ value: o.id, label: format(o.value) }))
  return (
    <Field label={label} error={e[name]} hint={q.isError ? 'This list could not be loaded. Go back and open the form again.' : hint}>
      {q.isLoading ? <Small>Loading…</Small> : <Chips label={label} options={options} value={v[name]} onChange={(x) => set(name, x)} />}
    </Field>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <Card title={title} style={{ gap: 14 }}>{children}</Card>
}

function CustomerStep(p: StepProps & { picksSalesPerson: boolean; ownName: string }) {
  const { v, e, set, project, picksSalesPerson, ownName } = p
  const sales = useSalesPersons(picksSalesPerson)
  const regions = useLookups('region')
  const regionName = regions.data?.find((r) => String(r.id) === v.region)?.value ?? project?.region?.value
  const salesOptions = (sales.data ?? []).map((u) => ({ value: u.id, label: u.full_name }))
  if (project?.sales_person && !salesOptions.some((o) => o.value === project.sales_person!.id)) {
    salesOptions.push({ value: project.sales_person.id, label: project.sales_person.name })
  }
  return (
    <>
      <Section title="Customer and project">
        <Text_ {...p} f="customer_name" label="Customer name" autoComplete="organization-title" maxLength={256} />
        <Text_ {...p} f="project_name" label="Project name" maxLength={256} />
      </Section>
      <Section title="Contact person at the customer">
        <Text_ {...p} f="contact_person_name" label="Name" autoComplete="off" maxLength={256} />
        <Text_ {...p} f="contact_phone" label="Mobile number" hint="10 digits, without +91" keyboardType="number-pad" maxLength={10} autoComplete="off" />
        <Text_ {...p} f="contact_email" label="Email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="off" maxLength={254} />
      </Section>
      <Section title="Opportunity">
        {picksSalesPerson ? (
          <Field label="Sales Person" error={e.sales_person} hint={sales.isError ? 'The Sales Person list could not be loaded.' : 'Owns the project and is notified about it'}>
            <Picker label="Sales Person" value={v.sales_person ? Number(v.sales_person) : null} options={salesOptions} invalid={Boolean(e.sales_person)}
              placeholder={sales.isLoading ? 'Loading…' : 'Choose a Sales Person'} onChange={(x) => set('sales_person', x === null ? '' : String(x))} />
          </Field>
        ) : (
          <Field label="Sales Person" hint={project ? undefined : 'Filled from your sign in'}>
            <TextField accessibilityLabel="Sales Person" value={ownName} editable={false} />
          </Field>
        )}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text_ {...p} f="sfdc_no" label="SFDC number" hint="6 digits" keyboardType="number-pad" maxLength={6} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Potential" error={e.potential_cr}>
              <NumberField accessibilityLabel="Project potential, rupees crore" unit="Cr" invalid={Boolean(e.potential_cr)} value={v.potential_cr}
                onChangeText={(t) => set('potential_cr', t)} />
            </Field>
          </View>
        </View>
        <LookupPicker {...p} name="region" label="Region" onChange={() => set('city', '')} />
        <LookupPicker {...p} name="city" label="City" parent={v.region ? Number(v.region) : null}
          placeholder={v.region ? 'Choose' : 'Choose a region first'}
          hint={regionName ? `Cities in ${regionName}. Changing region clears this.` : undefined} />
        <Text_ {...p} f="remarks" label="Remarks" hint={`Anything the CT should know before the first trial. Up to ${REMARKS_MAX} characters.`} maxLength={REMARKS_MAX} multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />
      </Section>
    </>
  )
}

function TechnicalStep({ cemText, setCemText, ...p }: StepProps & { cemText: string; setCemText: (t: string) => void }) {
  const { v, e, set, project } = p
  const slumps = useLookups('slump_flow')
  const retention = useLookups('retention_time')
  const type = v.requirement_type
  const target = withCurrent(slumps.data, project?.slump_flow).find((o) => String(o.id) === v.slump_flow)?.value
  const hours = withCurrent(retention.data, project?.retention_time).find((o) => String(o.id) === v.retention_time)?.value
  return (
    <>
      <Section title="Cement and binders">
        <LookupChips {...p} name="cement_brands" label="Cement brands" hint="Select all the plant uses" />
        <LookupChips {...p} name="cement_grades" label="Cement grades" />
        <LookupChips {...p} name="mineral_admixtures" label="Mineral admixtures" />
      </Section>
      <Section title="Mix">
        <LookupChips {...p} name="grades_of_concrete" label="Grade of concrete" />
        <LookupChips {...p} name="wc_ratios_ssd" label="W/C ratio, SSD" />
        <LookupPicker {...p} name="wc_ratio_corrected" label="W/C ratio, corrected" />
        <CementitiousInput value={v.cementitious_contents} onChange={(x) => set('cementitious_contents', x)} error={e.cementitious_contents}
          text={cemText} onText={setCemText} />
      </Section>
      <Section title="Workability and strength">
        <Field label="Requirement type" error={e.requirement_type}>
          <Chips label="Requirement type" single value={type ? [type] : []}
            options={[{ value: 'slump' as const, label: 'Slump' }, { value: 'flow' as const, label: 'Flow' }]}
            onChange={(x) => set('requirement_type', x[0] ?? '')} />
        </Field>
        <LookupPicker {...p} name="slump_flow" label={type === 'flow' ? 'Target flow' : type === 'slump' ? 'Target slump' : 'Target slump or flow'} format={(s) => `${s} mm`} />
        <LookupPicker {...p} name="retention_time" label="Retention time" format={(s) => `${num(s, 1)} h`} />
        {target && hours ? (
          <View accessibilityLiveRegion="polite" style={{ backgroundColor: color.head, borderRadius: radius.field, padding: 10 }}>
            <Body style={{ color: color.subtle }}>Trials will check {type === 'flow' ? 'flow' : 'slump'} at {target} ± 20 mm after {num(hours, 1)} h.</Body>
          </View>
        ) : null}
        <LookupPicker {...p} name="strength_age" label="Strength requirement age" />
        <LookupChips {...p} name="compressive_strengths" label="Compressive strength, MPa" />
      </Section>
      <Section title="Basic selling price">
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Field label="Bulk" error={e.selling_basic_price}>
              <NumberField accessibilityLabel="Basic selling price, bulk, INR per kg" unit="INR/kg" invalid={Boolean(e.selling_basic_price)}
                value={v.selling_basic_price} onChangeText={(t) => set('selling_basic_price', t)} />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Barrel" error={e.bulk_and_barrel}>
              <NumberField accessibilityLabel="Basic selling price, barrel, INR per kg" unit="INR/kg" invalid={Boolean(e.bulk_and_barrel)}
                value={v.bulk_and_barrel} onChangeText={(t) => set('bulk_and_barrel', t)} />
            </Field>
          </View>
        </View>
        <Small>Enter at least one.</Small>
      </Section>
      <Section title="Aggregates and admixture">
        <LookupPicker {...p} name="sand_type" label="Sand type" />
        <LookupPicker {...p} name="fine_aggregate_source" label="Fine aggregate source" />
        <LookupPicker {...p} name="sand_zone" label="Zone of sand, after gradation" />
        <LookupPicker {...p} name="coarse_aggregate_source" label="Coarse aggregate source, 10 mm and 20 mm" />
        <LookupPicker {...p} name="admixture_base" label="Admixture base" hint="Optional" placeholder="None" />
      </Section>
    </>
  )
}

export function CementitiousInput({ value, onChange, error, text: shared, onText }: {
  value: number[]; onChange: (v: number[]) => void; error?: string; text?: string; onText?: (t: string) => void
}) {
  const [own, setOwn] = useState('')
  const text = shared ?? own
  const setText = onText ?? setOwn
  const [local, setLocal] = useState<string | null>(null)
  const add = () => {
    const problem = cementitiousProblem(text, value)
    if (problem) { setLocal(problem); return }
    onChange([...value, Number(text.trim())].sort((a, b) => a - b))
    setText('')
    setLocal(null)
  }
  const message = local ?? error
  return (
    <Field label="Cementitious content, kg/m³" error={message} hint="Add each total binder the customer runs">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {value.map((n) => (
          <Pressable key={n} accessibilityRole="button" accessibilityLabel={`Remove ${n} kg per cubic metre`}
            onPress={() => { setLocal(null); onChange(value.filter((x) => x !== n)) }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingLeft: 14, paddingRight: 10, borderRadius: 20, backgroundColor: color.ink }}>
            <Text style={{ color: '#fff', fontFamily: font.semibold, fontSize: 15 }}>{n}</Text>
            <Text style={{ color: '#fff', fontSize: 18 }}>×</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <TextField accessibilityLabel="Cementitious content to add, kg per cubic metre" placeholder="e.g. 440" keyboardType="number-pad"
            invalid={Boolean(message)} value={text} onChangeText={(t) => { setText(t); setLocal(null) }} onSubmitEditing={add} returnKeyType="done" />
        </View>
        <Button title="Add" onPress={add} style={{ flexGrow: 0 }} />
      </View>
    </Field>
  )
}
