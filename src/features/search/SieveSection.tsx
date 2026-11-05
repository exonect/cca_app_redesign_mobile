import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import { Button, H2, NumberField, s, Small, Strong } from '@/ui/kit'
import { color, font, radius, TOUCH } from '@/ui/theme'

import { badSieveCells, combinedGrading, GRADING_MATERIALS, GRADING_SIEVES, readSieve, writeSieve, type SieveInput } from './criteria'

// The 8 all in grading sieves in two rows of four, so a phone needs no sideways scroll.
const SIEVE_ROWS = [GRADING_SIEVES.slice(0, 4), GRADING_SIEVES.slice(4)]

/**
 * Legacy "Sieve analysis" step, as on the web: % passing per aggregate and the
 * proportions give the all in grading, which past trials must equal on every
 * sieve. `value` is the criteria's JSON text (writeSieve). `error` is the first
 * problem (client or server); `serverGrading` marks a sieve's All in value the
 * server refused.
 */
export function SieveSection({ value, error, serverGrading = {}, onChange }: {
  value: string; error?: string; serverGrading?: Record<string, string>; onChange: (v: string) => void
}) {
  const input = readSieve(value)
  const [open, setOpen] = useState(value !== '' || Boolean(error))
  const grading = combinedGrading(input)
  const bad = error ? badSieveCells(input) : { proportions: [], passing: {}, allIn: [] }
  const update = (next: SieveInput) => onChange(writeSieve(next))
  const setProportion = (m: string, v: string) => update({ ...input, proportions: { ...input.proportions, [m]: v } })
  const setPassing = (m: string, sv: string, v: string) =>
    update({ ...input, passing: { ...input.passing, [m]: { ...(input.passing[m] ?? {}), [sv]: v } } })

  return (
    <View style={{ gap: 12, paddingTop: 12, borderTopWidth: 1, borderColor: color.divider }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <H2>Sieve analysis</H2>
        <Small>Exact, 2 decimals</Small>
      </View>
      <Small>Optional. Enter % passing for each aggregate and the proportions; past trials must have this all in grading on every sieve.</Small>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}
        accessibilityLabel={open ? 'Hide sieve analysis' : 'Add sieve analysis'}
        style={{ minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}>
        <Text style={{ fontFamily: font.semibold, fontSize: 15, color: color.link }}>{open ? 'Hide sieve analysis' : 'Add sieve analysis'}</Text>
        <Text style={{ color: color.link, fontSize: 16 }}>{open ? '⌃' : '⌄'}</Text>
      </Pressable>

      {open ? (
        <View style={{ gap: 14 }}>
          {GRADING_MATERIALS.map((m) => (
            <View key={m.key} style={{ gap: 8, padding: 12, borderRadius: radius.card, borderWidth: 1, borderColor: color.line }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Strong style={{ flex: 1 }}>{m.label}</Strong>
                <Small>Proportion</Small>
                <View style={{ width: 104 }}>
                  <NumberField accessibilityLabel={`${m.label} proportion, %`} unit="%" value={input.proportions[m.key] ?? ''}
                    invalid={bad.proportions.includes(m.key)} onChangeText={(t) => setProportion(m.key, t)} />
                </View>
              </View>
              <Small>% passing</Small>
              {SIEVE_ROWS.map((row, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 6 }}>
                  {row.map((sv) => (
                    <View key={sv.key} style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontFamily: font.regular, fontSize: 12, color: color.muted }}>{sv.label}</Text>
                      <NumberField accessibilityLabel={`${m.label} passing ${sv.label}, %`} value={input.passing[m.key]?.[sv.key] ?? ''}
                        invalid={Boolean(bad.passing[m.key]?.includes(sv.key))} style={{ fontSize: 15 }}
                        onChangeText={(t) => setPassing(m.key, sv.key, t)} />
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ))}

          <View style={{ gap: 8, padding: 12, borderRadius: radius.card, backgroundColor: color.head }}>
            <Strong>All in grading, % passing</Strong>
            {SIEVE_ROWS.map((row, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 6 }}>
                {row.map((sv) => {
                  const v = grading ? grading[sv.key] : null
                  const flagged = bad.allIn.includes(sv.key) || Boolean(serverGrading[sv.key])
                  return (
                    <View key={sv.key} accessible accessibilityLabel={`All in passing ${sv.label}, ${v === null ? 'not entered' : `${v}%`}${flagged ? ', needs attention' : ''}`}
                      style={{ flex: 1, gap: 2, padding: 6, borderRadius: radius.field, borderWidth: flagged ? 2 : 1, borderColor: flagged ? color.error : color.line, backgroundColor: color.surface }}>
                      <Text style={{ fontFamily: font.regular, fontSize: 12, color: color.muted }}>{sv.label}</Text>
                      <Text style={{ fontFamily: font.bold, fontSize: 15, color: color.ink, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{v ?? '–'}</Text>
                    </View>
                  )
                })}
              </View>
            ))}
          </View>

          {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.error}>{error}</Text> : null}
          <Button title="Clear sieve analysis" variant="tertiary" onPress={() => onChange('')} style={{ flexGrow: 0, alignSelf: 'flex-start' }} />
        </View>
      ) : error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.error}>{error}</Text> : null}
    </View>
  )
}
