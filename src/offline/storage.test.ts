// The document store and the kept upload files on a simulated file system:
// a crash part way through a save, overlapping saves, a file that cannot be
// read, and kept files after the app's folder moves (an iOS update).
import { fileKeeper, fileStorage } from './storage'

const mockFs = new Map<string, string>()
const mockUnreadable = new Set<string>()
let mockCrashOnMove = false
let mockDocument = 'file:///var/app-A/Documents'

jest.mock('expo-file-system', () => {
  const tick = () => new Promise((r) => setTimeout(r, Math.floor(Math.random() * 4)))
  const join = (a: unknown, b?: string) => (typeof a === 'string' ? a : (a as { uri: string }).uri) + (b ? `/${b}` : '')
  class Directory { uri: string; constructor(a: unknown, b?: string) { this.uri = join(a, b) } create() {} }
  class File {
    uri: string
    constructor(a: unknown, b?: string) { this.uri = join(a, b) }
    get exists() { return mockFs.has(this.uri) }
    create() { if (mockFs.has(this.uri)) throw new Error('exists'); mockFs.set(this.uri, '') }
    delete() { if (!mockFs.has(this.uri)) throw new Error('missing'); mockFs.delete(this.uri) }
    async text() { await tick(); if (mockUnreadable.has(this.uri)) throw new Error('protected'); return mockFs.get(this.uri)! }
    async write(t: string) { await tick(); if (!mockFs.has(this.uri)) throw new Error('gone'); mockFs.set(this.uri, t) }
    async copy(to: File) { await tick(); mockFs.set(to.uri, mockFs.get(this.uri)!) }
    async move(to: File, opts?: { overwrite?: boolean }) {
      await tick()
      if (mockCrashOnMove) throw new Error('app killed')
      if (!mockFs.has(this.uri)) throw new Error('missing src')
      if (mockFs.has(to.uri) && !opts?.overwrite) throw new Error('destination exists')
      mockFs.set(to.uri, mockFs.get(this.uri)!); mockFs.delete(this.uri); this.uri = to.uri
    }
  }
  return { Directory, File, Paths: { get document() { return new Directory(mockDocument) } } }
})

const root = () => `${mockDocument}/cca-offline`

beforeEach(() => { mockFs.clear(); mockUnreadable.clear(); mockCrashOnMove = false; mockDocument = 'file:///var/app-A/Documents' })

describe('documents', () => {
  it('keeps the queue when the app dies while the new copy is moved into place', async () => {
    const s = fileStorage()
    await s.write('queue.json', '{"v":1,"ops":[1]}')
    mockCrashOnMove = true
    await expect(s.write('queue.json', '{"v":1,"ops":[1,2]}')).rejects.toThrow()
    mockCrashOnMove = false
    // Whatever the move left behind, the next launch reads a complete queue, never none.
    expect(await s.read('queue.json')).toMatch(/\[1(,2)?\]/)
    // Simulate a platform whose overwriting move removed the old copy first.
    mockFs.delete(`${root()}/queue.json`)
    expect(await s.read('queue.json')).toBe('{"v":1,"ops":[1,2]}')
    await s.write('queue.json', '{"v":1,"ops":[1,2,3]}')
    expect(await s.read('queue.json')).toBe('{"v":1,"ops":[1,2,3]}')
    expect([...mockFs.keys()]).toEqual([`${root()}/queue.json`])
  })

  it('never loses a document to overlapping saves (cache timer and going to the background)', async () => {
    const s = fileStorage()
    for (let i = 0; i < 100; i++) {
      mockFs.clear()
      await s.write('cache.json', 'old')
      await Promise.allSettled([s.write('cache.json', 'A'), s.write('cache.json', 'B')])
      expect(mockFs.get(`${root()}/cache.json`)).toBe('B')
    }
  })

  it('rejects for a document that is there but cannot be read, instead of reading it as empty', async () => {
    const s = fileStorage()
    await s.write('queue.json', '{"v":1,"ops":[1]}')
    mockUnreadable.add(`${root()}/queue.json`)
    await expect(s.read('queue.json')).rejects.toThrow('protected')
    expect(await s.read('missing.json')).toBeNull()
  })
})

describe('kept files', () => {
  it('stores only the file name, and finds the file after an iOS update moves the app folder', async () => {
    mockFs.set('file:///tmp/ImagePicker/x.jpg', 'jpeg')
    const kept = await fileKeeper.keep('file:///tmp/ImagePicker/x.jpg', 'c-1', 'Photo_1.JPG')
    expect(kept).toBe('c-1.jpg')
    const oldFull = `${root()}/files/c-1.jpg` // what earlier versions stored

    mockDocument = 'file:///var/app-B/Documents'
    mockFs.set(`${root()}/files/c-1.jpg`, 'jpeg')
    expect(fileKeeper.uriOf(kept)).toBe('file:///var/app-B/Documents/cca-offline/files/c-1.jpg')
    expect(fileKeeper.uriOf(oldFull)).toBe('file:///var/app-B/Documents/cca-offline/files/c-1.jpg')
    await fileKeeper.drop(oldFull)
    expect(mockFs.has(`${root()}/files/c-1.jpg`)).toBe(false)
  })
})
