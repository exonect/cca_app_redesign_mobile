// Legacy mobile dashboard statistics: projects, trials, met and below % with 2 decimals, potential.
import { fireEvent, render, screen } from '@testing-library/react-native'

import { StatsTiles } from './StatsTiles'

it('shows the five statistics tiles', async () => {
  await render(<StatsTiles admin data={{
    stages: [], projects: 12, potential_cr: '48.5',
    trial_summary: { trials: 9, total: 6, met: 4, below: 2, open: 3, met_percent: 66.67, below_percent: 33.33 },
  }} />)
  expect(screen.getByText('Admin dashboard')).toBeTruthy()
  expect(screen.getByLabelText('Total projects: 12')).toBeTruthy()
  expect(screen.getByLabelText('Total trials: 9')).toBeTruthy()
  expect(screen.getByLabelText('Met expectation: 66.67%')).toBeTruthy()
  expect(screen.getByLabelText('Below expectation: 33.33%')).toBeTruthy()
  expect(screen.getByLabelText('Project potential: ₹48.50 Cr')).toBeTruthy()
})

it('shows nothing until the figures load, and no trial tiles from an older server', async () => {
  const { rerender } = await render(<StatsTiles admin={false} data={undefined} />)
  expect(screen.queryByText('Sales dashboard')).toBeNull()
  await rerender(<StatsTiles admin={false} data={{ stages: [], projects: 2, potential_cr: 0 }} />)
  expect(screen.getByText('Sales dashboard')).toBeTruthy()
  expect(screen.queryByLabelText(/Total trials/)).toBeNull()
})

it('says when the figures could not be loaded, with Try again (audit round 2)', async () => {
  const onRetry = jest.fn()
  await render(<StatsTiles admin={false} data={undefined} onRetry={onRetry}
    error={Object.assign(new Error('x'), { status: 503, code: 'server_error', fields: {} })} />)
  expect(screen.getByText('Sales dashboard')).toBeTruthy()
  expect(screen.getByText('Something went wrong on the server. Try again.')).toBeTruthy()
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
  expect(onRetry).toHaveBeenCalled()
})
