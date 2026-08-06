import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'shopflow-theme'

/**
 * Light/dark theme, persisted. The initial class is applied by an inline script
 * in index.html so there is no flash of the wrong theme before React mounts.
 */
export function useTheme() {
  const [theme, setTheme] = useState(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Private browsing - the theme just will not persist.
    }
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, toggle }
}
