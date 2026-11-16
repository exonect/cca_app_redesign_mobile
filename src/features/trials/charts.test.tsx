import { fireEvent, render, screen } from '@testing-library/react-native'

import { GradingChart, RetentionChart } from './charts'

const points = [{ sieve: '0.15', combined: 7.2 }, { sieve: '4.75', combined: 40.6 }, { sieve: '20', combined: 100 }]
const limits: Record<string, [number, number]> = { '0.15': [0, 5], '4.75': [30, 50], '20': [95, 100] }

describe('chart readouts (UAT, 16 Nov 2026)', () => {
  it('grading: tapping a point shows its value, the IS 383 limit and the verdict', async () => {
    await render(<GradingChart points={points} limits={limits} />)
    expect(screen.getByText('Tap a point to see its value.')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('point-150 µm sieve'))
    expect(screen.getByText('150 µm sieve')).toBeTruthy()
    expect(screen.getByText('7.20% passing')).toBeTruthy()
    expect(screen.getByText('IS 383 limit 0 to 5%')).toBeTruthy()
    expect(screen.getByText('Above the limit by 2.20%')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('point-4.75 mm sieve'))
    expect(screen.getByText('Within the limit')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('point-4.75 mm sieve'))
    expect(screen.getByText('Tap a point to see its value.')).toBeTruthy()
  })

  it('grading: screen readers get every value and verdict in the label', async () => {
    await render(<GradingChart points={points} limits={limits} />)
    expect(screen.getByLabelText(/^Combined grading: 150 µm sieve, 7.20% passing, IS 383 limit 0 to 5%, Above the limit by 2.20%\./)).toBeTruthy()
  })

  it('retention: change since initial and the target check at its time', async () => {
    await render(<RetentionChart label="Slump" readings={[{ minutes: 0, mm: 180 }, { minutes: 60, mm: 150 }]}
      target={{ minutes: 60, hours: '1', mm: 120, tolerance: 25 }} />)
    await fireEvent.press(screen.getByTestId('point-60 min'))
    expect(screen.getByText('Slump 150 mm')).toBeTruthy()
    expect(screen.getByText('Lost 30 mm since initial')).toBeTruthy()
    expect(screen.getByText('Target 95 to 145 mm at 1 h')).toBeTruthy()
    expect(screen.getByText('Above the target by 5 mm')).toBeTruthy()
    expect(screen.getByText('Outside the target')).toBeTruthy()
  })
})
