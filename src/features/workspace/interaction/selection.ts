import { useCallback, useState } from 'react'

/**
 * useSelection is a generic multi-selection model used by future
 * workspace tools (pages, objects, layers). It tracks a set of selected
 * items with single-select, multi-select and range-selection support.
 */
export function useSelection<T>(initial: readonly T[] = []) {
  const [selected, setSelected] = useState<ReadonlySet<T>>(
    () => new Set(initial),
  )

  const replace = useCallback((items: readonly T[]) => {
    setSelected(new Set(items))
  }, [])

  const select = useCallback((...items: T[]) => {
    setSelected((previous) => {
      const next = new Set(previous)
      items.forEach((item) => next.add(item))
      return next
    })
  }, [])

  const deselect = useCallback((...items: T[]) => {
    setSelected((previous) => {
      const next = new Set(previous)
      items.forEach((item) => next.delete(item))
      return next
    })
  }, [])

  const toggle = useCallback((item: T) => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(item)) {
        next.delete(item)
      } else {
        next.add(item)
      }
      return next
    })
  }, [])

  const clear = useCallback(() => setSelected(new Set()), [])

  const isSelected = useCallback((item: T) => selected.has(item), [selected])

  return {
    selected,
    hasSelection: selected.size > 0,
    replace,
    select,
    deselect,
    toggle,
    clear,
    isSelected,
  }
}
