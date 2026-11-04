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

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'download'

export async function downloadAndShare(path: string, filename: string, mimeType: string) {
  // A cheap authenticated call first: it refreshes an expired access token silently.
  await api('/auth/me/')
  const token = session.accessToken()
  const dir = new Directory(Paths.cache, 'downloads')
  dir.create({ intermediates: true, idempotent: true })
  const target = new File(dir, safeName(filename))
  let file: File
  try {
    file = await File.downloadFileAsync(`${session.baseUrl}${path}`, target, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      idempotent: true,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/\b404\b/.test(msg)) throw new Error('The file was not found. It may have been removed.')
    if (/\b40[13]\b/.test(msg)) throw new Error('You cannot download this file. Sign in again if your session ended.')
    if (/\b5\d\d\b/.test(msg)) throw new Error('The server could not make the file. Try again.')
    throw new Error('The file could not be downloaded. Check your mobile data or Wi-Fi and try again.')
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.')
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename, UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined })
}
