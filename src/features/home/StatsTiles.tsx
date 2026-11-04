import { Text, View } from 'react-native'

import type { Pipeline } from '@/shared/types'
import { H2, Small } from '@/ui/kit'
import { color, font, radius } from '@/ui/theme'

import { num } from '@/features/projects/format'

/**
 * Legacy mobile dashboard "Statistics": Total Project, Total Trials, Pass %
 * and Fail % (2 decimals) and Project Potential, over everything the person
 * can see. Pass and Fail are trials closed as met and below expectation, as a
 * share of the trials closed with a conclusion.
 */
export function StatsTiles({ data, admin }: { data: Pipeline | undefined; admin: boolean }) {
  if (!data) return null
  const t = data.trial_summary
  const tiles: { label: string; value: string }[] = [
    { label: 'Total projects', value: String(data.projects) },
    ...(t ? [
      { label: 'Total trials', value: String(t.trials) },
      { label: 'Met expectation', value: `${num(t.met_percent)}%` },
      { label: 'Below expectation', value: `${num(t.below_percent)}%` },
    ] : []),
    { label: 'Project potential', value: `₹${num(data.potential_cr)} Cr` },
  ]
  return (
    <View style={{ gap: 8 }}>
      <H2>{admin ? 'Admin dashboard' : 'Sales dashboard'}</H2>
      <View accessibilityLabel="Statistics" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {tiles.map((x) => (
          <View key={x.label} accessible accessibilityLabel={`${x.label}: ${x.value}`}
            style={{ flexGrow: 1, flexBasis: '30%', minWidth: 96, backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, paddingHorizontal: 12, paddingVertical: 10, gap: 2 }}>
            <Text style={{ fontFamily: font.bold, fontSize: 20, color: color.ink }}>{x.value}</Text>
            <Small style={{ fontSize: 13 }}>{x.label}</Small>
          </View>
        ))}
      </View>
    </View>
  )
}
