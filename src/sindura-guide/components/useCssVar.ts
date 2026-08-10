import { useEffect, useState } from 'react'
import { readCssVar } from './utils'

/**
 * Reads a CSS variable's computed value and refreshes whenever the
 * theme changes, so live token values always match the visible theme.
 */
export function useCssVar(name: string): string {
  const [value, setValue] = useState(() => readCssVar(name))

  useEffect(() => {
    const refresh = () => setValue(readCssVar(name))
    refresh()
    const observer = new MutationObserver(refresh)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [name])

  return value
}
