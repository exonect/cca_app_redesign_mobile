import { useState, type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'

import { useLookups } from '@/api/hooks'
import { Banner, Button, Chips, Field, H2, NumberField, Picker, Small, TextField } from '@/ui/kit'
import { color, font } from '@/ui/theme'

import { Sheet } from '@/features/projects/Sheet'

import {
  emptyCriteria, FAMILIES, MINERALS, minutesLabel, rangeHint, RETENTION_MINUTES, SAND_TYPES, SLUMP_TOL, STRENGTH_AGES,
  validate, type Criteria, type Errors,
} from './criteria'

/** Edit every criterion. Starts from the applied criteria each time it opens. */
export function CriteriaSheet(props: { open: boolean; initial: Criteria; onClose: () => void; onApply: (c: Criteria) => void }) {
  return <Body_ key={props.open ? 'open' : 'closed'} {...props} />
}

function Body_({ open, initial, onClose, onApply }: { open: boolean; initial: Criteria; onClose: () => void; onApply: (c: Criteria) => void }) {
  const [c, setC] = useState<Criteria>(initial)
  const [errors, setErrors] = useState<Errors>({})
  const set = <K extends keyof Criteria>(k: K, v: Criteria[K]) => {
    setC((d) => ({ ...d, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }
  const apply = () => {
    const e = validate(c)
    setErrors(e)
    if (!Object.values(e).some(Boolean)) onApply(c)
  }
  const slumpN = Number(c.slump)
  const slumpHint = c.slump.trim() && Number.isFinite(slumpN) && c.retention_minutes !== ''
    ? `Matches ${Math.max(0, slumpN - SLUMP_TOL)} to ${slumpN + SLUMP_TOL} mm at ${minutesLabel(c.retention_minutes).toLowerCase()}.`
    : 'Enter a slump and when it is measured. Both are needed.'
  const ageLabel = STRENGTH_AGES.find((a) => a.value === c.strength_age)?.label
  const strengthHint = rangeHint('strength', c.strength)
  const errorCount = Object.values(errors).filter(Boolean).length

  return (
    <Sheet open={open} onClose={onClose} title="Criteria" tall
      footer={<>
        <Button title="Clear criteria" variant="tertiary" onPress={() => { setC(emptyCriteria()); setErrors({}) }} />
        <Button title="Search products" variant="primary" onPress={apply} />
      </>}>
      <Small>Leave a field blank to ignore it. Every criterion you set must match.</Small>
      {errorCount ? <Banner tone="error">{errorCount === 1 ? '1 criterion needs' : `${errorCount} criteria need`} attention.</Banner> : null}

      <Group title="Cement">
        <LookupMulti category="cement_brand" label="Cement brand" noun="cement brand" value={c.cement_brand} onChange={(v) => set('cement_brand', v)} />
        <LookupMulti category="cement_grade" label="Cement grade" noun="cement grade" value={c.cement_grade} onChange={(v) => set('cement_grade', v)} />
      </Group>

      <Group title="Concrete">
        <LookupMulti category="grade_of_concrete" label="Grade of concrete" noun="grade" value={c.grade_of_concrete} onChange={(v) => set('grade_of_concrete', v)} />
        <Field label="Free W/C, SSD, ±0.02" error={errors.wc} hint={rangeHint('wc', c.wc) ? `Matches ${rangeHint('wc', c.wc)}.` : 'Separate several values with commas.'}>
          <TextField accessibilityLabel="Free W/C, SSD" keyboardType="numbers-and-punctuation" invalid={Boolean(errors.wc)} value={c.wc} onChangeText={(t) => set('wc', t)} />
        </Field>
        <Field label="Cementitious content, ±50 kg/m³" error={errors.cementitious}
          hint={rangeHint('cementitious', c.cementitious) ? `Matches ${rangeHint('cementitious', c.cementitious)}.` : 'Cement plus mineral admixtures.'}>
          <TextField accessibilityLabel="Cementitious content, kg per cubic metre" keyboardType="numbers-and-punctuation" unit="kg/m³"
            invalid={Boolean(errors.cementitious)} value={c.cementitious} onChangeText={(t) => set('cementitious', t)} />
        </Field>
      </Group>

      <Group title="Mineral admixtures" note="Any selected used">
        <Chips label="Mineral admixtures" options={MINERALS} value={c.mineral_admixtures} onChange={(v) => set('mineral_admixtures', v)} />
      </Group>

      <Group title="Sand">
        <Field label="Sand type">
          <Picker label="Sand type" value={c.sand_type} options={SAND_TYPES} onChange={(v) => set('sand_type', v ?? '')} />
        </Field>
        <LookupMulti category="sand_zone" label="Sand zone" noun="sand zone" value={c.sand_zone} onChange={(v) => set('sand_zone', v)} />
        <LookupMulti category="fine_aggregate_source" label="Fine aggregate source" noun="source" value={c.fine_aggregate_source} onChange={(v) => set('fine_aggregate_source', v)} />
        <LookupMulti category="coarse_aggregate_source" label="Coarse aggregate source" noun="source" value={c.coarse_aggregate_source} onChange={(v) => set('coarse_aggregate_source', v)} />
      </Group>

      <Group title="Slump retention" note="±20 mm">
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="Slump" error={errors.slump}>
              <NumberField accessibilityLabel="Slump, mm" unit="mm" invalid={Boolean(errors.slump)} value={c.slump} onChangeText={(t) => set('slump', t)} />
            </Field>
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
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="Age" error={errors.strength_age}>
              <Picker label="Strength age" value={c.strength_age || null} options={STRENGTH_AGES} invalid={Boolean(errors.strength_age)}
                onChange={(v) => set('strength_age', v ?? '')} />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Strength" error={errors.strength}>
              <TextField accessibilityLabel="Strength, newtons per square millimetre" keyboardType="numbers-and-punctuation" unit="N/mm²"
                invalid={Boolean(errors.strength)} value={c.strength} onChangeText={(t) => set('strength', t)} />
            </Field>
          </View>
        </View>
        <Small>{strengthHint && ageLabel ? `Matches average ${ageLabel} strength of ${strengthHint}.` : 'Enter an age and a strength. Both are needed.'}</Small>
      </Group>

      <Group title="Product family">
        <Chips label="Product family" single options={FAMILIES} value={[c.family]} onChange={(v) => set('family', v[0] ?? '')} />
      </Group>
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
export function LookupMulti({ category, label, noun, value, onChange }: {
  category: string; label: string; noun: string; value: string[]; onChange: (v: string[]) => void
}) {
  const q = useLookups(category)
  const has = (v: string) => value.some((x) => x.toLowerCase() === v.toLowerCase())
  const options = (q.data ?? []).filter((l) => !has(l.value)).map((l) => ({ value: l.value, label: l.value }))
  return (
    <Field label={label} hint={q.isError ? `The ${noun} list could not be loaded.` : undefined}>
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
