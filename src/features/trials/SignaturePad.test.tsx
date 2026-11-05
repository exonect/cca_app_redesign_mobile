// Signature pad drawn with the View responder events (lint fix: no refs read during render).
import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { SignaturePad } from './SignaturePad'

// The test renderer has no native views: give the pad a node handle to capture.
jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native')
  return new Proxy(rn, { get: (target, key) => (key === 'findNodeHandle' ? () => 7 : target[key]) })
})
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(async () => 'iVBORw0KGgo=') }))

const at = (x: number, y: number) => ({ nativeEvent: { locationX: x, locationY: y } })

it('draws a stroke with the finger and hands back the captured PNG; Clear empties it', async () => {
  jest.useFakeTimers()
  const onChange = jest.fn()
  const onDrawing = jest.fn()
  try {
    await render(<SignaturePad label="Site QC in charge" value="" onChange={onChange} onDrawing={onDrawing} />)
    const pad = screen.getByLabelText('Signature pad for Site QC in charge. Draw with your finger to sign.')
    expect(screen.getByText('Sign here')).toBeTruthy()
    await fireEvent(pad, 'responderGrant', at(10, 10))
    await fireEvent(pad, 'responderMove', at(40, 30))
    await fireEvent(pad, 'responderMove', at(999, 30)) // outside the pad: ignored
    expect(onDrawing).toHaveBeenLastCalledWith(true)
    expect(screen.queryByText('Sign here')).toBeNull()
    await fireEvent(pad, 'responderRelease', at(40, 30))
    expect(onDrawing).toHaveBeenLastCalledWith(false)
    await act(async () => { jest.advanceTimersByTime(100) })
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByText(/could not be saved/)).toBeNull()
    expect(onChange).toHaveBeenLastCalledWith('data:image/png;base64,iVBORw0KGgo=')
    await fireEvent.press(screen.getByRole('button', { name: 'Clear signature of Site QC in charge' }))
    expect(onChange).toHaveBeenLastCalledWith('')
    expect(screen.getByText('Sign here')).toBeTruthy()
  } finally {
    jest.useRealTimers()
  }
})

it('takes no strokes when read only', async () => {
  await render(<SignaturePad label="Thermax R&D" value="" onChange={jest.fn()} disabled />)
  const pad = screen.getByLabelText('Signature of Thermax R&D, not signed')
  expect(pad.props.onResponderGrant).toBeUndefined()
  expect(screen.getByText('Not signed')).toBeTruthy()
})
