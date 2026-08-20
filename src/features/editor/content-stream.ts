/**
 * Minimal PDF content-stream editor.
 *
 * Parses the raw (possibly FlateDecode-compressed) bytes of a page's
 * content stream into a flat list of operators, lets callers locate
 * text-show operators (Tj / TJ) by their *rendered* (x, y) position,
 * and re-serialises the modified operator list back to bytes.
 *
 * Only the subset of the PDF operator language actually used by
 * real-world text-bearing content streams is supported — the parser
 * deliberately skips inline images, dictionaries, and the handful of
 * exotic operators that text layers never emit.
 */

// ── Operator model ────────────────────────────────────────────────

export interface CsOp {
  op: string
  args: (number | string)[]
  /** Byte offset of the start of the operator's statement (including any leading whitespace). */
  start?: number
  /** Byte offset just past the end of the operator token. */
  end?: number
}

// ── Tokeniser + parser ────────────────────────────────────────────

function isDigit(ch: number): boolean {
  return ch >= 0x30 && ch <= 0x39 // 0-9
}

function isWS(ch: number): boolean {
  return ch === 0x20 || ch === 0x09 || ch === 0x0a || ch === 0x0d
}

function isOperandChar(ch: number): boolean {
  return isDigit(ch) || ch === 0x2d || ch === 0x2b || ch === 0x2e // - + .
}

export function parseContentStream(bytes: Uint8Array): CsOp[] {
  const out: CsOp[] = []
  const stack: (number | string)[] = []
  const data = bytes
  const len = data.length
  let i = 0
  let wsStart = -1
  let statementStart = -1

  function noteTokenStart() {
    if (stack.length === 0) {
      statementStart = wsStart !== -1 ? wsStart : i
    }
    wsStart = -1
  }

  function emitOp(op: string) {
    if (stack.length === 0) noteTokenStart()
    else wsStart = -1
    out.push({
      op,
      args: [...stack],
      start: statementStart === -1 ? i : statementStart,
      end: i,
    })
    statementStart = -1
    stack.length = 0
  }

  while (i < len) {
    const ch = data[i]

    // Skip whitespace
    if (isWS(ch)) {
      if (wsStart === -1) wsStart = i
      i++
      continue
    }

    // Comment
    if (ch === 0x25) { // %
      while (i < len && data[i] !== 0x0a && data[i] !== 0x0d) i++
      wsStart = -1
      continue
    }

    // Dictionary << … >>  — skip entirely
    if (ch === 0x3c && i + 1 < len && data[i + 1] === 0x3c) { // <<
      i += 2
      let depth = 1
      while (i < len && depth > 0) {
        if (data[i] === 0x3c && i + 1 < len && data[i + 1] === 0x3c) { depth++; i += 2 }
        else if (data[i] === 0x3e && i + 1 < len && data[i + 1] === 0x3e) { depth--; i += 2 }
        else i++
      }
      wsStart = -1
      continue
    }

    // Hex string <…>
    if (ch === 0x3c) { // <
      i++
      let hex = ''
      while (i < len && data[i] !== 0x3e) {
        const c = data[i]
        if (!isWS(c)) hex += String.fromCharCode(c)
        i++
      }
      if (i < len) i++ // skip >
      // Decode hex to raw bytes, then to string
      const raw: number[] = []
      for (let h = 0; h < hex.length; h += 2) {
        raw.push(parseInt(hex.slice(h, h + 2), 16))
      }
      stack.push(new TextDecoder().decode(new Uint8Array(raw)))
      noteTokenStart()
      continue
    }

    // Array [ … ]  (used by TJ)
    if (ch === 0x5b) { // [
      i++
      const arrItems: (number | string)[] = []
      while (i < len && data[i] !== 0x5d) { // ]
        const ac = data[i]
        if (isWS(ac)) { i++; continue }
        if (ac === 0x28) { // ( — string inside array
          i++
          let str = ''
          while (i < len && data[i] !== 0x29) { // )
            if (data[i] === 0x5c && i + 1 < len) { // backslash
              i++
              const esc = data[i]
              if (esc === 0x28 || esc === 0x29 || esc === 0x5c) {
                str += String.fromCharCode(esc)
              } else if (esc === 0x6e) { // n
                str += '\n'
              } else if (esc === 0x72) { // r
                str += '\r'
              } else if (esc === 0x74) { // t
                str += '\t'
              } else if (isDigit(esc)) {
                let octal = String.fromCharCode(esc)
                while (i + 1 < len && isDigit(data[i + 1]) && octal.length < 3) {
                  i++
                  octal += String.fromCharCode(data[i])
                }
                str += String.fromCharCode(parseInt(octal, 8))
              } else {
                str += String.fromCharCode(esc)
              }
            } else {
              str += String.fromCharCode(data[i])
            }
            i++
          }
          if (i < len) i++ // skip )
          arrItems.push(str)
        } else if (ac === 0x3c) { // < — hex string in array
          i++
          let hex = ''
          while (i < len && data[i] !== 0x3e) {
            if (!isWS(data[i])) hex += String.fromCharCode(data[i])
            i++
          }
          if (i < len) i++
          const raw: number[] = []
          for (let h = 0; h < hex.length; h += 2) {
            raw.push(parseInt(hex.slice(h, h + 2), 16))
          }
          arrItems.push(new TextDecoder().decode(new Uint8Array(raw)))
        } else if (isOperandChar(ac) || ac === 0x2d) {
          let num = ''
          while (i < len && (isOperandChar(data[i]) || data[i] === 0x45 || data[i] === 0x65)) {
            num += String.fromCharCode(data[i])
            i++
          }
          arrItems.push(parseFloat(num))
        } else {
          i++ // skip unexpected char
        }
      }
      if (i < len) i++ // skip ]
      stack.push(arrItems as unknown as string) // TJ arrays are strings for our purposes
      noteTokenStart()
      continue
    }

    // Parenthesized string (…)
    if (ch === 0x28) { // (
      i++
      let str = ''
      while (i < len && data[i] !== 0x29) { // )
        if (data[i] === 0x5c && i + 1 < len) { // backslash
          i++
          const esc = data[i]
          if (esc === 0x28 || esc === 0x29 || esc === 0x5c) {
            str += String.fromCharCode(esc)
          } else if (esc === 0x6e) {
            str += '\n'
          } else if (esc === 0x72) {
            str += '\r'
          } else if (esc === 0x74) {
            str += '\t'
          } else if (isDigit(esc)) {
            let octal = String.fromCharCode(esc)
            while (i + 1 < len && isDigit(data[i + 1]) && octal.length < 3) {
              i++
              octal += String.fromCharCode(data[i])
            }
            str += String.fromCharCode(parseInt(octal, 8))
          } else {
            str += String.fromCharCode(esc)
          }
        } else {
          str += String.fromCharCode(data[i])
        }
        i++
      }
      if (i < len) i++ // skip )
      stack.push(str)
      noteTokenStart()
      continue
    }

    // Number
    if (isOperandChar(ch)) {
      let num = ''
      while (i < len && (isOperandChar(data[i]) || data[i] === 0x45 || data[i] === 0x65)) {
        num += String.fromCharCode(data[i])
        i++
      }
      stack.push(parseFloat(num))
      noteTokenStart()
      continue
    }

    // Name /…
    if (ch === 0x2f) { // /
      i++
      let name = ''
      while (i < len && !isWS(data[i]) && data[i] !== 0x5b && data[i] !== 0x5d &&
             data[i] !== 0x3c && data[i] !== 0x3e && data[i] !== 0x2f) {
        if (data[i] === 0x23 && i + 2 < len) { // #xx
          i++
          name += String.fromCharCode(parseInt(String.fromCharCode(data[i], data[i + 1]), 16))
          i += 2
        } else {
          name += String.fromCharCode(data[i])
          i++
        }
      }
      stack.push('/' + name)
      noteTokenStart()
      continue
    }

    // Operator (letters, optionally ending with *). Lowercase operators
    // such as cm / q / re / gs / Do are just as common as uppercase ones,
    // so the parser recognises any letter sequence — not just A-Z.
    if (
      (ch >= 0x41 && ch <= 0x5a) || // A-Z
      (ch >= 0x61 && ch <= 0x7a) // a-z
    ) {
      let op = ''
      while (
        i < len &&
        ((data[i] >= 0x41 && data[i] <= 0x5a) ||
          (data[i] >= 0x61 && data[i] <= 0x7a))
      ) {
        op += String.fromCharCode(data[i])
        i++
      }
      if (i < len && data[i] === 0x2a) {
        // * suffix (f*, B*, b*)
        op += '*'
        i++
      }
      emitOp(op)

      // Inline images (BI … ID … EI) carry arbitrary binary payloads that
      // the tokeniser cannot parse. Skip forward to the matching EI so the
      // rest of the stream stays intact.
      if (op === 'BI') {
        while (i + 1 < len && !(data[i] === 0x45 && data[i + 1] === 0x49)) {
          i++
        }
        i += 2
      }
      continue
    }

    // Text-show operators that are punctuation rather than letters: ' and "
    if (ch === 0x27 || ch === 0x22) {
      emitOp(String.fromCharCode(ch))
      continue
    }

    // Anything else — skip
    i++
  }

  return out
}

// ── Serialiser ────────────────────────────────────────────────────

function serialiseArg(arg: number | string): string {
  if (typeof arg === 'number') {
    return Number.isInteger(arg) ? String(arg) : arg.toFixed(4).replace(/0+$/, '').replace(/\.$/, '.0')
  }
  // String — parenthesise with escaping
  const escaped = arg.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  return `(${escaped})`
}

export function serialiseContentStream(ops: CsOp[]): Uint8Array {
  const parts: string[] = []
  for (const { op, args } of ops) {
    if (args.length > 0) {
      parts.push(args.map(serialiseArg).join(' '))
      parts.push(' ')
    }
    parts.push(op)
    parts.push('\n')
  }
  return new TextEncoder().encode(parts.join(''))
}

/**
 * Surgical operator removal. Cuts the byte ranges of every operator listed in
 * `removeIndices` out of the original stream and leaves everything else —
 * inline images, dictionaries, comments, unknown tokens — byte-for-byte
 * intact. This is what redaction relies on so unrelated page content is
 * never corrupted or dropped.
 */
export function removeOpsFromStream(
  bytes: Uint8Array,
  ops: CsOp[],
  removeIndices: Set<number>,
): Uint8Array {
  const cuts: [number, number][] = []
  for (const index of removeIndices) {
    const op = ops[index]
    if (
      op &&
      typeof op.start === 'number' &&
      typeof op.end === 'number' &&
      op.start >= 0 &&
      op.end <= bytes.length &&
      op.start < op.end
    ) {
      cuts.push([op.start, op.end])
    }
  }
  if (cuts.length === 0) return bytes
  cuts.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = [cuts[0]]
  for (let index = 1; index < cuts.length; index += 1) {
    const last = merged[merged.length - 1]
    const next = cuts[index]
    if (next[0] <= last[1]) {
      last[1] = Math.max(last[1], next[1])
    } else {
      merged.push(next)
    }
  }
  const out = new Uint8Array(
    bytes.length - merged.reduce((sum, [a, b]) => sum + (b - a), 0),
  )
  let cursor = 0
  let write = 0
  for (const [start, end] of merged) {
    if (start > cursor) {
      out.set(bytes.subarray(cursor, start), write)
      write += start - cursor
    }
    cursor = end
  }
  if (cursor < bytes.length) {
    out.set(bytes.subarray(cursor), write)
  }
  return out
}

// ── Text-matrix tracking helpers ──────────────────────────────────

interface Mat3 {
  a: number; b: number; c: number; d: number; e: number; f: number
}

const IDENTITY: Mat3 = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

function mulMat(m1: Mat3, m2: Mat3): Mat3 {
  return {
    a: m1.a * m2.a + m1.b * m2.c,
    b: m1.a * m2.b + m1.b * m2.d,
    c: m1.c * m2.a + m1.d * m2.c,
    d: m1.c * m2.b + m1.d * m2.d,
    e: m1.e * m2.a + m1.f * m2.c + m2.e,
    f: m1.e * m2.b + m1.f * m2.d + m2.f,
  }
}

function xformPoint(m: Mat3, x: number, y: number): [number, number] {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]
}

// ── Find + remove / replace text operators ────────────────────────

const TEXT_SHOW_OPS = new Set(['Tj', 'TJ', "'", '"'])

/**
 * Walk the operator list tracking CTM and text-matrix state.
 * Returns the indices of BT…ET blocks containing text-show operators
 * that land within the region around (targetX, targetY). When
 * `targetWidth` is given, every operator on the same baseline whose
 * start falls inside [targetX - tol, targetX + targetWidth + tol] is
 * matched — PDF text layers frequently split one visual line into many
 * operators, and removing just the one at the clicked point left the
 * neighbouring chunks of that line behind.
 */
function findTextBlockIndices(
  ops: CsOp[],
  targetX: number,
  targetY: number,
  tolerance: number,
  targetWidth?: number,
): Array<{ bt: number; et: number; show: number }> {
  const results: Array<{ bt: number; et: number; show: number }> = []
  const endX =
    targetWidth && targetWidth > 0
      ? targetX + Math.abs(targetWidth) + tolerance
      : targetX

  const ctmStack: Mat3[] = [IDENTITY]
  let ctm = IDENTITY
  let tm = IDENTITY
  let inText = false
  let btIndex = -1

  for (let i = 0; i < ops.length; i++) {
    const { op, args } = ops[i]

    if (op === 'q') {
      ctmStack.push({ ...ctm })
      continue
    }
    if (op === 'Q') {
      if (ctmStack.length > 1) ctm = ctmStack.pop()!
      else ctm = IDENTITY
      continue
    }
    if (op === 'cm' && args.length >= 6) {
      const m: Mat3 = {
        a: Number(args[0]), b: Number(args[1]),
        c: Number(args[2]), d: Number(args[3]),
        e: Number(args[4]), f: Number(args[5]),
      }
      ctm = mulMat(ctm, m)
      continue
    }

    if (op === 'BT') {
      inText = true
      tm = IDENTITY
      btIndex = i
      continue
    }
    if (op === 'ET') {
      inText = false
      btIndex = -1
      continue
    }

    if (!inText) continue

    // Text matrix operators
    if (op === 'Tm' && args.length >= 6) {
      tm = {
        a: Number(args[0]), b: Number(args[1]),
        c: Number(args[2]), d: Number(args[3]),
        e: Number(args[4]), f: Number(args[5]),
      }
      continue
    }
    if (op === 'Td' || op === 'TD') {
      const dx = Number(args[0]) || 0
      const dy = Number(args[1]) || 0
      tm = mulMat(tm, { a: 1, b: 0, c: 0, d: 1, e: dx, f: dy })
      continue
    }
    if (op === 'T*') {
      const leading = Number(args[0]) || 0
      tm = mulMat(tm, { a: 1, b: 0, c: 0, d: 1, e: 0, f: leading || -12 })
      continue
    }

    // Text-show operators
    if (TEXT_SHOW_OPS.has(op) && btIndex >= 0) {
      const combined = mulMat(ctm, tm)
      const [px, py] = xformPoint(combined, 0, 0)
      if (
        Math.abs(py - targetY) <= tolerance &&
        px >= targetX - tolerance &&
        px <= endX + tolerance
      ) {
        results.push({ bt: btIndex, et: -1, show: i })
      }
    }
  }

  // Back-fill ET indices for found blocks
  for (const r of results) {
    for (let j = r.bt + 1; j < ops.length; j++) {
      if (ops[j].op === 'ET') { r.et = j; break }
    }
  }

  return results
}

/**
 * Attempt to remove the text run at (targetX, targetY) from a decoded
 * content stream.  Returns the modified operators, or the originals
 * unchanged if no matching text was found.
 */
export function removeTextAtPosition(
  ops: CsOp[],
  targetX: number,
  targetY: number,
  tolerance = 2,
  targetWidth?: number,
): CsOp[] {
  const matches = findTextBlockIndices(
    ops,
    targetX,
    targetY,
    tolerance,
    targetWidth,
  )
  if (matches.length === 0) return ops

  // Remove in reverse so indices stay valid
  const removeSet = new Set<number>()
  for (const m of matches) {
    // If the BT…ET block only contains font/text-matrix + one text-show,
    // remove the whole block.  Otherwise remove just the show op.
    let textOps = 0
    for (let j = m.bt; j <= m.et && m.et >= 0; j++) {
      if (TEXT_SHOW_OPS.has(ops[j].op)) textOps++
    }
    if (textOps <= 1 && m.et >= 0) {
      for (let j = m.bt; j <= m.et; j++) removeSet.add(j)
    } else {
      removeSet.add(m.show)
    }
  }

  return ops.filter((_, idx) => !removeSet.has(idx))
}

/**
 * Replace the text string in the text-show operator at (targetX, targetY).
 */
export function replaceTextAtPosition(
  ops: CsOp[],
  targetX: number,
  targetY: number,
  newText: string,
  tolerance = 2,
  targetWidth?: number,
): CsOp[] {
  const matches = findTextBlockIndices(
    ops,
    targetX,
    targetY,
    tolerance,
    targetWidth,
  )
  if (matches.length === 0) return ops

  const result = [...ops]
  for (const m of matches) {
    const op = result[m.show]
    if (op.op === 'TJ') {
      // Replace the first string element in the TJ array
      if (Array.isArray(op.args[0])) {
        const arr = [...(op.args[0] as (number | string)[])]
        for (let k = 0; k < arr.length; k++) {
          if (typeof arr[k] === 'string') {
            arr[k] = newText
            break
          }
        }
        result[m.show] = { ...op, args: [arr as unknown as string] }
      }
    } else {
      result[m.show] = { ...op, args: [newText, ...op.args.slice(1)] }
    }
    break // replace first match only
  }

  return result
}
