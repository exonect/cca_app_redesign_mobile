/**
 * Durable storage for the offline layer: small JSON documents (the change
 * queue, the saved query cache, the last signed in user) and the photos and
 * files waiting to upload. Everything lives in the app's document directory,
 * which the OS keeps across restarts and updates (the cache directory may be
 * cleared under storage pressure, so nothing waiting to sync goes there).
 *
 * expo-file-system SDK 58 object API: Paths.document, Directory, File with
 * text(), write(), copy(), move(), delete() and exists.
 */
import { Directory, File, Paths } from 'expo-file-system'

export type Storage = {
  /** The document, or null when there is none. Rejects when it exists but cannot be read
   * (iOS data protection before the first unlock, for example), so a caller never
   * mistakes an unreadable document for an empty one and saves over it. */
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

/** Writes of the same document, one after another (the cache timer and a
 * save on going to the background can overlap; interleaved they could delete it). */
const writing = new Map<string, Promise<void>>()

export function fileStorage(): Storage {
  return {
    async read(name) {
      const dir = root()
      const f = new File(dir, name)
      if (f.exists) return await f.text()
      // Killed while the new copy was being moved into place: the complete new copy is the temporary file.
      const tmp = new File(dir, `${name}.tmp`)
      return tmp.exists ? await tmp.text() : null
    },
    write(name, text) {
      const run = (writing.get(name) ?? Promise.resolve()).catch(() => undefined).then(async () => {
        const dir = root()
        const target = new File(dir, name)
        const left = new File(dir, `${name}.tmp`)
        // Only the temporary file is ever replaced before the move: the document itself stays until the move overwrites it.
        if (left.exists) {
          if (!target.exists) await left.move(target) // a copy left by a crash mid move: keep it as the document first
          else left.delete()
        }
        const tmp = new File(dir, `${name}.tmp`) // move() repoints the File it is called on, so a fresh one
        tmp.create()
        await tmp.write(text)
        await tmp.move(target, { overwrite: true })
      })
      writing.set(name, run)
      void run.then(() => undefined, () => undefined).then(() => { if (writing.get(name) === run) writing.delete(name) })
      return run
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
 * location into the document directory, so they survive a restart. The queue
 * stores only the file's name: the app's directory path changes when iOS
 * updates the app, so a stored full path would no longer point at the file. */
export type FileKeeper = {
  /** Keeps a copy and returns its name, to store with the change. */
  keep(uri: string, clientId: string, name: string): Promise<string>
  /** Where a kept file is now. Takes the stored name, or a full path stored by
   * an earlier version (only its name is used). */
  uriOf(stored: string): string
  drop(stored: string): Promise<void>
}

function filesDir(): Directory {
  const dir = new Directory(root(), 'files')
  dir.create({ intermediates: true, idempotent: true })
  return dir
}

const baseName = (stored: string) => stored.slice(stored.lastIndexOf('/') + 1)

export const fileKeeper: FileKeeper = {
  async keep(uri, clientId, name) {
    const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : 'bin'
    const kept = `${clientId}.${ext}`
    const target = new File(filesDir(), kept)
    if (!target.exists) await new File(uri).copy(target)
    return kept
  },
  uriOf(stored) {
    return new File(filesDir(), baseName(stored)).uri
  },
  async drop(stored) {
    try {
      const f = new File(filesDir(), baseName(stored))
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
