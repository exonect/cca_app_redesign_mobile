/** Attachment rules shared with the web app and the server: PDF, JPG, PNG,
 * XLSX or MP4, up to 25 MB each. */
export const ATTACHMENT_TYPES = ['pdf', 'jpg', 'jpeg', 'png', 'xlsx', 'mp4']
export const ATTACHMENT_MAX_MB = 25

export const MIME: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

export type PickedFile = { uri: string; name: string; type: string; size?: number | null }

const ext = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

export function attachmentProblem(f: PickedFile): string | null {
  if (!ATTACHMENT_TYPES.includes(ext(f.name))) return `${f.name} is not a PDF, JPG, PNG, XLSX or MP4 file.`
  if (f.size && f.size > ATTACHMENT_MAX_MB * 1024 * 1024) return `${f.name} is over ${ATTACHMENT_MAX_MB} MB. Compress it or upload a smaller file.`
  return null
}

/** Camera photos often come without a usable name; give them one the server accepts. */
export function photoName(fileName: string | null | undefined, mimeType: string | undefined, now = new Date()) {
  if (fileName && ATTACHMENT_TYPES.includes(ext(fileName))) return fileName
  const e = mimeType === 'image/png' ? 'png' : 'jpg'
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '_')
  return `Photo_${stamp}.${e}`
}

/** Multipart body for POST /trials/:id/attachments/ (React Native file part). */
export function attachmentForm(f: PickedFile) {
  const form = new FormData()
  form.append('file', { uri: f.uri, name: f.name, type: f.type || MIME[ext(f.name)] || 'application/octet-stream' } as unknown as Blob)
  return form
}

export const extOf = ext
