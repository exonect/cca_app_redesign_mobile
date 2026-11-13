/** Attachment rules shared with the web app and the server (UAT, 13 Nov 2026): photos and videos only,
 * each under a reading time of the fresh concrete table (legacy). Photos (JPG, PNG, HEIC, HEIF, WEBP: iPhone
 * camera photos are HEIC) up to 20 MB and videos (MP4, MOV, 3GP, WEBM) up to 100 MB and 60 seconds, which the
 * server stores much smaller (photos at most 1920 px as JPEG, videos as 720p MP4). Not empty; at most 5 per
 * reading time and 45 per trial (9 times x 5). */
export const IMAGE_TYPES = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp']
export const VIDEO_TYPES = ['mp4', 'mov', 'm4v', '3gp', 'webm']
export const ATTACHMENT_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES]
export const PHOTO_MAX_MB = 20
export const VIDEO_MAX_MB = 100
export const VIDEO_MAX_SECONDS = 60
export const ATTACHMENT_MAX_PER_TRIAL = 45
export const MEDIA_MAX_PER_READING = 5

/** Content types, also for opening older files (PDF, XLSX) added before 13 Nov 2026. */
export const MIME: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4',
  heic: 'image/heic', heif: 'image/heif', webp: 'image/webp', gif: 'image/gif',
  mov: 'video/quicktime', m4v: 'video/x-m4v', '3gp': 'video/3gpp', webm: 'video/webm',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

/** duration: seconds, when the picker knows it (videos). */
export type PickedFile = { uri: string; name: string; type: string; size?: number | null; duration?: number | null }

const ext = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''
export const kindOf = (name: string): 'image' | 'video' | 'file' =>
  IMAGE_TYPES.includes(ext(name)) ? 'image' : VIDEO_TYPES.includes(ext(name)) ? 'video' : 'file'
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(bytes < 10 * 1048576 ? 1 : 0)} MB`
const secs = (s: number) => { const r = Math.round(s); return r >= 60 ? `${Math.floor(r / 60)} min ${r % 60} s` : `${r} s` }

export function attachmentProblem(f: PickedFile): string | null {
  const kind = kindOf(f.name)
  if (kind === 'file') return `${f.name}: add photos (JPG, PNG, HEIC, WEBP) or videos (MP4, MOV) here.`
  if (f.size === 0) return `${f.name} is empty.`
  const [what, max] = kind === 'image' ? ['Photos', PHOTO_MAX_MB] : ['Videos', VIDEO_MAX_MB]
  if (f.size && f.size > max * 1048576) return `${f.name}: ${what} can be up to ${max} MB. This one is ${mb(f.size)}.`
  if (kind === 'video' && f.duration && f.duration > VIDEO_MAX_SECONDS + 0.5) {
    return `${f.name}: Videos can be up to ${secs(VIDEO_MAX_SECONDS)} long. This one is ${secs(f.duration)}.`
  }
  return null
}

/** Which picked files to upload to a reading time, and why the others are skipped: bad type, size, length or
 * empty, over the time's 5 photos or videos, or over the trial's 45. */
export function planUploads(files: PickedFile[], existing: number, reading: { label: string; existing: number }): { upload: PickedFile[]; problems: string[] } {
  const problems = files.map((f) => attachmentProblem(f)).filter((x): x is string => !!x)
  const ok = files.filter((f) => !attachmentProblem(f))
  const trialRoom = Math.max(0, ATTACHMENT_MAX_PER_TRIAL - existing)
  const readingRoom = Math.max(0, MEDIA_MAX_PER_READING - reading.existing)
  if (ok.length > readingRoom && readingRoom <= trialRoom) {
    problems.push(`${reading.label}: up to ${MEDIA_MAX_PER_READING} photos or videos per reading time. Not added: ${ok.slice(readingRoom).map((f) => f.name).join(', ')}.`)
    return { upload: ok.slice(0, readingRoom), problems }
  }
  if (ok.length > trialRoom) {
    const skipped = ok.slice(trialRoom).map((f) => f.name).join(', ')
    problems.push(trialRoom === 0
      ? `A trial can have up to ${ATTACHMENT_MAX_PER_TRIAL} photos and videos. Remove one first. Not added: ${skipped}.`
      : `A trial can have up to ${ATTACHMENT_MAX_PER_TRIAL} photos and videos, so only ${trialRoom} more can be added. Not added: ${skipped}.`)
  }
  return { upload: ok.slice(0, trialRoom), problems }
}

/** Camera photos often come without a usable name; give them one the server accepts. */
export function photoName(fileName: string | null | undefined, mimeType: string | undefined, now = new Date()) {
  if (fileName && ATTACHMENT_TYPES.includes(ext(fileName))) return fileName
  const video = !!mimeType?.startsWith('video/')
  const e = Object.entries(MIME).find(([k, v]) => v === mimeType && k !== 'jpeg')?.[0] ?? (video ? 'mp4' : 'jpg')
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '_')
  return `${video ? 'Video' : 'Photo'}_${stamp}.${e}`
}

/** Multipart body for POST /trials/:id/attachments/ (React Native file part).
 * client_id, made on the phone, lets the server recognise a replayed upload;
 * reading ("0" to "240") ties the file to a reading time (legacy). */
export function attachmentForm(f: PickedFile, clientId?: string, reading?: string) {
  const form = new FormData()
  form.append('file', { uri: f.uri, name: f.name, type: f.type || MIME[ext(f.name)] || 'application/octet-stream' } as unknown as Blob)
  if (clientId) form.append('client_id', clientId)
  if (reading) form.append('reading', reading)
  return form
}

export const extOf = ext
