/** Step 2, mix design: trial date and time, grade, batch size, product and
 * dosage, free W/C (read only), and the materials as an accordion whose
 * open row shows SSD, absorption, moisture, correction and adjusted. */
import { useCallback, useState, type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import Svg, { Polyline } from 'react-native-svg'

import { toOptions, useLookups, useProducts } from '@/api/hooks'
import { admixtureQty, AGGREGATES, BINDERS, cementitious, f2, MATERIAL_LABEL, MATERIALS, mix, n, type MixLine } from '@/shared/calc'
import type { Lookup, Trial } from '@/shared/types'
import { Banner, Field, Picker, Screen, Small, TextField } from '@/ui/kit'
import { color, font, TOUCH } from '@/ui/theme'

import { CastAtField } from './CastAtField'
import { num } from './format'
import { LIMITS, mixForm, mixPayload, mixProblems, outOfRange, type MaterialEntry, type MixForm } from './forms'
import { CellInput, cell, Output, Section, SourceNote, StepActions, TableHead, TickIcon, WarnIcon } from './parts'
import { useStepForm, useWorkspace } from './workspace'

const MINERALS = ['fly_ash', 'ggbs', 'alcofine', 'microsilica']
const COARSE = ['20mm', '10mm']
const FINE = ['river_sand', 'crushed_sand']

/** Which master list feeds the source of each material (none for water and admixtures). */
export function sourceCategory(material: string): string | null {
  if (material === 'cement') return 'cement_brand'
  if (MINERALS.includes(material)) return 'mineral_admixture_source'
  if (COARSE.includes(material)) return 'coarse_aggregate_source'
  if (FINE.includes(material)) return 'fine_aggregate_source'
  return null
}

/** Server mix lines in the live preview's shape. */
function serverLines(t: Trial): Record<string, MixLine> | null {
  const r = t.results?.mix
  if (!r) return null
  const x = (v: string | null) => (v === null || v === undefined ? null : Number(v))
  return Object.fromEntries(r.lines.map((l) => [l.material, {
    material: l.material, ssd: x(l.ssd), difference: x(l.difference), correction: x(l.correction), adjusted: x(l.design_adjusted), batch: x(l.batch_weight),
  }]))
}

const signed = (v: number | null) => (v === null ? '–' : v < 0 ? `−${f2(-v)}` : `+${f2(v)}`)
const COLS: (number | 'flex')[] = ['flex', 92, 76, 22]
const SHOWN = ['cast_at', 'grade_of_concrete', 'admixture_1', 'dosage_1', 'batch_size', 'admixture_2', 'dosage_2', 'materials'] as const

export function MixStep({ readOnly, banners }: { readOnly: boolean; banners: ReactNode }) {
  const { trial, project, header, castError, setCastError } = useWorkspace()
  const status = trial.status
  const problems = useCallback((f: MixForm) => mixProblems(f, status), [status])
  const { form, setForm, errors, dirty } = useStepForm<MixForm>('mix', mixForm, mixPayload, problems, SHOWN)
  const [open, setOpen] = useState<string | null>(null)
  const [second, setSecond] = useState(() => !!trial.admixture_2)
  const products = useProducts()
  const grades = useLookups('grade_of_concrete')
  const lists: Record<string, { data?: Lookup[] }> = {
    cement_brand: useLookups('cement_brand'),
    cement_grade: useLookups('cement_grade'),
    mineral_admixture_source: useLookups('mineral_admixture_source'),
    coarse_aggregate_source: useLookups('coarse_aggregate_source'),
    fine_aggregate_source: useLookups('fine_aggregate_source'),
  }

  const set = <K extends keyof MixForm>(k: K, v: MixForm[K]) => setForm((f) => ({ ...f, [k]: v }))
  const setMat = (m: string, k: keyof MaterialEntry, v: string) =>
    setForm((f) => ({ ...f, materials: { ...f.materials, [m]: { ...f.materials[m], [k]: v } } }))

  // Live preview: admixture quantities follow the dosage, as on the server.
  const binder = cementitious(form.materials)
  const liveInput = Object.fromEntries(MATERIALS.map((m) => [m, { ...form.materials[m] }]))
  for (const [slot, dose] of [['admixture_1', form.dosage_1], ['admixture_2', form.dosage_2]] as const) {
    liveInput[slot].ssd = n(dose) === null ? '' : String(admixtureQty(binder, dose))
  }
  const live = mix(liveInput, form.batch_size)
  const fromServer = !dirty && !!trial.results?.mix
  const server = fromServer ? serverLines(trial) : null
  const lines = Object.fromEntries(live.lines.map((l) => [l.material, server?.[l.material] ?? l]))
  const sm = trial.results?.mix
  const totals = fromServer && sm
    ? { adjusted: sm.total_adjusted, batch: sm.total_batch, freeWc: sm.free_wc, totalWc: sm.total_wc, binder: sm.cementitious }
    : { adjusted: live.totalAdjusted, batch: live.totalBatch, freeWc: live.freeWc, totalWc: live.totalWc, binder: binder || null }

  const contents = project?.cementitious_contents ?? []
  const binderNum = n(totals.binder)
  const binderOk = binderNum !== null && contents.length > 0 ? contents.some((c) => Math.abs(binderNum - Number(c)) <= 50) : null
  const waterSsd = n(form.materials.water.ssd)

  // A product put on hold after it was chosen stays selectable on this trial.
  const productOptions = (current: string, saved: Trial['admixture_1']) => {
    const list = (products.data ?? []).map((p) => ({ value: p.id, label: p.label }))
    return current && saved && String(saved.id) === current && !list.some((p) => String(p.value) === current)
      ? [{ value: saved.id, label: `${saved.value} (on hold)` }, ...list] : list
  }
  const productLabel = (id: string) => [...(products.data ?? []).map((p) => ({ id: p.id, label: p.label })),
    ...[trial.admixture_1, trial.admixture_2].flatMap((x) => (x ? [{ id: x.id, label: x.value }] : []))].find((p) => String(p.id) === id)?.label ?? ''
  const gradeOptions = toOptions(grades.data)
  if (trial.grade_of_concrete && !gradeOptions.some((g) => g.value === trial.grade_of_concrete!.id)) {
    gradeOptions.push({ value: trial.grade_of_concrete.id, label: trial.grade_of_concrete.value })
  }
  const err = (k: string) => errors[k]
  const castErr = castError ?? err('cast_at')

  return (
    <Screen header={header} footer={<StepActions canSave={!readOnly} label="Mix design" />}>
      {banners}
      <Section>
        <CastAtField date={form.cast_date} time={form.cast_time} readOnly={readOnly} error={castErr}
          onChange={(d, t) => { setForm((f) => ({ ...f, cast_date: d, cast_time: t })); setCastError(null) }} />
        <Field label="Grade of concrete" error={err('grade_of_concrete')} hint={grades.isError ? 'This list could not be loaded. Go back and open the trial again.' : undefined}>
          <Picker label="Grade of concrete" placeholder="Choose grade" value={form.grade_of_concrete ? Number(form.grade_of_concrete) : null}
            options={gradeOptions} disabled={readOnly} invalid={!!err('grade_of_concrete')}
            onChange={(v) => set('grade_of_concrete', v === null ? '' : String(v))} />
        </Field>
        <Field label="Product" error={err('admixture_1')} hint={products.isError ? 'The product list could not be loaded. Go back and open the trial again.' : 'Active recipes only'}>
          <Picker label="Product" placeholder="Choose product" value={form.admixture_1 ? Number(form.admixture_1) : null}
            options={productOptions(form.admixture_1, trial.admixture_1)} disabled={readOnly} invalid={!!err('admixture_1')}
            onChange={(v) => set('admixture_1', v === null ? '' : String(v))} />
        </Field>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="Dosage" error={err('dosage_1')}>
              <TextField accessibilityLabel="Dosage, percent of binder" unit="%" keyboardType="decimal-pad" inputMode="decimal" value={form.dosage_1}
                editable={!readOnly} invalid={!!err('dosage_1')} onChangeText={(v) => set('dosage_1', v)} style={{ textAlign: 'right' }} />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Batch size" error={err('batch_size')}>
              <TextField accessibilityLabel="Batch size, cubic metres" unit="m³" keyboardType="decimal-pad" inputMode="decimal" value={form.batch_size}
                editable={!readOnly} invalid={!!err('batch_size')} onChangeText={(v) => set('batch_size', v)} style={{ textAlign: 'right' }} />
            </Field>
          </View>
        </View>
        {second || form.admixture_2 ? (
          <>
            <Field label="Second product, optional" error={err('admixture_2')}>
              <Picker label="Second product" placeholder="None" value={form.admixture_2 ? Number(form.admixture_2) : null}
                options={productOptions(form.admixture_2, trial.admixture_2)} disabled={readOnly} invalid={!!err('admixture_2')}
                onChange={(v) => set('admixture_2', v === null ? '' : String(v))} />
            </Field>
            <Field label="Second product dosage" error={err('dosage_2')}>
              <TextField accessibilityLabel="Second product dosage, percent of binder" unit="%" keyboardType="decimal-pad" inputMode="decimal"
                value={form.dosage_2} editable={!readOnly && !!form.admixture_2} invalid={!!err('dosage_2')}
                onChangeText={(v) => set('dosage_2', v)} style={{ textAlign: 'right' }} />
            </Field>
            {!readOnly && (
              <Pressable accessibilityRole="button" onPress={() => { setSecond(false); setForm((f) => ({ ...f, admixture_2: '', dosage_2: '' })) }} style={{ minHeight: TOUCH, justifyContent: 'center' }}>
                <Text style={{ fontFamily: font.semibold, fontSize: 15, color: color.link }}>Remove second product</Text>
              </Pressable>
            )}
          </>
        ) : !readOnly ? (
          <Pressable accessibilityRole="button" onPress={() => setSecond(true)} style={{ minHeight: TOUCH, justifyContent: 'center' }}>
            <Text style={{ fontFamily: font.semibold, fontSize: 15, color: color.link }}>Add a second product</Text>
          </Pressable>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Output label="Free W/C" value={totals.freeWc !== null ? f2(n(totals.freeWc)) : '–'}
            hint={waterSsd !== null && binder ? `Water ${num(waterSsd)} ÷ binder ${num(binder)}` : 'Enter water and binders'} />
          <Output label="Cementitious, kg/m³" value={binderNum ? num(binderNum) : '–'}
            hint={binderOk === null ? undefined : (
              <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                {binderOk ? <TickIcon size={13} /> : <WarnIcon size={13} />}
                <Small style={{ color: binderOk ? color.met.fg : color.below.fg, flexShrink: 1 }}>{binderOk ? 'Matches the requirement' : `Needs ${contents.join(' or ')} ± 50`}</Small>
              </View>
            )} />
        </View>
      </Section>

      <Section flush title="Materials per m³" aside={<Small>Tap a material to edit</Small>}>
        <TableHead cols={['Material', 'Adjusted, kg', 'Batch, kg', '']} template={COLS} />
        {MATERIALS.map((m) => {
          const l = lines[m]
          const entry = form.materials[m]
          const agg = AGGREGATES.includes(m)
          const admix = m === 'admixture_1' || m === 'admixture_2'
          const product = admix ? productLabel(form[m]) : ''
          if (m === 'admixture_2' && !form.admixture_2 && !l.ssd) return null
          const name = admix ? (product || MATERIAL_LABEL[m]) : m === 'cement' && entry.cement_type ? `Cement, ${entry.cement_type}` : MATERIAL_LABEL[m]
          const expanded = open === m
          const cat = sourceCategory(m)
          const unused = BINDERS.includes(m) && m !== 'cement' && !n(entry.ssd)
          return (
            <View key={m} style={{ borderTopWidth: 1, borderColor: color.divider, backgroundColor: expanded ? color.head : color.surface }}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded }}
                accessibilityLabel={`${name}, adjusted ${f2(l.adjusted) || 'not entered'} kilograms, batch ${f2(l.batch) || 'not calculated'} kilograms`}
                onPress={() => setOpen(expanded ? null : m)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 48 }}>
                <View style={cell('flex')}>
                  <Text numberOfLines={1} style={{ fontFamily: expanded ? font.semibold : font.medium, fontSize: 15, color: color.ink }}>{name}</Text>
                  {unused ? <Small>Not used in this trial</Small> : admix && !product ? <Small>Choose a product above</Small> : null}
                </View>
                <Text style={[num16, cell(92)]}>{f2(l.adjusted) || '–'}</Text>
                <Text style={[num16, cell(76), { color: color.subtle }]}>{f2(l.batch) || '–'}</Text>
                <View style={cell(22)}>
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color.muted} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <Polyline points={expanded ? '6 15 12 9 18 15' : '6 9 12 15 18 9'} />
                  </Svg>
                </View>
              </Pressable>
              {expanded && (
                <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 10 }}>
                  {admix ? (
                    <Small>{product ? `${f2(l.ssd)} kg/m³ from the dosage, as a percentage of the binder.` : 'Choose a product and dosage above.'}</Small>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Labeled label="SSD design, kg">
                        <CellInput accessibilityLabel={`${MATERIAL_LABEL[m]} SSD design, kilograms per cubic metre`} value={entry.ssd} editable={!readOnly}
                          invalid={outOfRange(entry.ssd, LIMITS.ssd)} onChangeText={(v) => setMat(m, 'ssd', v)} />
                      </Labeled>
                      {agg && (
                        <>
                          <Labeled label="Absorption, %">
                            <CellInput accessibilityLabel={`${MATERIAL_LABEL[m]} absorption, percent`} value={entry.absorption} editable={!readOnly}
                              invalid={outOfRange(entry.absorption, LIMITS.percent)} onChangeText={(v) => setMat(m, 'absorption', v)} />
                          </Labeled>
                          <Labeled label="Moisture, %">
                            <CellInput accessibilityLabel={`${MATERIAL_LABEL[m]} moisture, percent`} value={entry.moisture} editable={!readOnly}
                              invalid={outOfRange(entry.moisture, LIMITS.percent)} onChangeText={(v) => setMat(m, 'moisture', v)} />
                          </Labeled>
                        </>
                      )}
                    </View>
                  )}
                  {(agg || m === 'water') && (
                    <View style={{ flexDirection: 'row', gap: 16 }} accessibilityLiveRegion="polite">
                      <Pair k="Correction" v={l.correction === null ? '–' : `${signed(l.correction)} kg`} />
                      <Pair k="Adjusted" v={l.adjusted === null ? '–' : `${f2(l.adjusted)} kg`} />
                    </View>
                  )}
                  {m === 'water' && <Small>Reduced by the free water the aggregates bring in.</Small>}
                  {cat && (
                    <Field label="Source">
                      <Picker label={`${MATERIAL_LABEL[m]} source`} placeholder="Select source" value={entry.source || null} disabled={readOnly}
                        options={withCurrent((lists[cat].data ?? []).map((o) => ({ value: o.value, label: o.value })), entry.source)}
                        onChange={(v) => setMat(m, 'source', v ?? '')} />
                    </Field>
                  )}
                  {m === 'cement' && (
                    <Field label="Type of cement">
                      <Picker label="Type of cement" placeholder="Select type" value={entry.cement_type || null} disabled={readOnly}
                        options={withCurrent((lists.cement_grade.data ?? []).map((o) => ({ value: o.value, label: o.value })), entry.cement_type)}
                        onChange={(v) => setMat(m, 'cement_type', v ?? '')} />
                    </Field>
                  )}
                </View>
              )}
            </View>
          )
        })}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderTopWidth: 2, borderColor: color.line, backgroundColor: color.head }}>
          <Text style={[{ fontFamily: font.semibold, fontSize: 15, color: color.ink }, cell('flex')]}>Total</Text>
          <Text style={[num16, { fontFamily: font.bold }, cell(92)]}>{f2(n(totals.adjusted)) || '–'}</Text>
          <Text style={[num16, { fontFamily: font.bold }, cell(76)]}>{f2(n(totals.batch)) || '–'}</Text>
          <View style={cell(22)} />
        </View>
        <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
          <Small style={{ color: color.ink }}>Total W/C {totals.totalWc !== null ? f2(n(totals.totalWc)) : '–'}</Small>
        </View>
        <View style={{ paddingTop: 4 }}><SourceNote fromServer={fromServer} /></View>
      </Section>
      {err('materials') ? <Banner tone="error">{err('materials')}</Banner> : null}
      {!dirty && mixWarnings(trial).length ? <Banner tone="warn">{mixWarnings(trial).join(' ')}</Banner> : null}
    </Screen>
  )
}

/** Calculation warnings the server stored for the mix (negative SSD, batch size of 0). */
export function mixWarnings(t: Trial) {
  return (t.results?.errors ?? []).filter((e) => /^(SSD design|Batch size)/.test(e))
    .map((e) => e.replace(/ for (\w+) /, (_, m: string) => ` for ${(MATERIAL_LABEL[m] ?? m).toLowerCase()} `))
}

const num16 = { fontFamily: font.medium, fontSize: 15, color: color.ink, textAlign: 'right', fontVariant: ['tabular-nums'] } as const

const withCurrent = (options: { value: string; label: string }[], current: string) =>
  current && !options.some((o) => o.value === current) ? [{ value: current, label: current }, ...options] : options

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={{ fontFamily: font.regular, fontSize: 13, color: color.subtle }}>{label}</Text>
      {children}
    </View>
  )
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'baseline' }}>
      <Text style={{ fontFamily: font.regular, fontSize: 14, color: color.subtle }}>{k}</Text>
      <Text style={{ fontFamily: font.semibold, fontSize: 15, color: color.ink, fontVariant: ['tabular-nums'] }}>{v}</Text>
    </View>
  )
}
