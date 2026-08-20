/**
 * Minimal in-browser ZIP writer (STORE method, no compression).
 * Produces a fully valid .zip that Windows/macOS/Linux can open.
 * Suitable for packaging already-compressed payloads (PNG/JPEG images).
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function encodeName(name: string): Uint8Array {
  return new TextEncoder().encode(name)
}

export interface ZipEntryInput {
  name: string
  data: Uint8Array
}

export function createZipArchive(entries: ZipEntryInput[]): Uint8Array {
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const dosTime = 0
  const dosDate = 0x21 // 1980-01-01, deterministic output

  for (const entry of entries) {
    const nameBytes = encodeName(entry.name)
    const crc = crc32(entry.data)
    const size = entry.data.length

    // Local file header
    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0, true)
    lv.setUint16(8, 0, true)
    lv.setUint16(10, dosTime, true)
    lv.setUint16(12, dosDate, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)
    lv.setUint32(22, size, true)
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true)
    local.set(nameBytes, 30)
    parts.push(local, entry.data)

    // Central directory header
    const centralBytes = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(centralBytes.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, dosTime, true)
    cv.setUint16(14, dosDate, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true)
    cv.setUint16(32, 0, true)
    cv.setUint16(34, 0, true)
    cv.setUint16(36, 0, true)
    cv.setUint32(38, 0, true)
    cv.setUint32(42, offset, true)
    centralBytes.set(nameBytes, 46)
    central.push(centralBytes)

    offset += local.length + size
  }

  const centralOffset = parts.reduce((sum, part) => sum + part.length, 0)
  const centralSize = central.reduce((sum, part) => sum + part.length, 0)

  // End of central directory record
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, centralOffset, true)
  ev.setUint16(20, 0, true)

  const combined = new Uint8Array(centralOffset + centralSize + eocd.length)
  let position = 0
  for (const part of parts) {
    combined.set(part, position)
    position += part.length
  }
  for (const part of central) {
    combined.set(part, position)
    position += part.length
  }
  combined.set(eocd, position)
  return combined
}

/** Uses a plain ZIP entry as the in-memory .zip payload. */
export function makeZipBlob(entries: ZipEntryInput[]): Blob {
  const bytes = createZipArchive(entries)
  return new Blob([bytes as unknown as BlobPart], {
    type: 'application/zip',
  })
}