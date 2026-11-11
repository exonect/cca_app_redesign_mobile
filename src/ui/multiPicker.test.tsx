// MultiPicker: the searchable multi select used for the long master lists on the project form.
import { fireEvent, render, screen } from '@testing-library/react-native'
import { useState } from 'react'

import { matchOptions } from '@/shared/matchOptions'

import { MultiPicker } from './kit'

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)

const grades = ['M25', 'M30', 'M30 ssc', 'M130', 'M40pqc'].map((label, i) => ({ value: i + 1, label }))

function Harness({ start = [] as number[], max, options = grades }: { start?: number[]; max?: number; options?: typeof grades }) {
  const [value, setValue] = useState(start)
  return <MultiPicker label="Grade of concrete" options={options} value={value} onChange={setValue} max={max} />
}
const field = () => screen.getByRole('button', { name: /^Grade of concrete:/ })

describe('matchOptions', () => {
  it('finds by start first, then anywhere, ignoring case and spaces', () => {
    expect(matchOptions(grades, '30').map((o) => o.label)).toEqual(['M30', 'M30 ssc', 'M130'])
    expect(matchOptions(grades, 'm30SSC').map((o) => o.label)).toEqual(['M30 ssc'])
    expect(matchOptions(grades, '')).toHaveLength(5)
  })
})

describe('MultiPicker', () => {
  it('shows no list until tapped, then searches and ticks several values', async () => {
    await render(<Harness />)
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(field().props.accessibilityLabel).toBe('Grade of concrete: none chosen')
    await fireEvent.press(field())
    expect(screen.getAllByRole('checkbox')).toHaveLength(5)
    await fireEvent.changeText(screen.getByLabelText('Search Grade of concrete'), 'm30')
    expect(screen.getAllByRole('checkbox').map((c) => c.props.accessibilityLabel)).toEqual(['M30', 'M30 ssc'])
    await fireEvent.press(screen.getByRole('checkbox', { name: 'M30' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: 'M30 ssc' }))
    expect(screen.getByText('2 selected')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(field().props.accessibilityLabel).toBe('Grade of concrete: M30, M30 ssc')
  })

  it('removes a tag with its × and clears everything from the list', async () => {
    await render(<Harness start={[1, 2, 3]} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Remove M30' }))
    expect(field().props.accessibilityLabel).toBe('Grade of concrete: M25, M30 ssc')
    await fireEvent.press(field())
    await fireEvent.press(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByText('0 selected')).toBeTruthy()
  })

  it('stops at the maximum but lets a chosen value be unticked', async () => {
    await render(<Harness start={[1, 2]} max={2} />)
    await fireEvent.press(field())
    expect(screen.getByRole('checkbox', { name: 'M130' }).props.accessibilityState).toMatchObject({ disabled: true })
    await fireEvent.press(screen.getByRole('checkbox', { name: 'M25' }))
    expect(screen.getByText('1 selected, up to 2')).toBeTruthy()
  })

  it('says when nothing matches', async () => {
    await render(<Harness />)
    await fireEvent.press(field())
    await fireEvent.changeText(screen.getByLabelText('Search Grade of concrete'), 'zzz')
    expect(screen.getByText('Nothing matches "zzz".')).toBeTruthy()
  })
})
