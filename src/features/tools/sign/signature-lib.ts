import { registerBundledEditorFontFaces } from '@/features/pdf/text-format'
import { canvasToBlob } from '../local/lib/pdf'

export type SignatureKind = 'drawn' | 'typed' | 'uploaded'

export interface SignatureImage {
  id: string
  kind: SignatureKind
  dataUrl: string
  bytes: Uint8Array
  width: number
  height: number
  label: string
}

export interface TypedSignatureStyle {
  id: string
  label: string
  cssFamily: string
  weight: number
  italic: boolean
}

/** A small set of appropriate styles for a typed signature. */
export const TYPED_SIGNATURE_STYLES: TypedSignatureStyle[] = [
  {
    id: 'crimson',
    label: 'Signature',
    cssFamily: 'Scissors Editor Crimson Pro',
    weight: 700,
    italic: true,
  },
  {
    id: 'playfair',
    label: 'Elegant',
    cssFamily: 'Scissors Editor Playfair Display',
    weight: 700,
    italic: true,
  },
  {
    id: 'rubik',
    label: 'Classic',
    cssFamily: 'Scissors Editor Rubik',
    weight: 400,
    italic: true,
  },
]

let fontsRegistered = false

async function ensureSignatureFonts(): Promise<void> {
  if (!fontsRegistered && typeof document !== 'undefined') {
    registerBundledEditorFontFaces()
    fontsRegistered = true
  }
}

/** Base64-encodes bytes in chunks (avoids stack limits for large PNGs). */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

/** Builds a self-contained PNG data URL from the signature's raw bytes. */
function bytesToPngDataUrl(bytes: Uint8Array): string {
  return `data:image/png;base64,${bytesToBase64(bytes)}`
}

/** Decodes a PNG data URL back into raw bytes. */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = (
    dataUrl.includes(',') ? dataUrl.split(',')[1] ?? '' : dataUrl
  ).replace(/\s+/g, '')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export interface SignatureTransform {
  /** Replaces the stroke color (null/undefined keeps the current color). */
  color?: string | null
  /** Stroke width as a percentage of the original (100 = as drawn). */
  strokeWidth?: number
}

/**
 * Box-morphology on the alpha channel only (RGB is untouched): a positive
 * radius dilates the strokes (thicker), a negative radius erodes them
 * (thinner). Done as two separable passes (horizontal then vertical) so it
 * stays fast even on large canvases.
 */
function morphAlpha(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data)
  if (radius === 0) return out
  const horizontal = radius > 0 ? Math.max : Math.min
  const vertical = radius > 0 ? Math.max : Math.min
  const r = Math.abs(radius)
  const tmp = new Uint8ClampedArray(data)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let best = radius > 0 ? 0 : 255
      for (
        let k = Math.max(0, x - r);
        k <= Math.min(width - 1, x + r);
        k += 1
      ) {
        best = horizontal(data[(y * width + k) * 4 + 3], best)
      }
      tmp[(y * width + x) * 4 + 3] = best
    }
  }

  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      let best = radius > 0 ? 0 : 255
      for (
        let k = Math.max(0, y - r);
        k <= Math.min(height - 1, y + r);
        k += 1
      ) {
        best = vertical(tmp[(k * width + x) * 4 + 3], best)
      }
      out[(y * width + x) * 4 + 3] = best
    }
  }
  return out
}

/**
 * Processes a signature image: optionally thickens/thins the strokes and/or
 * replaces the stroke color while the alpha mask is preserved.
 */
export async function transformSignatureDataUrl(
  dataUrl: string,
  transform: SignatureTransform = {},
): Promise<string> {
  const color = transform.color ?? null
  const factor = Number.isFinite(transform.strokeWidth)
    ? (transform.strokeWidth ?? 100) / 100
    : 1
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image()
    element.onload = () => resolve(element)
    element.onerror = () =>
      reject(new Error('The signature image could not be processed.'))
    element.src = dataUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D rendering is not available here.')
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0)

  if (factor !== 1) {
    const radius = Math.round(
      Math.max(-12, Math.min(12, (factor - 1) * 4)),
    )
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    const morphed = morphAlpha(
      imageData.data,
      canvas.width,
      canvas.height,
      radius,
    )
    imageData.data.set(morphed)
    context.putImageData(imageData, 0, 0)
  }

  if (color) {
    context.globalCompositeOperation = 'source-in'
    context.fillStyle = color
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  return canvas.toDataURL('image/png')
}

/**
 * Recolors a signature image: the pixel color is replaced with `color`
 * while the alpha mask (the signature strokes) is preserved. Used by the
 * workspace inspector to change the color of a placed signature.
 */
export function recolorSignatureDataUrl(
  dataUrl: string,
  color: string,
): Promise<string> {
  return transformSignatureDataUrl(dataUrl, { color })
}

/** Encodes any canvas to a transparent PNG-backed signature image. */
export async function canvasToSignature(
  canvas: HTMLCanvasElement,
  kind: SignatureKind,
  label: string,
): Promise<SignatureImage> {
  const blob = await canvasToBlob(canvas, 'image/png')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return {
    id: `${kind}-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    kind,
    dataUrl: bytesToPngDataUrl(bytes),
    bytes,
    width: canvas.width,
    height: canvas.height,
    label,
  }
}

function hashString(value: string): number {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * Renders a name as a signature appearance. Each character is drawn with a
 * small, deterministic rotation and vertical offset so the result looks
 * hand-written while staying identical for the same name and style.
 */
export async function createTypedSignature(
  name: string,
  style: TypedSignatureStyle,
  color = '#0f172a',
): Promise<SignatureImage> {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error('Enter a name to create the signature.')
  }
  if (trimmed.length > 60) {
    throw new Error('Keep the signature name to 60 characters or fewer.')
  }
  await ensureSignatureFonts()

  const fontSize = 64
  const font = `${style.italic ? 'italic ' : ''}${style.weight} ${fontSize}px "${style.cssFamily}", cursive`
  if (typeof document !== 'undefined' && document.fonts) {
    try {
      await document.fonts.load(font)
    } catch {
      // Fall back to the browser default cursive stack.
    }
  }

  const measureCanvas = document.createElement('canvas')
  const measure = measureCanvas.getContext('2d')
  if (!measure) throw new Error('Canvas 2D rendering is not available here.')
  measure.font = font
  const charWidths = Array.from(trimmed).map(
    (character) => measure.measureText(character).width,
  )
  const gap = 4
  const totalWidth = charWidths.reduce((sum, width) => sum + width, 0) + (charWidths.length - 1) * gap
  const padding = 48
  const width = Math.ceil(totalWidth + padding * 2)
  const height = Math.ceil(fontSize * 1.8)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D rendering is not available here.')
  context.clearRect(0, 0, width, height)

  const seed = hashString(trimmed)
  context.font = font
  context.fillStyle = color
  context.textBaseline = 'middle'
  context.textAlign = 'left'

  const baselineY = height / 2
  let cursorX = padding
  Array.from(trimmed).forEach((character, index) => {
    const variation = seed + index * 7919
    const rotation = (((variation % 9) - 4) * Math.PI) / 180
    const yOffset = ((variation >> 4) % 5) - 2
    context.save()
    context.translate(cursorX + charWidths[index] / 2, baselineY + yOffset)
    context.rotate(rotation)
    context.fillText(character, -charWidths[index] / 2, 0)
    context.restore()
    cursorX += charWidths[index] + gap
  })

  return canvasToSignature(canvas, 'typed', trimmed)
}

/** Loads an uploaded signature image, normalizing it to PNG bytes. */
export async function createUploadedSignature(
  file: File,
): Promise<SignatureImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose a PNG or JPG image for the signature.')
  }
  const bitmap = await createImageBitmap(file)
  try {
    const maxSize = 1600
    const ratio = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio))
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio))
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Canvas 2D rendering is not available here.')
    }
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return await canvasToSignature(canvas, 'uploaded', file.name)
  } finally {
    bitmap.close()
  }
}
