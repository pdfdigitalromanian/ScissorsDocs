import { useEffect, useRef } from 'react'

export interface ShortcutBinding {
  /** Combo using '+' separated modifiers, e.g. 'mod+w' or 'alt+1'. */
  combo: string
  handler: (event: KeyboardEvent) => void
  /** When true the shortcut also fires while focus is in an input. */
  global?: boolean
}

function matchesCombo(event: KeyboardEvent, combo: string): boolean {
  const parts = combo.toLowerCase().split('+')
  const key = parts[parts.length - 1]
  const modifiers = new Set(parts.slice(0, -1))

  const wantsMod = modifiers.has('mod')
  const wantsCtrl = modifiers.has('ctrl')
  const wantsMeta = modifiers.has('meta')
  const wantsAlt = modifiers.has('alt')
  const wantsShift = modifiers.has('shift')

  const hasCtrl = event.ctrlKey
  const hasMeta = event.metaKey
  const hasAlt = event.altKey
  const hasShift = event.shiftKey

  if (wantsMod && !hasCtrl && !hasMeta) return false
  if (!wantsMod && wantsCtrl && !hasCtrl) return false
  if (!wantsMod && wantsMeta && !hasMeta) return false
  if (wantsAlt && !hasAlt) return false
  if (wantsShift && !hasShift) return false

  if (!wantsCtrl && !wantsMeta && !wantsMod && (hasCtrl || hasMeta)) {
    return false
  }
  if (!wantsAlt && hasAlt) return false
  if (!wantsShift && hasShift) return false

  return event.key.toLowerCase() === key
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.matches('input, textarea, select, [contenteditable="true"]')
  )
}

/**
 * useShortcuts binds a set of keyboard shortcuts for the lifetime of the
 * component. The latest bindings are always applied without re-registering
 * listeners on every render. Shortcuts are ignored while typing unless the
 * binding is marked as global.
 */
export function useShortcuts(bindings: ShortcutBinding[]): void {
  const bindingsRef = useRef(bindings)

  useEffect(() => {
    bindingsRef.current = bindings
  }, [bindings])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      for (const binding of bindingsRef.current) {
        if (!matchesCombo(event, binding.combo)) continue
        if (isEditableTarget(event.target) && !binding.global) continue
        binding.handler(event)
        if (event.defaultPrevented) break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
