let cachedSpace: number | null = null

/**
 * Reads the `--space-2` token from the root stylesheet so floating
 * surfaces use the token value for their gap margin. Falls back to zero
 * if the token is unavailable rather than hardcoding a visual value.
 */
export function getTokenSpace(): number {
  if (cachedSpace === null) {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue('--space-2')
      .trim()
    const parsed = value ? Number.parseFloat(value) : NaN
    cachedSpace = Number.isFinite(parsed) ? parsed : 0
  }
  return cachedSpace
}
