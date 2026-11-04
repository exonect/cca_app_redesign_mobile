/**
 * What a screen shows when it crashes while rendering (Expo Router catches
 * the error through the ErrorBoundary each route exports). Plain React
 * Native only: the root boundary renders outside every provider.
 */
import { router, type ErrorBoundaryProps } from 'expo-router'
import { Pressable, Text, View } from 'react-native'

import { color, font, radius, TOUCH } from './theme'

export function ScreenErrorBoundary({ retry }: ErrorBoundaryProps) {
  const home = () => {
    void retry()
    try { router.replace('/') } catch { /* the navigator is not ready; Try again still works */ }
  }
  return (
    <View accessibilityRole="alert" style={{ flex: 1, backgroundColor: color.concrete, padding: 24, paddingTop: 72, gap: 12 }}>
      <Text accessibilityRole="header" style={{ fontFamily: font.condBold, fontSize: 26, color: color.ink }}>This screen stopped working</Text>
      <Text style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: color.subtle }}>
        Something unexpected went wrong. Your saved work is safe. Try again, or go back to My work.
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, paddingTop: 8 }}>
        <Action title="Try again" primary onPress={() => { void retry() }} />
        <Action title="Go to My work" onPress={home} />
      </View>
    </View>
  )
}

function Action({ title, onPress, primary }: { title: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}
      style={{ flex: 1, minHeight: Math.max(TOUCH, 48), borderRadius: radius.field, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
        borderColor: primary ? color.action : color.ink, backgroundColor: primary ? color.action : color.surface }}>
      <Text style={{ fontFamily: font.semibold, fontSize: 15, color: primary ? '#fff' : color.ink }}>{title}</Text>
    </Pressable>
  )
}
