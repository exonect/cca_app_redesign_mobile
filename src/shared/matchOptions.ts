/** Same search as the web multi select: case, spaces, hyphens, underscores and brackets
 * do not matter ("m30ssc" finds "M30 ssc"); values that start with the search come first. */
export type Option<T> = { value: T; label: string }

const squash = (s: string) => s.toLowerCase().replace(/[\s\-_()]+/g, '')

export function matchOptions<O extends { label: string }>(options: O[], query: string): O[] {
  const q = squash(query)
  if (!q) return options
  const starts: O[] = []
  const contains: O[] = []
  for (const o of options) {
    const l = squash(o.label)
    if (l.startsWith(q)) starts.push(o)
    else if (l.includes(q)) contains.push(o)
  }
  return [...starts, ...contains]
}
