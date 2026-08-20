/**
 * Text decoding and standard-font sanitizing for the local text/HTML
 * handlers. Text files saved with legacy encodings (Windows-1252 /
 * "winANSI") and characters the base-14 PDF fonts cannot encode are
 * handled here so conversions never throw mid-render.
 */

/**
 * Decodes a text file. Tries UTF-8 first; if it produced replacement
 * characters, falls back to Windows-1252 so cp-1252/ANSI files (smart
 * quotes, em dashes, accents…) come through intact.
 */
export function decodeTextBytes(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  if (!utf8.includes('\uFFFD')) return utf8
  try {
    return new TextDecoder('windows-1252').decode(bytes)
  } catch {
    return utf8
  }
}

const EXTRA_WINANSI = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6,
  0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c,
  0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
])

/**
 * Replaces characters that pdf-lib's base-14 fonts (WinAnsi encoding)
 * cannot represent with '?'. Keeps ASCII, Latin-1 and the WinAnsi
 * punctuation/currency set, so common typography survives intact.
 */
export function sanitizeWinAnsi(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0)
    if (code === undefined) continue
    if (
      code < 0x80 ||
      (code >= 0xa0 && code <= 0xff) ||
      EXTRA_WINANSI.has(code)
    ) {
      out += ch
    } else {
      out += '?'
    }
  }
  return out
}