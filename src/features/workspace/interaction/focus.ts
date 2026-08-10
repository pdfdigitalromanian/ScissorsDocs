import { getFocusableElements } from '@/components/ui/focus'

/**
 * rememberFocus captures the currently focused element and returns a
 * restore function that returns focus to it. Used when a panel or
 * floating region opens, so closing it returns the user to their
 * previous context.
 */
export function rememberFocus(): () => void {
  const previous =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
  return () => previous?.focus()
}

/**
 * Focuses the first focusable element inside a container. Returns false
 * when the container has no focusable content, letting the caller decide
 * whether to focus the container itself.
 */
export function focusFirstFocusable(container: HTMLElement): boolean {
  const [first] = getFocusableElements(container)
  if (!first) return false
  first.focus()
  return true
}
