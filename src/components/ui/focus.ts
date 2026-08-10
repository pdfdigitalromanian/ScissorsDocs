const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      element.offsetParent !== null || element === document.activeElement,
  )
}

export function focusFirstFocusable(container: HTMLElement): void {
  const [first] = getFocusableElements(container)
  first?.focus()
}

export function focusLastFocusable(container: HTMLElement): void {
  const focusable = getFocusableElements(container)
  focusable[focusable.length - 1]?.focus()
}

export function trapFocus(container: HTMLElement): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return
    const focusable = getFocusableElements(container)
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement

    if (event.shiftKey) {
      if (active === first || active === container) {
        event.preventDefault()
        last.focus()
      }
    } else if (active === last || !container.contains(active)) {
      event.preventDefault()
      first.focus()
    }
  }

  document.addEventListener('keydown', onKeyDown)
  return () => document.removeEventListener('keydown', onKeyDown)
}
