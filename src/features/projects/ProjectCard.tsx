import { router } from 'expo-router'
import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'

import type { ProjectListItem } from '@/shared/types'
import { Body, ProjectStatusChip, Small, Strong } from '@/ui/kit'
import { color, radius } from '@/ui/theme'

import { date, num, plural } from './format'

export function projectPlace(p: Pick<ProjectListItem, 'customer_name' | 'city'>) {
  return [p.customer_name, p.city?.value].filter(Boolean).join(', ')
}

/** A tappable card as on the approved list boards: title, subtitle, chip, footer line. */
export function LinkCard({ title, subtitle, chip, left, right, onPress, label }: {
  title: string; subtitle?: string; chip?: ReactNode; left?: string; right?: string; onPress: () => void; label?: string
}) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label ?? [title, subtitle, left, right].filter(Boolean).join(', ')} onPress={onPress}
      style={({ pressed }) => ({ backgroundColor: pressed ? color.head : color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, paddingHorizontal: 16, paddingVertical: 14, gap: 8 })}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Strong style={{ fontSize: 16 }}>{title}</Strong>
          {subtitle ? <Small style={{ fontSize: 14 }}>{subtitle}</Small> : null}
        </View>
        {chip}
      </View>
      {left || right ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderColor: color.divider, paddingTop: 8 }}>
          <Body style={{ fontSize: 14, color: color.subtle, flexShrink: 1 }}>{left}</Body>
          {right ? <Strong style={{ fontSize: 14, color: color.link }}>{right}</Strong> : null}
        </View>
      ) : null}
    </Pressable>
  )
}

export function ProjectCard({ p }: { p: ProjectListItem }) {
  const trials = p.trial_count === 0 ? 'No trials yet' : plural(p.trial_count, 'trial')
  const ct = p.ct ? `CT ${p.ct.name}` : p.status === 'draft' ? '' : 'no CT assigned'
  const created = p.created_at ? `created ${date(p.created_at)}` : ''
  return (
    <LinkCard title={p.project_name || 'Untitled project'} subtitle={projectPlace(p)}
      chip={<ProjectStatusChip status={p.status} />}
      left={[trials, ct, created].filter(Boolean).join(', ')}
      right={p.potential_cr !== null ? `₹${num(p.potential_cr)} Cr` : undefined}
      label={`${p.project_name || 'Untitled project'}, ${p.status_label}. ${projectPlace(p)}. ${trials}`}
      onPress={() => router.push(`/project/${p.id}`)} />
  )
}
