/**
 * Download a protected file (trial PDF, attachment) with the bearer token,
 * then hand it to the share sheet so the person can open, save or send it.
 * expo-file-system SDK 58 API: File.downloadFileAsync(url, destination,
 * { headers, idempotent }) rejects on a non 2xx status with the code in the
 * message, and creates no file in that case.
 */
import { Directory, File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'

import { api, session } from '@/api/client'
import { UserError } from '@/api/errors'

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'download'

export async function downloadAndShare(path: string, filename: string, mimeType: string) {
  // A cheap authenticated call first: it refreshes an expired access token silently.
  await api('/auth/me/')
  const token = session.accessToken()
  let target: File
  try {
    const dir = new Directory(Paths.cache, 'downloads')
    dir.create({ intermediates: true, idempotent: true })
    target = new File(dir, safeName(filename))
  } catch {
    throw new UserError('There is no room to save the file on this phone. Free some space and try again.')
  }
  let file: File
  try {
    file = await File.downloadFileAsync(`${session.baseUrl}${path}`, target, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      idempotent: true,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/\b404\b/.test(msg)) throw new UserError('The file was not found. It may have been removed.')
    if (/\b40[13]\b/.test(msg)) throw new UserError('You cannot download this file. Sign in again if your session ended.')
    if (/\b409\b/.test(msg)) throw new UserError('The file cannot be made yet. Check the trial and try again.')
    if (/\b5\d\d\b/.test(msg)) throw new UserError('The server could not make the file. Try again.')
    throw new UserError('The file could not be downloaded. Check your mobile data or Wi-Fi and try again.')
  }
  if (!(await Sharing.isAvailableAsync().catch(() => false))) throw new UserError('Sharing is not available on this device.')
  try {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename, UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined })
  } catch {
    throw new UserError('The file was downloaded but could not be shared. Try again.')
  }
}
