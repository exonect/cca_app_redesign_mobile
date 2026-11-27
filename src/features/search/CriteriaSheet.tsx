import { useState, type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'

import { useLookups } from '@/api/hooks'
import { Banner, Button, Chips, Field, H2, MultiPicker, Picker, Small } from '@/ui/kit'
import { color, font } from '@/ui/theme'

import { Sheet } from '@/features/projects/Sheet'

import {
  emptyCriteria, FAMILIES, minutesLabel, rangeHint, RETENTION_MINUTES, OLD_SAND_KEYS, sandHint, SLUMP_TOL, splitNumbers, STRENGTH_AGES,
  validate, type Criteria, type Errors, type ServerErrors,
} from './criteria'
import { SieveSection } from './SieveSection'
import { REQUIREMENT_TYPES } from '@/shared/workability'

type Props = {
  open: boolean; initial: Criteria; onClose: () => void; onApply: (c: Criteria) => void
  /** A refused search (400), laid on the inputs it is about. */
  serverErrors?: ServerErrors
}

/** Edit every criterion. Starts from the applied criteria each time it opens. */
export function CriteriaSheet(props: Props) {
  return <Body_ key={props.open ? 'open' : 'closed'} {...props} />
}

function Body_({ open, initial, onClose, onApply, serverErrors }: Props) {
  const [c, setC] = useState<Criteria>(initial)
  const [errors, setErrors] = useState<Errors>(serverErrors?.fields ?? {})
  const [gradingErrors, setGradingErrors] = useState<Record<string, string>>(serverErrors?.grading ?? {})
  const [other, setOther] = useState<string[]>(serverErrors?.other ?? [])
  const set = <K extends keyof Criteria>(k: K, v: Criteria[K]) => {
    setC((d) => ({ ...d, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined }))
    if (k === 'sieve') setGradingErrors({})
  }
  const apply = () => {
    const e = validate(c)
    setErrors(e)
    setGradingErrors({})
    setOther([])
    if (!Object.values(e).some(Boolean)) onApply(c)
  }
  const slumpN = Number(c.slump)
  const slumpHint = c.slump.trim() && Number.isFinite(slumpN) && c.retention_minutes !== ''
    ? `Matches ${Math.max(0, slumpN - SLUMP_TOL)} to ${slumpN + SLUMP_TOL} mm at ${minutesLabel(c.retention_minutes).toLowerCase()}.`
    : 'Choose a slump and when it is measured. Both are needed.'
  const ageLabel = STRENGTH_AGES.find((a) => a.value === c.strength_age)?.label
  const strengthHint = rangeHint('strength', c.strength)
  const errorCount = Object.values(errors).filter(Boolean).length

  return (
    <Sheet open={open} onClose={onClose} title="Criteria" tall
      footer={<>
        <Button title="Clear criteria" variant="tertiary" onPress={() => { setC(emptyCriteria()); setErrors({}); setGradingErrors({}); setOther([]) }} />
        <Button title="Search products" variant="primary" onPress={apply} />
      </>}>
      <Small>Leave a field blank to ignore it. Every criterion you set must match.</Small>
      {errorCount ? <Banner tone="error">{errorCount === 1 ? '1 criterion needs' : `${errorCount} criteria need`} attention.</Banner> : null}
      {other.map((m) => <Banner key={m} tone="error">{m}</Banner>)}

      <Group title="Cement">
        <LookupMulti category="cement_brand" label="Cement brand" noun="cement brand" value={c.cement_brand} error={errors.cement_brand} onChange={(v) => set('cement_brand', v)} />
        <LookupMulti category="cement_grade" label="Cement grade" noun="cement grade" value={c.cement_grade} error={errors.cement_grade} onChange={(v) => set('cement_grade', v)} />
        <MineralPicker value={c.mineral_admixtures} onChange={(v) => set('mineral_admixtures', v)} />
      </Group>

      <Group title="Concrete">
        <LookupMulti category="grade_of_concrete" label="Grade of concrete" noun="grade" value={c.grade_of_concrete} error={errors.grade_of_concrete} onChange={(v) => set('grade_of_concrete', v)} />
        {/* UAT, 18 Nov 2026: both W/C dropdowns of the legacy search, from their master lists. */}
        <NumberMulti category="wc_ratio_ssd" label="W/C ratio, SSD" field="W/C ratio, SSD, ±0.02" noun="W/C ratios"
          hint={rangeHint('wc', c.wc) ? `Matches a free W/C (SSD) of ${rangeHint('wc', c.wc)}.` : 'The free W/C of the mix design, saturated surface dry.'}
          value={splitNumbers(c.wc)} error={errors.wc} onChange={(v) => set('wc', v.join(', '))} />
        <NumberPick category="wc_ratio_corrected" label="W/C ratio, corrected" field="W/C ratio, corrected, ±0.02" any="Any W/C ratio"
          hint={`${rangeHint('wc', c.wc_corrected) ? `Matches a corrected W/C of ${rangeHint('wc', c.wc_corrected)}. ` : 'After the moisture and absorption correction. '}CCA trials only: imported history has no corrected ratio.`}
          value={c.wc_corrected} error={errors.wc_corrected} onChange={(v) => set('wc_corrected', v)} />
        {/* UAT, 27 Nov 2026: the legacy multi select of the Cementitious Content master list, as the project form. */}
        <NumberMulti category="cementitious_content" label="Cementitious content" field="Cementitious content, ±50 kg/m³" noun="cementitious contents" unit="kg/m³"
          hint={rangeHint('cementitious', c.cementitious) ? `Matches ${rangeHint('cementitious', c.cementitious)}.` : 'Cement plus mineral admixtures.'}
          value={splitNumbers(c.cementitious)} error={errors.cementitious} onChange={(v) => set('cementitious', v.join(', '))} />
      </Group>

      <Group title="Sand">
        <SandPicker value={c.sand_type} onChange={(v) => set('sand_type', v)} />
        <LookupMulti category="sand_zone" label="Sand zone" noun="sand zone" value={c.sand_zone} error={errors.sand_zone} onChange={(v) => set('sand_zone', v)} />
        <LookupMulti category="fine_aggregate_source" label="Fine aggregate source" noun="source" value={c.fine_aggregate_source} error={errors.fine_aggregate_source} onChange={(v) => set('fine_aggregate_source', v)} />
        <LookupMulti category="coarse_aggregate_source" label="Coarse aggregate source" noun="source" value={c.coarse_aggregate_source} error={errors.coarse_aggregate_source} onChange={(v) => set('coarse_aggregate_source', v)} />
      </Group>

      <Group title="Slump retention" note="±20 mm">
        {/* UAT, 27 Nov 2026: the legacy search's "Requirement Type", which it sent but did not filter on. */}
        <Field label="Requirement type" hint={c.requirement_type === 'slump' ? 'Only trials measured as slump.' : c.requirement_type === 'flow'
          ? 'Only trials measured as flow.' : c.requirement_type === 'flow_slump' ? 'Trials measured as slump or flow.' : undefined}>
          <Picker label="Requirement type" value={c.requirement_type} onChange={(v) => set('requirement_type', v ?? '')}
            options={[{ value: '', label: 'Any requirement type' }, ...REQUIREMENT_TYPES]} />
        </Field>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <SlumpPicker value={c.slump} error={errors.slump} onChange={(v) => set('slump', v)} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Retained at" error={errors.retention_minutes}>
              <Picker label="Retained at" value={c.retention_minutes === '' ? null : Number(c.retention_minutes)} invalid={Boolean(errors.retention_minutes)}
                options={RETENTION_MINUTES.map((m) => ({ value: m, label: minutesLabel(m) }))}
                onChange={(v) => set('retention_minutes', v === null ? '' : String(v))} />
            </Field>
          </View>
        </View>
        <Small>{slumpHint}</Small>
      </Group>

      <Group title="Strength" note="0 to +5 N/mm²">
        <Field label="Age" error={errors.strength_age}>
          <Picker label="Strength age" value={c.strength_age || null} options={STRENGTH_AGES} invalid={Boolean(errors.strength_age)}
            onChange={(v) => set('strength_age', v ?? '')} />
        </Field>
        <StrengthPicker value={splitNumbers(c.strength)} error={errors.strength} onChange={(v) => set('strength', v.join(', '))} />
        <Small>{strengthHint && ageLabel ? `Matches average ${ageLabel} strength of ${strengthHint}.` : 'Choose an age and one or more strengths. Both are needed.'}</Small>
      </Group>

      <Group title="Product family">
        <Chips label="Product family" single options={FAMILIES} value={[c.family]} onChange={(v) => set('family', v[0] ?? '')} />
      </Group>

      <SieveSection value={c.sieve} error={errors.sieve} serverGrading={gradingErrors} onChange={(v) => set('sieve', v)} />
    </Sheet>
  )
}

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 12, paddingTop: 12, borderTopWidth: 1, borderColor: color.divider }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <H2>{title}</H2>
        {note ? <Small>{note}</Small> : null}
      </View>
      {children}
    </View>
  )
}

/** Choose several master values by name: a picker to add, chips to remove. */
export function LookupMulti({ category, label, noun, value, onChange, error }: {
  category: string; label: string; noun: string; value: string[]; onChange: (v: string[]) => void; error?: string
}) {
  const q = useLookups(category)
  const has = (v: string) => value.some((x) => x.toLowerCase() === v.toLowerCase())
  const options = (q.data ?? []).filter((l) => !has(l.value)).map((l) => ({ value: l.value, label: l.value }))
  return (
    <Field label={label} error={error} hint={q.isError ? `The ${noun} list could not be loaded.` : undefined}>
      <Picker label={label} value={null} options={options} disabled={q.isLoading}
        placeholder={q.isLoading ? 'Loading…' : value.length ? `Add another ${noun}` : `Any ${noun}`}
        onChange={(v) => { if (v) onChange([...value, v]) }} />
      {value.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {value.map((v) => (
            <Pressable key={v} accessibilityRole="button" accessibilityLabel={`Remove ${v}`} onPress={() => onChange(value.filter((x) => x !== v))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingLeft: 12, paddingRight: 10, borderRadius: 20, backgroundColor: color.ink }}>
              <Text style={{ color: '#fff', fontFamily: font.semibold, fontSize: 14 }}>{v}</Text>
              <Text style={{ color: '#fff', fontSize: 17 }}>×</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Field>
  )
}

/**
 * Mineral admixtures (UAT, 17 Nov 2026): a searchable multi select over the Mineral Admixture master list,
 * the legacy search's dropdown and the same list as the project form and the mix design. The server matches
 * each name to the mix design's material key. A value not on the list (an older saved search) stays shown.
 */
function MineralPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const q = useLookups('mineral_admixture')
  const names = (q.data ?? []).map((l) => l.value)
  const extra = value.filter((v) => !names.some((n) => n.toLowerCase() === v.toLowerCase()))
  return (
    <Field label="Mineral admixtures, any used" hint={q.isError ? 'This list could not be loaded. Close and open the criteria again.' : 'Trials that used at least one of these.'}>
      <MultiPicker label="Mineral admixtures" placeholder="Any mineral admixture" loading={q.isLoading} value={value} onChange={onChange}
        options={[...names, ...extra].map((n) => ({ value: n, label: n }))} />
    </Field>
  )
}

const NUMERIC = /^[+]?(\d+\.?\d*|\.\d+)$/
const LIST_FAILED = 'This list could not be loaded. Close and open the criteria again.'

/** A numeric master list, ascending; entries that are not numbers cannot match a value, so they are left out. */
function useNumberList(category: string) {
  const q = useLookups(category)
  const names = (q.data ?? []).map((l) => l.value.trim()).filter((v) => NUMERIC.test(v))
  return { q, listed: [...new Set(names)].sort((a, b) => Number(a) - Number(b)) }
}
/** "30.0" from a project is the listed "30", so the list can untick or change it. */
const asListed = (listed: string[], v: string) => listed.find((n) => Number(n) === Number(v)) ?? v
const withUnit = (n: string, unit?: string) => (unit ? `${n} ${unit}` : n)

/** Several values from a numeric master list (UAT, 18 Nov 2026: the legacy search's multi select dropdowns). */
function NumberMulti({ category, label, field, noun, unit, hint, value, error, onChange }: {
  category: string; label: string; field: string; noun: string; unit?: string; hint?: string
  value: string[]; error?: string; onChange: (v: string[]) => void
}) {
  const { q, listed } = useNumberList(category)
  const chosen = [...new Set(value.map((v) => asListed(listed, v)))]
  const extra = chosen.filter((v) => !listed.includes(v))
  return (
    <Field label={field} error={error} hint={q.isError ? LIST_FAILED : hint}>
      <MultiPicker label={label} placeholder={`Choose ${noun}`} loading={q.isLoading} value={chosen} onChange={onChange}
        invalid={Boolean(error)} options={[...listed, ...extra].map((n) => ({ value: n, label: withUnit(n, unit) }))} />
    </Field>
  )
}

/** One value from a numeric master list (UAT, 18 Nov 2026: the legacy search's single select dropdowns).
 * With `any`, a first option clears the choice. */
function NumberPick({ category, label, field, unit, any, hint, value, error, onChange }: {
  category: string; label: string; field: string; unit?: string; any?: string; hint?: string
  value: string; error?: string; onChange: (v: string) => void
}) {
  const { q, listed } = useNumberList(category)
  const v = value.trim()
  const chosen = v ? asListed(listed, v) : ''
  const values = chosen && !listed.includes(chosen) ? [...listed, chosen] : listed
  const options = [...(any ? [{ value: '', label: any }] : []), ...values.map((n) => ({ value: n, label: withUnit(n, unit) }))]
  return (
    <Field label={field} error={error} hint={q.isError ? LIST_FAILED : hint}>
      <Picker label={label} value={any ? chosen : chosen || null} invalid={Boolean(error)} disabled={q.isLoading}
        placeholder={q.isLoading ? 'Loading…' : 'Choose'} options={options} onChange={(x) => onChange(x ?? '')} />
    </Field>
  )
}

/** Strength: the Compressive Strength master list, as the legacy "Compressive Strength (MPA)" dropdown. */
const StrengthPicker = (p: { value: string[]; error?: string; onChange: (v: string[]) => void }) =>
  <NumberMulti {...p} category="compressive_strength" label="Strength" field="Strength" noun="strengths" unit="N/mm²" />

/** Slump: the Slump Flow master list, as the legacy "Slump/Flow (mm)" dropdown. */
const SlumpPicker = (p: { value: string; error?: string; onChange: (v: string) => void }) =>
  <NumberPick {...p} category="slump_flow" label="Slump, mm" field="Slump" unit="mm" />

/** Sand type: one name from the Sand Type master list, as the legacy search (UAT, 27 Nov 2026); the same list as
 * the project form. A value not on the list (an older link's key, or a retired name) stays shown. */
function SandPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const q = useLookups('sand_type')
  const names = [...new Set((q.data ?? []).map((l) => l.value.trim()).filter(Boolean))]
  const values = value && !names.includes(value) ? [...names, value] : names
  return (
    <Field label="Sand type" hint={q.isError ? LIST_FAILED : sandHint(value)}>
      <Picker label="Sand type" value={value} disabled={q.isLoading} placeholder={q.isLoading ? 'Loading…' : 'Any sand'}
        options={[{ value: '', label: 'Any sand' }, ...values.map((n) => ({ value: n, label: OLD_SAND_KEYS[n] ?? n }))]}
        onChange={(v) => onChange(v ?? '')} />
    </Field>
  )
}
