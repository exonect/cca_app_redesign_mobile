import { Tabs } from 'expo-router'
import type { ColorValue } from 'react-native'
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg'

import { useUnreadCount } from '@/api/hooks'
import { color, font } from '@/ui/theme'

const icon = (kind: 'work' | 'projects' | 'search' | 'alerts' | 'more') => ({ color: c }: { color: ColorValue }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={String(c)} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {kind === 'work' && <><Rect x={4} y={4} width={16} height={16} rx={2} /><Line x1={8} y1={9} x2={16} y2={9} /><Line x1={8} y1={13} x2={16} y2={13} /><Line x1={8} y1={17} x2={12} y2={17} /></>}
    {kind === 'projects' && <Path d="M3 7h7l2 2h9v10H3z" />}
    {kind === 'search' && <><Circle cx={11} cy={11} r={7} /><Line x1={16.5} y1={16.5} x2={21} y2={21} /></>}
    {kind === 'alerts' && <><Path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9" /><Path d="M10 20a2 2 0 0 0 4 0" /></>}
    {kind === 'more' && <><Circle cx={5} cy={12} r={1.5} /><Circle cx={12} cy={12} r={1.5} /><Circle cx={19} cy={12} r={1.5} /></>}
  </Svg>
)

export default function TabsLayout() {
  const unread = useUnreadCount().data?.unread ?? 0
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: color.action,
      tabBarInactiveTintColor: color.muted,
      tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 12 },
      tabBarStyle: { borderTopColor: color.line, backgroundColor: color.surface },
    }}>
      <Tabs.Screen name="index" options={{ title: 'My work', tabBarIcon: icon('work') }} />
      <Tabs.Screen name="projects" options={{ title: 'Projects', tabBarIcon: icon('projects') }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: icon('search') }} />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts', tabBarIcon: icon('alerts'), tabBarBadge: unread ? (unread > 99 ? '99+' : unread) : undefined, tabBarBadgeStyle: { backgroundColor: color.action } }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('more') }} />
    </Tabs>
  )
}
