/**
 * Durable storage for the offline layer: small JSON documents (the change
 * queue, the saved query cache, the last signed in user) and the photos and
 * files waiting to upload. Everything lives in the app's document directory,
 * which the OS keeps across restarts and updates (the cache directory may be
 * cleared under storage pressure, so nothing waiting to sync goes there).
 *
 * expo-file-system SDK 58 object API: Paths.document, Directory, File with
 * text(), write(), copy(), delete() and exists.
 */
import { Directory, File, Paths } from 'expo-file-system'

export type Storage = {
  read(name: string): Promise<string | null>
  /** Replaces the document. Written to a temporary file first, then moved, so a crash never leaves half a file. */
  write(name: string, text: string): Promise<void>
  remove(name: string): Promise<void>
}

const ROOT = 'cca-offline'

function root(): Directory {
  const dir = new Directory(Paths.document, ROOT)
  dir.create({ intermediates: true, idempotent: true })
  return dir
}

export function fileStorage(): Storage {
  return {
    async read(name) {
      try {
        const f = new File(root(), name)
        return f.exists ? await f.text() : null
      } catch {
        return null
      }
    },
    async write(name, text) {
      const dir = root()
      const tmp = new File(dir, `${name}.tmp`)
      if (tmp.exists) tmp.delete()
      tmp.create()
      await tmp.write(text)
      const target = new File(dir, name)
      if (target.exists) target.delete()
      await tmp.move(target)
    },
    async remove(name) {
      try {
        const f = new File(root(), name)
        if (f.exists) f.delete()
      } catch { /* already gone */ }
    },
  }
}

export function memoryStorage(initial: Record<string, string> = {}): Storage & { docs: Record<string, string> } {
  const docs: Record<string, string> = { ...initial }
  return {
    docs,
    async read(name) { return name in docs ? docs[name] : null },
    async write(name, text) { docs[name] = text },
    async remove(name) { delete docs[name] },
  }
}

/** Files waiting to upload: copied out of the camera or picker's temporary
 * location into the document directory, so they survive a restart. */
export type FileKeeper = {
  keep(uri: string, clientId: string, name: string): Promise<string>
  drop(uri: string): Promise<void>
}

export const fileKeeper: FileKeeper = {
  async keep(uri, clientId, name) {
    const dir = new Directory(root(), 'files')
    dir.create({ intermediates: true, idempotent: true })
    const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : 'bin'
    const target = new File(dir, `${clientId}.${ext}`)
    if (target.exists) return target.uri
    await new File(uri).copy(target)
    return target.uri
  },
  async drop(uri) {
    try {
      const f = new File(uri)
      if (f.exists) f.delete()
    } catch { /* already gone */ }
  },
}

let shared: Storage | null = null
/** The app's store: the document directory, or memory if the file system cannot be used. */
export function offlineStorage(): Storage {
  if (shared) return shared
  try {
    new Directory(Paths.document, ROOT) // throws when the native module is missing
    shared = fileStorage()
  } catch {
    shared = memoryStorage()
  }
  return shared
}
