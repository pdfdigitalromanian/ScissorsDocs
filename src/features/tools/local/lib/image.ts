/**
 * Browser-side image helpers used by the local conversion tools.
 * Everything runs offline; no image is uploaded anywhere.
 */

export interface DecodedImage {
  width: number
  height: number
  mimeType: string
  /** True when the source bytes can be embedded as-is by pdf-lib. */
  embeddable: boolean
  /** Source bytes (may be re-encoded when not directly embeddable). */
  data: Uint8Array
}

const DIRECT_EMBEDDABLE = new Set(['image/png', 'image/jpeg'])

/** Loads a File and reports whether it can be used by the local engine. */
export async function decodeImageFile(file: File): Promise<DecodedImage> {
  const data = new Uint8Array(await file.arrayBuffer())
  const mimeType = file.type || 'image/png'
  const embeddable = DIRECT_EMBEDDABLE.has(mimeType)
  let width = 0
  let height = 0
  if (embeddable) {
    const bitmap = await createImageBitmap(file)
    width = bitmap.width
    height = bitmap.height
    bitmap.close()
  } else {
    // Re-encode via canvas into a format pdf-lib can embed.
    const bitmap = await createImageBitmap(file)
    width = bitmap.width
    height = bitmap.height
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Canvas 2D rendering is not available in this browser.')
    }
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    const png = await new Promise<Uint8Array | null>((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(null)
            return
          }
          blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)))
        },
        'image/png',
      )
    })
    if (!png) {
      throw new Error(`The image "${file.name}" could not be converted to PNG.`)
    }
    return {
      width,
      height,
      mimeType: 'image/png',
      embeddable: true,
      data: png,
    }
  }
  return { width, height, mimeType, embeddable, data }
}

/** Draws any embeddable image source onto a canvas, preserving pixel size. */
export async function imageBytesToCanvas(
  data: Uint8Array,
  mimeType: string,
  width: number,
  height: number,
): Promise<HTMLCanvasElement> {
  const blob = new Blob([data as unknown as BlobPart], { type: mimeType })
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas 2D rendering is not available in this browser.')
  }
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  return canvas
}

export type JpegOptions = { quality: number }

/** Re-encodes an image canvas as JPEG bytes. */
export async function canvasToJpeg(
  canvas: HTMLCanvasElement,
  quality = 0.85,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('JPEG encoding failed.'))
          return
        }
        blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)))
      },
      'image/jpeg',
      quality,
    )
  })
}

/** Estimates file dimensions in points (72dpi default). */
export function pixelToPoints(
  pixels: number,
  dpi = 72,
): number {
  return Math.round((pixels * 72) / dpi)
}

/** Parses a page-range string like "1-3,5,8-10" into a sorted page set. */
export function parsePageRanges(
  input: string | undefined | null,
  totalPages: number,
): number[] {
  if (!input || input.trim() === '' || input.trim().toLowerCase() === 'all') {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const selected = new Set<number>()
  for (const part of input.split(',')) {
    const token = part.trim()
    if (!token) continue
    const match = token.match(/^(\d+)\s*-\s*(\d+)$/)
    if (match) {
      const start = Math.max(1, parseInt(match[1], 10))
      const end = Math.min(totalPages, parseInt(match[2], 10))
      for (let page = start; page <= end; page++) selected.add(page)
    } else if (/^\d+$/.test(token)) {
      const page = parseInt(token, 10)
      if (page >= 1 && page <= totalPages) selected.add(page)
    }
  }
  return [...selected].sort((a, b) => a - b)
}