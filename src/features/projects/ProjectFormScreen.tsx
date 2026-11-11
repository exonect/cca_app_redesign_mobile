import { useMutation, useQueryClient } from '@tanstack/react-query'
import { router, usePreventRemove } from 'expo-router'
import { useRef, useState, type ReactNode } from 'react'
import { Alert, Pressable, ScrollView, Text, View, type ScrollViewInstance } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { api, fieldErrors } from '@/api/client'
import { errorMessage, statusOf } from '@/api/errors'
import { useLookups } from '@/api/hooks'
import { useAuth } from '@/auth/AuthProvider'
import { phoneFilter, potentialFilter, sfdcFilter } from '@/shared/inputFilters'
import type { Project, Ref } from '@/shared/types'
import { Banner, Body, Button, Card, Chips, ErrorState, Field, H1, Loading, MultiPicker, NumberField, Picker, Small, Strong, TextField } from '@/ui/kit'
import { color, font, radius, TOUCH } from '@/ui/theme'

import { invalidateProject, storeProject, useProject } from './api'
import { num } from './format'
import {
  CATEGORY, cementitiousOptions, CEMENTITIOUS_MAX, changedFields, EMPTY, fromProject, isFormField, LABELS, missingStep1, PRICE_MESSAGE,
  priceMissing, REMARKS_MAX, requiredAfterDraft, ruleProblems, stepForErrors, STEP1_FIELDS, toPayload, validate, withCurrent, type FkField,
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
        : existing.data.status === 'draft' ? 'Only its Sales Person, an Admin or a Sales Admin can edit a draft.'
          : 'Once a project is created, only an Admin can change it.'} />
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
  const { user } = useAuth()
  const qc = useQueryClient()
  const insets = useSafeAreaInsets()
  const scroll = useRef<ScrollViewInstance>(null)
  const [step, setStep] = useState<Step>(1)
  const [savedId, setSavedId] = useState<string | null>(project?.id ?? null)
  const [values, setValues] = useState<ProjectFormValues>(project ? fromProject(project) : { ...EMPTY })
  const [saved, setSaved] = useState<ProjectFormValues>(values)
  const dirty = JSON.stringify(values) !== JSON.stringify(saved)
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
    const body = toPayload(v)
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

  const onSaveDraft = () => {
    setBanner(null)
    const v = values
    const e = validate(v)
    if (Object.keys(e).length) fail(e)
    else saveDraft.mutate(v)
  }
  const onContinue = () => {
    setBanner(null)
    // Formats, required fields, then the legacy wizard rules (3 characters, contact name, potential above 0).
    const e = { ...ruleProblems(values, STEP1_FIELDS), ...validate(values, STEP1_FIELDS) }
    for (const f of missingStep1(values)) e[f] = `${LABELS[f]} is required.`
    if (Object.keys(e).length) { setErrors(e); top() }
    else goTo(2)
  }
  const onCreate = () => {
    setBanner(null)
    const v = values
    const e = { ...ruleProblems(v), ...validate(v) }
    if (priceMissing(v)) e.selling_basic_price ??= PRICE_MESSAGE
    if (Object.keys(e).length) fail(e)
    else create.mutate(v)
  }
  const onSaveChanges = () => {
    setBanner(null)
    const v = values
    // Like the server: formats always; past draft, what submit required must stay filled in,
    // and the legacy rules apply to the values being changed.
    const e = isDraft ? validate(v)
      : { ...requiredAfterDraft(v, saved), ...ruleProblems(v, changedFields(v, saved)), ...validate(v) }
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
          ? <CustomerStep v={values} e={errors} set={set} project={project} salesPersonName={project ? project.sales_person?.name ?? '' : user?.full_name ?? ''} />
          : <TechnicalStep v={values} e={errors} set={set} project={project} />}

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

/** `filter` keeps only the allowed characters of whatever is typed or pasted. */
function Text_({ f, label, v, e, set, hint, filter, ...input }: StepProps & { f: FormField; label: string; hint?: string; filter?: (t: string) => string } & Parameters<typeof TextField>[0]) {
  return (
    <Field label={label} error={e[f]} hint={hint}>
      <TextField accessibilityLabel={label} invalid={Boolean(e[f])} value={String(v[f])} onChangeText={(t) => set(f, (filter ? filter(t) : t) as never)} {...input} />
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
      <MultiPicker label={label} options={options} value={v[name]} onChange={(x) => set(name, x)} invalid={Boolean(e[name])} loading={q.isLoading} />
    </Field>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <Card title={title} style={{ gap: 14 }}>{children}</Card>
}

function CustomerStep(p: StepProps & { salesPersonName: string }) {
  const { v, e, set, project, salesPersonName } = p
  const regions = useLookups('region')
  const regionName = regions.data?.find((r) => String(r.id) === v.region)?.value ?? project?.region?.value
  return (
    <>
      <Section title="Customer and project">
        <Text_ {...p} f="customer_name" label="Customer name" autoComplete="organization-title" maxLength={256} />
        <Text_ {...p} f="project_name" label="Project name" maxLength={256} />
      </Section>
      <Section title="Contact person at the customer">
        <Text_ {...p} f="contact_person_name" label="Name" autoComplete="off" maxLength={256} />
        <Text_ {...p} f="contact_phone" label="Mobile number" hint="10 digits, without +91" keyboardType="number-pad" filter={phoneFilter} autoComplete="off" />
        <Text_ {...p} f="contact_email" label="Email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="off" maxLength={254} />
      </Section>
      <Section title="Opportunity">
        {/* P-07: whoever creates the project is its Sales Person, for every role; it never changes. */}
        <Field label="Sales Person" hint={project ? undefined : 'Filled from your sign in'}>
          <TextField accessibilityLabel="Sales Person" value={salesPersonName} editable={false} />
        </Field>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text_ {...p} f="sfdc_no" label="SFDC number" hint="6 digits" keyboardType="number-pad" filter={sfdcFilter} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Potential" error={e.potential_cr}>
              <NumberField accessibilityLabel="Project potential, rupees crore" unit="Cr" invalid={Boolean(e.potential_cr)} value={v.potential_cr}
                onChangeText={(t) => set('potential_cr', potentialFilter(t))} />
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

function TechnicalStep(p: StepProps) {
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
        <CementitiousChips value={v.cementitious_contents} onChange={(x) => set('cementitious_contents', x)} error={e.cementitious_contents}
          current={project?.cementitious_contents ?? []} />
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

/** Cementitious content, kg/m³: picked from the master list, as in the legacy app. */
export function CementitiousChips({ value, onChange, error, current }: {
  value: number[]; onChange: (v: number[]) => void; error?: string; current: number[]
}) {
  const q = useLookups('cementitious_content')
  const options = cementitiousOptions(q.data, [...current, ...value])
  const label = 'Cementitious content, kg/m³'
  return (
    <Field label={label} error={error}
      hint={q.isError ? 'This list could not be loaded. Go back and open the form again.' : `Each total binder the customer runs, up to ${CEMENTITIOUS_MAX}`}>
      <MultiPicker label={label} options={options} value={value} max={CEMENTITIOUS_MAX} invalid={Boolean(error)} loading={q.isLoading}
        onChange={(x) => { if (x.length <= CEMENTITIOUS_MAX) onChange([...x].sort((a, b) => a - b)) }} />
    </Field>
  )
}
