import { useState } from 'react'
import { Alert } from 'react-native'

import { errorMessage } from '@/api/errors'
import { Button } from '@/ui/kit'

import { downloadTrialExcel } from './excel'

/** Legacy project menu "Download Trial": every started or closed trial of the project, as Excel. */
export function TrialsExcelButton({ project }: { project: string }) {
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try { await downloadTrialExcel({ project }) }
    catch (e) { Alert.alert('Download failed', errorMessage(e, 'The Excel file could not be downloaded. Try again.')) }
    finally { setBusy(false) }
  }
  return <Button title="Download trials (Excel)" variant="tertiary" busy={busy} onPress={() => { void run() }} />
}
