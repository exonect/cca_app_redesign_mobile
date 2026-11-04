// Trial Excel for one project or one trial goes through the authenticated download and share sheet.
const mockShare = jest.fn()
jest.mock('./download', () => ({ downloadAndShare: (...a: unknown[]) => mockShare(...a) }))

import { downloadTrialExcel, XLSX } from './excel'

it('asks the server for one project or one trial, with the legacy file name', async () => {
  await downloadTrialExcel({ project: 'p 1' })
  expect(mockShare).toHaveBeenCalledWith('/exports/trials.xlsx?project=p%201', expect.stringMatching(/^trial_data_\d{4}-\d{2}-\d{2}\.xlsx$/), XLSX)
  await downloadTrialExcel({ trial: 't-1' })
  expect(mockShare).toHaveBeenLastCalledWith('/exports/trials.xlsx?id=t-1', expect.any(String), XLSX)
})
