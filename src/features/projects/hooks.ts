import { useCallback, useEffect, useState } from 'react'

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** A success message that clears itself after a few seconds. */
export function useNotice(ms = 4000) {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    if (!text) return
    const t = setTimeout(() => setText(null), ms)
    return () => clearTimeout(t)
  }, [text, ms])
  const clear = useCallback(() => setText(null), [])
  return [text, setText, clear] as const
}

/** Pull to refresh state that is true only while the user's own refresh runs. */
export function useRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try { await refetch() } finally { setRefreshing(false) }
  }, [refetch])
  return { refreshing, onRefresh }
}
