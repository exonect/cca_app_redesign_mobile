/**
 * Signature pad: draw with a finger (responder strokes as SVG paths),
 * then the pad view is captured to a PNG with react-native-view-shot and
 * handed back as a data URI (data:image/png;base64,...), the format the API
 * stores. An existing signature shows as an image until it is cleared. The
 * capture is a fixed 360 x 140 px so the PNG stays well under the server's
 * size limit. The parent ScrollView stops scrolling while a finger draws.
 */
import { useRef, useState, type ComponentRef } from 'react'
import { Image, Text, View, findNodeHandle, type GestureResponderEvent } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { captureRef } from 'react-native-view-shot'

import { Button } from '@/ui/kit'
import { color, font, radius } from '@/ui/theme'

import { SIGNATURE_MAX_CHARS } from './forms'

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
  // Finished strokes and the one being drawn, in one state so a release moves it over in one update.
  const [ink, setInk] = useState<{ strokes: [number, number][][]; current: [number, number][] }>({ strokes: [], current: [] })
  const [problem, setProblem] = useState<string | null>(null)
  const size = useRef({ w: WIDTH, h: HEIGHT })

  async function capture() {
    try {
      const node = findNodeHandle(pad.current)
      if (!node) throw new Error('no view')
      const b64 = await captureRef(node, { format: 'png', result: 'base64', width: WIDTH, height: HEIGHT, quality: 1 })
      const uri = `data:image/png;base64,${b64.replace(/\s/g, '')}`
      // Same limit as the server, so a save never fails on an oversized image.
      if (uri.length > SIGNATURE_MAX_CHARS) {
        setProblem('This signature image is too large. Clear it and sign again.')
        return
      }
      onChange(uri)
      setProblem(null)
    } catch {
      setProblem('The signature could not be saved. Clear it and sign again.')
    }
  }

  // The View responder props (what PanResponder wraps): a finger down starts a
  // stroke, moves inside the pad extend it, lifting it finishes the stroke.
  const handlers = disabled ? {} : {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => {
      onDrawing?.(true)
      const point: [number, number] = [e.nativeEvent.locationX, e.nativeEvent.locationY]
      setInk((i) => ({ ...i, current: [point] }))
    },
    onResponderMove: (e: GestureResponderEvent) => {
      const { locationX: x, locationY: y } = e.nativeEvent
      if (x < 0 || y < 0 || x > size.current.w || y > size.current.h) return
      setInk((i) => ({ ...i, current: [...i.current, [x, y]] }))
    },
    onResponderRelease: () => {
      onDrawing?.(false)
      setInk((i) => (i.current.length ? { strokes: [...i.strokes, i.current], current: [] } : i))
      // Capture once the finished stroke has been drawn on screen.
      setTimeout(() => { void capture() }, 60)
    },
    onResponderTerminate: () => { onDrawing?.(false) },
  }

  function clear() {
    setInk({ strokes: [], current: [] })
    setProblem(null)
    onChange('')
  }

  const inked = ink.strokes.length > 0 || ink.current.length > 0
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
            style={{ flex: 1, backgroundColor: color.surface }} {...handlers}>
            <Svg width="100%" height="100%">
              {[...ink.strokes, ink.current].filter((s) => s.length).map((s, i) => (
                <Path key={i} d={strokePath(s)} stroke={color.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              ))}
            </Svg>
            {!inked && !disabled ? <Text pointerEvents="none" style={{ position: 'absolute', left: 12, bottom: 8, fontFamily: font.regular, fontSize: 13, color: color.muted }}>Sign here</Text> : null}
            {!inked && disabled ? <Text pointerEvents="none" style={{ position: 'absolute', alignSelf: 'center', top: '42%', fontFamily: font.regular, fontSize: 14, color: color.muted }}>Not signed</Text> : null}
          </View>
        )}
      </View>
      {problem ? <Text accessibilityLiveRegion="polite" style={{ fontFamily: font.regular, fontSize: 13, color: color.error }}>{problem}</Text> : null}
      {!disabled && (value || inked) ? (
        <Button title="Clear signature" variant="tertiary" accessibilityLabel={`Clear signature of ${label}`} onPress={clear} style={{ alignSelf: 'flex-start', flexGrow: 0, paddingHorizontal: 0 }} />
      ) : null}
    </View>
  )
}
