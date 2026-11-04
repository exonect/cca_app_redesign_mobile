/** Step 3, fresh concrete: slump or flow readings from 0 to 240 min with
 * the project's retention time highlighted, a mini chart, the self compacting
 * tests (V funnel, T500, L box, U box) per reading time from their master
 * lists, density, site temperature, bleeding and setting. */
import { type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'

import { useLookups } from '@/api/hooks'
import { n } from '@/shared/calc'
import type { Lookup } from '@/shared/types'
import { Button, Field, Picker, Screen, Small, TextField } from '@/ui/kit'
import { color, font, radius, TOUCH } from '@/ui/theme'

import { RetentionChart } from './charts'
import { num } from './format'
import {
  freshForm, freshPayload, freshProblems, freshSoftWarnings, LIMITS, outOfRange, READING_MINUTES, readingLabel, requirementTargets, SCC_LIST, SCC_TESTS,
  sccNumber, SLUMP_TOLERANCE, type FreshForm, type SccKey,
} from './forms'
import { CellInput, Section, Segmented, StepActions, Verdict, WarnText } from './parts'
import { useStepForm, useWorkspace } from './workspace'

const SHOWN = ['fresh_readings', 'fresh_density', 'site_temp', 'bleeding', 'setting', 'scc'] as const

/** Choices of an SCC master list as numbers ("9 sec" stores 9), keeping a stored number that is not in the list. */
export function sccOptions(list: Lookup[] | undefined, current: string): { value: string; label: string }[] {
  const choices = (list ?? []).flatMap((o) => { const x = sccNumber(o.value); return x === null ? [] : [{ value: x, label: o.value }] })
  const unique = choices.filter((c, i) => choices.findIndex((d) => d.value === c.value) === i)
  const v = current.trim()
  return v && !unique.some((c) => Number(c.value) === Number(v)) ? [{ value: v, label: v }, ...unique] : unique
}
/** The option value a stored number matches ("9.0" picks "9"). */
const sccValue = (options: { value: string }[], current: string) =>
  current.trim() === '' ? null : options.find((o) => Number(o.value) === Number(current))?.value ?? current

/** Note beside a reading: loss from the initial reading, or the target verdict on the target row. */
export function readingNote(minutes: string, value: number | null, initial: number | null, target: { minutes: number; mm: number } | null) {
  if (value === null) return ''
  if (target && Number(minutes) === target.minutes) return Math.abs(value - target.mm) <= SLUMP_TOLERANCE ? 'Within target' : 'Outside target'
  if (minutes === '0' || initial === null) return ''
  const lost = initial - value
  return lost > 0 ? `${num(lost)} mm lost` : lost < 0 ? `${num(-lost)} mm gained` : 'No loss'
}

export function FreshStep({ readOnly, banners }: { readOnly: boolean; banners: ReactNode }) {
  const { project, header } = useWorkspace()
  const { form, setForm, errors } = useStepForm<FreshForm>('fresh', (t) => freshForm(t, project), freshPayload, freshProblems, SHOWN)
  const bleeding = useLookups('bleeding')
  const setting = useLookups('setting')
  // Legacy: each SCC cell is a dropdown of its master list ("5 sec" ... "22 sec"); the trial stores the number.
  const sccLists: Record<SccKey, { data?: Lookup[]; isError: boolean }> = {
    v_funnel: useLookups(SCC_LIST.v_funnel), t500: useLookups(SCC_LIST.t500), l_box: useLookups(SCC_LIST.l_box), u_box: useLookups(SCC_LIST.u_box),
  }
  const warns = freshSoftWarnings(form)
  const setScc = (k: SccKey, m: string, v: string) => setForm((f) => ({ ...f, scc: { ...f.scc, [k]: { ...f.scc[k], [m]: v } } }))
  const addScc = (k: SccKey) => setForm((f) => ({ ...f, scc_tests: SCC_TESTS.map((t) => t.key).filter((x) => x === k || f.scc_tests.includes(x)) }))
  const removeScc = (k: SccKey) => setForm((f) => ({
    ...f, scc_tests: f.scc_tests.filter((x) => x !== k), scc: { ...f.scc, [k]: Object.fromEntries(READING_MINUTES.map((m) => [m, ''])) },
  }))
  const available = SCC_TESTS.filter((t) => !form.scc_tests.includes(t.key))

  const label = form.fresh_test === 'flow' ? 'Flow' : 'Slump'
  const target = requirementTargets(project).retention
  const at = target ? READING_MINUTES.find((m) => Number(m) === target.minutes) : undefined
  const readings = READING_MINUTES.flatMap((m) => {
    const v = n(form.readings[m])
    return v === null ? [] : [{ minutes: Number(m), mm: v }]
  })
  const initial = n(form.readings['0'])
  const atValue = at ? n(form.readings[at]) : null
  const within = target && atValue !== null ? Math.abs(atValue - target.mm) <= SLUMP_TOLERANCE : null

  const set = <K extends keyof FreshForm>(k: K, v: FreshForm[K]) => setForm((f) => ({ ...f, [k]: v }))
  const setReading = (m: string, v: string) => setForm((f) => ({ ...f, readings: { ...f.readings, [m]: v } }))

  return (
    <Screen header={header} footer={<StepActions canSave={!readOnly} label="Fresh concrete" />}>
      {banners}
      {target ? <Small>{label} target {num(target.mm)} ± {SLUMP_TOLERANCE} mm at {target.hours} h.</Small> : null}
      <Section flush title={`${label} retention`} aside={!readOnly ? (
        <View style={{ width: 160 }}>
          <Segmented label="Test" value={form.fresh_test || 'slump'} onChange={(v) => set('fresh_test', v)}
            options={[{ value: 'slump', label: 'Slump' }, { value: 'flow', label: 'Flow' }]} />
        </View>
      ) : undefined}>
        <Small style={{ paddingHorizontal: 16, paddingBottom: 8 }}>Readings in mm from the time of mixing. Leave a time blank if it was not measured.</Small>
        {READING_MINUTES.map((m) => {
          const hit = m === at
          const v = n(form.readings[m])
          const note = readingNote(m, v, initial, target)
          const sub = m === '0' ? 'At batching' : hit && target ? `Target ${num(target.mm)} ± ${SLUMP_TOLERANCE}` : ''
          const timeLabel = m === '0' ? 'Initial' : `${m} min`
          return (
            <View key={m} style={{
              flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 16, paddingVertical: 2,
              borderTopWidth: 1, borderColor: color.divider, backgroundColor: hit ? color.met.bg : color.surface,
              borderLeftWidth: hit ? 3 : 0, borderLeftColor: color.met.solid,
            }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: font.semibold, fontSize: 15, color: color.ink }}>{timeLabel}</Text>
                {sub ? <Text style={{ fontFamily: hit ? font.semibold : font.regular, fontSize: 13, color: hit ? color.met.fg : color.muted }}>{sub}</Text> : null}
              </View>
              <View style={{ width: 104, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <CellInput style={{ flex: 1 }} keyboardType="number-pad" inputMode="numeric"
                  accessibilityLabel={`${label} at ${m === '0' ? 'batching' : `${m} minutes`} in millimetres${hit && target ? `, target ${num(target.mm)} plus or minus ${SLUMP_TOLERANCE}` : ''}`}
                  value={form.readings[m]} editable={!readOnly} invalid={outOfRange(form.readings[m], LIMITS.reading)}
                  warn={!!warns[`fresh_readings.${m}`]} onChangeText={(x) => setReading(m, x)} />
                <Text style={{ fontFamily: font.regular, fontSize: 13, color: color.muted }}>mm</Text>
              </View>
              <Text style={{ width: 90, textAlign: 'right', fontFamily: hit && note ? font.bold : font.regular, fontSize: 13, color: hit && note ? (within ? color.met.fg : color.below.fg) : color.muted }}>{note}</Text>
            </View>
          )
        })}
        {errors.fresh_readings ? <Text accessibilityLiveRegion="polite" style={{ paddingHorizontal: 16, paddingTop: 8, fontFamily: font.regular, fontSize: 13, color: color.error }}>{errors.fresh_readings}</Text> : null}
        <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
          <WarnText items={READING_MINUTES.map((m) => warns[`fresh_readings.${m}`])} />
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderTopWidth: 1, borderColor: color.divider, gap: 6 }}>
          {within !== null && target ? (
            <Verdict ok={within}>{num(atValue)} mm at {target.hours} h, {within ? 'within' : 'outside'} {num(target.mm)} ± {SLUMP_TOLERANCE}</Verdict>
          ) : !target ? <Small>The project has no retention target. Add the retention time and {label.toLowerCase()} to the project to compare.</Small> : null}
          <RetentionChart readings={readings} label={label}
            target={target ? { minutes: target.minutes, hours: target.hours, mm: target.mm, tolerance: SLUMP_TOLERANCE } : null} />
        </View>
      </Section>

      {SCC_TESTS.filter((t) => form.scc_tests.includes(t.key)).map((t) => (
        <Section key={t.key} flush title={`${t.label}${t.unit ? `, ${t.unit}` : ''}`} aside={!readOnly ? (
          <Button title="Remove" variant="tertiary" accessibilityLabel={`Remove ${t.label}`} onPress={() => removeScc(t.key)} style={{ flexGrow: 0, paddingHorizontal: 4 }} />
        ) : undefined}>
          {sccLists[t.key].isError ? <Small style={{ paddingHorizontal: 16, paddingBottom: 6 }}>This list could not be loaded. Go back and open the trial again.</Small> : null}
          {READING_MINUTES.map((m) => {
            const options = sccOptions(sccLists[t.key].data, form.scc[t.key][m])
            return (
              <View key={m} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 16, paddingVertical: 2, borderTopWidth: 1, borderColor: color.divider }}>
                <Text style={{ flex: 1, fontFamily: font.semibold, fontSize: 15, color: color.ink }}>{readingLabel(m)}</Text>
                <View style={{ width: 150 }}>
                  <Picker label={`${t.label} at ${readingLabel(m).toLowerCase()}`} placeholder="–" value={sccValue(options, form.scc[t.key][m])}
                    options={options} disabled={readOnly} onChange={(v) => setScc(t.key, m, v ?? '')} />
                </View>
              </View>
            )
          })}
          <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
            <WarnText items={READING_MINUTES.map((m) => warns[`scc.${t.key}.${m}`])} />
          </View>
        </Section>
      ))}
      {errors.scc ? <Text accessibilityLiveRegion="polite" style={{ fontFamily: font.regular, fontSize: 13, color: color.error }}>{errors.scc}</Text> : null}
      {!readOnly && available.length > 0 ? (
        <Field label="Concrete properties" hint={`V funnel, T500, L box and U box, read at each time like the ${label.toLowerCase()}.`}>
          <Picker label="Add a self compacting test" placeholder="Add a self compacting test" value={null}
            options={available.map((t) => ({ value: t.key, label: t.label }))} onChange={(v) => { if (v) addScc(v) }} />
        </Field>
      ) : null}

      <Section label="Density and observations">
        <Field label="Fresh wet density" error={errors.fresh_density}>
          <TextField accessibilityLabel="Fresh wet density, kilograms per cubic metre" unit="kg/m³" keyboardType="number-pad" inputMode="numeric"
            value={form.fresh_density} editable={!readOnly} invalid={!!errors.fresh_density}
            onChangeText={(v) => set('fresh_density', v)} style={{ textAlign: 'right' }} />
        </Field>
        <WarnText items={[warns.fresh_density]} />
        <Field label="Site temperature" error={errors.site_temp}>
          <TextField accessibilityLabel="Site temperature, degrees Celsius" unit="°C" keyboardType="decimal-pad" inputMode="decimal"
            value={form.site_temp} editable={!readOnly} invalid={!!errors.site_temp}
            onChangeText={(v) => set('site_temp', v)} style={{ textAlign: 'right' }} />
        </Field>
        <WarnText items={[warns.site_temp]} />
        <RadioLookup legend="Bleeding" options={bleeding.data ?? []} value={form.bleeding} disabled={readOnly} failed={bleeding.isError}
          onChange={(v) => set('bleeding', v)} error={errors.bleeding} />
        <RadioLookup legend="Setting" options={setting.data ?? []} value={form.setting} disabled={readOnly} failed={setting.isError}
          onChange={(v) => set('setting', v)} error={errors.setting} />
      </Section>
    </Screen>
  )
}

function RadioLookup({ legend, options, value, onChange, disabled, error, failed }: {
  legend: string; options: { id: number; value: string }[]; value: string; onChange: (v: string) => void; disabled?: boolean; error?: string; failed?: boolean
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={legend} style={{ gap: 6 }}>
      <Text style={{ fontFamily: font.semibold, fontSize: 14, color: color.ink }}>{legend}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => {
          const on = value === String(o.id)
          return (
            <Pressable key={o.id} accessibilityRole="radio" accessibilityState={{ checked: on, disabled }} accessibilityLabel={o.value}
              disabled={disabled} onPress={() => onChange(on ? '' : String(o.id))}
              style={{ minHeight: TOUCH, paddingHorizontal: 14, borderRadius: radius.field, borderWidth: on ? 2 : 1, borderColor: on ? color.ink : color.field, backgroundColor: on ? color.head : color.surface, justifyContent: 'center', opacity: disabled ? 0.6 : 1 }}>
              <Text style={{ fontFamily: on ? font.semibold : font.medium, fontSize: 15, color: color.ink }}>{o.value}</Text>
            </Pressable>
          )
        })}
        {options.length === 0 ? <Small>{failed ? 'This list could not be loaded. Go back and open the trial again.' : 'No values yet. An Admin can add them in Master data.'}</Small> : null}
      </View>
      {error ? <Text accessibilityLiveRegion="polite" style={{ fontFamily: font.regular, fontSize: 13, color: color.error }}>{error}</Text> : null}
    </View>
  )
}
