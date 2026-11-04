/**
 * Signature pad: draw with a finger (PanResponder strokes as SVG paths),
 * then the pad view is captured to a PNG with react-native-view-shot and
 * handed back as a data URI (data:image/png;base64,...), the format the API
 * stores. An existing signature shows as an image until it is cleared. The
 * capture is a fixed 360 x 140 px so the PNG stays well under the server's
 * size limit. The parent ScrollView stops scrolling while a finger draws.
 */
import { useMemo, useRef, useState, type ComponentRef } from 'react'
import { Image, PanResponder, Text, View, findNodeHandle } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { captureRef } from 'react-native-view-shot'

import { Button, Small } from '@/ui/kit'
import { color, font, radius } from '@/ui/theme'

const WIDTH = 360
const HEIGHT = 140

/** Turns a list of points into an SVG path ("M x y L x y ..."). */
export function strokePath(points: [number, number][]) {
  if (!points.length) return ''
  const [first, ...rest] = points
  const r = (v: number) => Math.round(v * 10) / 10
  // A single tap still leaves a dot.
  if (!rest.length) return `M${r(first[0])} ${r(first[1])} l0.1 0`
  return `M${r(first[0])} ${r(first[1])}${rest.map(([x, y]) => ` L${r(x)} ${r(y)}`).join('')}`
}

export function SignaturePad({ label, value, onChange, disabled, onDrawing }: {
  label: string; value: string; onChange: (dataUri: string) => void; disabled?: boolean
  /** True while a finger is on the pad, so the screen can stop scrolling. */
  onDrawing?: (drawing: boolean) => void
}) {
  const pad = useRef<ComponentRef<typeof View>>(null)
  const [strokes, setStrokes] = useState<[number, number][][]>([])
  const current = useRef<[number, number][]>([])
  const [, redraw] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const size = useRef({ w: WIDTH, h: HEIGHT })

  async function capture() {
    try {
      const node = findNodeHandle(pad.current)
      if (!node) throw new Error('no view')
      const b64 = await captureRef(node, { format: 'png', result: 'base64', width: WIDTH, height: HEIGHT, quality: 1 })
      onChange(`data:image/png;base64,${b64.replace(/\s/g, '')}`)
      setProblem(null)
    } catch {
      setProblem('The signature could not be saved. Clear it and sign again.')
    }
  }

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      onDrawing?.(true)
      current.current = [[e.nativeEvent.locationX, e.nativeEvent.locationY]]
      redraw((x) => x + 1)
    },
    onPanResponderMove: (e) => {
      const { locationX: x, locationY: y } = e.nativeEvent
      if (x < 0 || y < 0 || x > size.current.w || y > size.current.h) return
      current.current.push([x, y])
      redraw((v) => v + 1)
    },
    onPanResponderRelease: () => {
      onDrawing?.(false)
      const done = current.current
      current.current = []
      if (done.length) {
        setStrokes((s) => [...s, done])
        // Capture after the finished stroke is on screen.
        requestAnimationFrame(() => { capture() })
      }
    },
    onPanResponderTerminate: () => { onDrawing?.(false) },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [disabled])

  function clear() {
    setStrokes([])
    current.current = []
    setProblem(null)
    onChange('')
  }

  const inked = strokes.length > 0 || current.current.length > 0
  const showSaved = !!value && !inked

  return (
    <View style={{ gap: 6 }}>
      <View
        style={{ width: '100%', maxWidth: WIDTH, aspectRatio: WIDTH / HEIGHT, borderRadius: radius.field, borderWidth: 1, borderColor: color.field, overflow: 'hidden', backgroundColor: color.surface }}>
        {showSaved ? (
          <Image source={{ uri: value }} accessibilityLabel={`Signature of ${label}`} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
        ) : (
          <View ref={pad} collapsable={false} accessible accessibilityRole="image"
            accessibilityLabel={disabled ? `Signature of ${label}, not signed` : `Signature pad for ${label}. Draw with your finger to sign.`}
            onLayout={(e) => { size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height } }}
            style={{ flex: 1, backgroundColor: color.surface }} {...(disabled ? {} : responder.panHandlers)}>
            <Svg width="100%" height="100%">
              {[...strokes, current.current].filter((s) => s.length).map((s, i) => (
                <Path key={i} d={strokePath(s)} stroke={color.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              ))}
            </Svg>
            {!inked && !disabled ? <Text pointerEvents="none" style={{ position: 'absolute', left: 12, bottom: 8, fontFamily: font.regular, fontSize: 13, color: color.muted }}>Sign here</Text> : null}
            {!inked && disabled ? <Text pointerEvents="none" style={{ position: 'absolute', alignSelf: 'center', top: '42%', fontFamily: font.regular, fontSize: 14, color: color.muted }}>Not signed</Text> : null}
          </View>
        )}
      </View>
      {problem ? <Small style={{ color: color.error }}>{problem}</Small> : null}
      {!disabled && (value || inked) ? (
        <Button title="Clear signature" variant="tertiary" accessibilityLabel={`Clear signature of ${label}`} onPress={clear} style={{ alignSelf: 'flex-start', flexGrow: 0, paddingHorizontal: 0 }} />
      ) : null}
    </View>
  )
}
