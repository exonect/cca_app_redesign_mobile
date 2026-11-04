import { Text, View } from 'react-native'

import type { Recipe } from '@/shared/types'
import { Small, Strong } from '@/ui/kit'
import { color, font } from '@/ui/theme'

import { segments } from './balance'

export function RecipeStatusChip({ status }: { status: Recipe['status'] }) {
  const on = status === 'active'
  return (
    <View style={{ alignSelf: 'center', height: 24, paddingHorizontal: 9, borderRadius: 12, justifyContent: 'center', backgroundColor: on ? color.met.bg : color.below.bg }}>
      <Text style={{ fontFamily: font.semibold, fontSize: 12, color: on ? color.met.fg : color.below.fg }}>{on ? 'Active' : 'On hold'}</Text>
    </View>
  )
}

const pct = (x: number) => `${Number.isInteger(x) ? x : x.toFixed(2)}%`

/** Stacked bar of the largest RM codes with J000 last, and the code list under it. */
export function CompositionView({ components, total }: { components: Record<string, string | number>; total?: string | number }) {
  const segs = segments(components)
  const all = Object.entries(components).filter(([k]) => k.toUpperCase() !== 'J000').length + 1
  const spoken = segs.map((s) => `${s.code} ${pct(s.pct)}${s.note && s.code !== 'J000' ? `, ${s.note}` : s.code === 'J000' ? ' balance' : ''}`).join(', ')
  return (
    <View style={{ gap: 10 }}>
      <Small>{all} codes, J000 balances to 100</Small>
      <View accessible accessibilityRole="image" accessibilityLabel={`Composition bar: ${spoken}.`}
        style={{ flexDirection: 'row', height: 22, borderRadius: 6, overflow: 'hidden', backgroundColor: color.head }}>
        {segs.filter((s) => s.pct > 0).map((s) => <View key={s.code} style={{ flex: s.pct, backgroundColor: s.color }} />)}
      </View>
      <View>
        {segs.map((s) => (
          <View key={s.code} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36, borderBottomWidth: 1, borderColor: color.divider }}>
            <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: s.color }} />
            <Text style={{ flex: 1, fontFamily: font.semibold, fontSize: 15, color: color.ink }}>
              {s.code}{s.note ? <Text style={{ fontFamily: font.regular, color: color.muted }}>{s.code === 'J000' ? ', balance' : `, ${s.note}`}</Text> : null}
            </Text>
            <Strong>{pct(s.pct)}</Strong>
          </View>
        ))}
        <View style={{ flexDirection: 'row', minHeight: 40, alignItems: 'center', borderTopWidth: 2, borderColor: color.ink }}>
          <Strong style={{ flex: 1 }}>Total</Strong>
          <Strong>{pct(Number(total ?? 100))}</Strong>
        </View>
      </View>
    </View>
  )
}
