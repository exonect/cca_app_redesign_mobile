/** Attachment rules shared with the web app and the server: PDF, JPG, PNG,
 * XLSX or MP4, up to 25 MB each, not empty, at most 30 per trial. */
export const ATTACHMENT_TYPES = ['pdf', 'jpg', 'jpeg', 'png', 'xlsx', 'mp4']
export const ATTACHMENT_MAX_MB = 25
export const ATTACHMENT_MAX_PER_TRIAL = 30

export const MIME: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

export type PickedFile = { uri: string; name: string; type: string; size?: number | null }

const ext = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

export function attachmentProblem(f: PickedFile): string | null {
  if (!ATTACHMENT_TYPES.includes(ext(f.name))) return `${f.name} is not a PDF, JPG, PNG, XLSX or MP4 file.`
  if (f.size === 0) return `${f.name} is empty.`
  if (f.size && f.size > ATTACHMENT_MAX_MB * 1024 * 1024) return `${f.name} is over ${ATTACHMENT_MAX_MB} MB. Compress it or upload a smaller file.`
  return null
}

/** Which picked files to upload, and why the others are skipped: bad type,
 * size or empty, or over the trial's limit of 30 files. */
export function planUploads(files: PickedFile[], existing: number): { upload: PickedFile[]; problems: string[] } {
  const problems = files.map(attachmentProblem).filter((x): x is string => !!x)
  const ok = files.filter((f) => !attachmentProblem(f))
  const room = Math.max(0, ATTACHMENT_MAX_PER_TRIAL - existing)
  if (ok.length > room) {
    const skipped = ok.slice(room).map((f) => f.name).join(', ')
    problems.push(room === 0
      ? `A trial can have up to ${ATTACHMENT_MAX_PER_TRIAL} files. Remove one first. Not added: ${skipped}.`
      : `A trial can have up to ${ATTACHMENT_MAX_PER_TRIAL} files, so only ${room} more can be added. Not added: ${skipped}.`)
  }
  return { upload: ok.slice(0, room), problems }
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
