import { useEffect, useRef } from 'react'

/**
 * setInterval that always calls the latest callback without resetting the timer.
 *
 * `immediate` fires once on mount so the first render is not stuck waiting a
 * full interval for data.
 */
export function useInterval(callback, delay, { immediate = false } = {}) {
  const saved = useRef(callback)

  useEffect(() => {
    saved.current = callback
  }, [callback])

  useEffect(() => {
    if (delay === null) return undefined
    if (immediate) saved.current()
    const id = setInterval(() => saved.current(), delay)
    return () => clearInterval(id)
  }, [delay, immediate])
}
