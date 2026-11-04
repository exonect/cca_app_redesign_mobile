/**
 * Trial Excel (legacy "Download Trial" on a project and "Download in Excel"
 * on a trial): the server's Trial Summary Report, drafts excluded, shared
 * through the share sheet like the PDF.
 */
import { downloadAndShare } from './download'

export const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())

export function downloadTrialExcel(by: { project: string } | { trial: string }) {
  const query = 'project' in by ? `project=${encodeURIComponent(by.project)}` : `id=${encodeURIComponent(by.trial)}`
  return downloadAndShare(`/exports/trials.xlsx?${query}`, `trial_data_${today()}.xlsx`, XLSX)
}
