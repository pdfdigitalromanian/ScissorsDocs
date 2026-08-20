import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRef,
} from 'pdf-lib'
import { pdfjs } from '@/features/pdf/pdfjs'
import { loadPdfDocument } from '../lib/pdf'
import { canvasToBlob } from '../lib/pdf'
import { localBytes, LocalToolError } from '../types'
import type { LocalToolContext, LocalToolResult } from '../types'

interface CompressionPreset {
  label: string
  quality: number
  maxDimension: number
  removeMetadata: boolean
}

const PRESETS: Record<string, CompressionPreset> = {
  low: { label: 'Low', quality: 0.85, maxDimension: 2400, removeMetadata: false },
  recommended: {
    label: 'Recommended',
    quality: 0.72,
    maxDimension: 1800,
    removeMetadata: true,
  },
  strong: { label: 'Strong', quality: 0.5, maxDimension: 1200, removeMetadata: true },
}

/** Builds an RGBA canvas from pdf.js decoded image data. */
function decodedImageToCanvas(data: Uint8Array, width: number, height: number, kind: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D rendering is not available in this browser.')

  if (kind === 3 /* ImageKind.RGBA_32BPP */) {
    const imageData = new ImageData(new Uint8ClampedArray(data), width, height)
    context.putImageData(imageData, 0, 0)
    return canvas
  }
  if (kind === 2 /* ImageKind.RGB_24BPP */) {
    const rgba = new Uint8ClampedArray(width * height * 4)
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
      rgba[j] = data[i]
      rgba[j + 1] = data[i + 1]
      rgba[j + 2] = data[i + 2]
      rgba[j + 3] = 255
    }
    context.putImageData(new ImageData(rgba, width, height), 0, 0)
    return canvas
  }
  if (kind === 4 /* ImageKind.GRAYSCALE_8BPP */) {
    const rgba = new Uint8ClampedArray(width * height * 4)
    for (let i = 0, j = 0; i < data.length; i += 1, j += 4) {
      rgba[j] = data[i]
      rgba[j + 1] = data[i]
      rgba[j + 2] = data[i]
      rgba[j + 3] = 255
    }
    context.putImageData(new ImageData(rgba, width, height), 0, 0)
    return canvas
  }
  return null
}

/** Downscales a canvas when it exceeds the target maximum dimension. */
function maybeDownscale(
  canvas: HTMLCanvasElement,
  maxDimension: number,
): HTMLCanvasElement {
  const longest = Math.max(canvas.width, canvas.height)
  if (longest <= maxDimension) return canvas
  const ratio = maxDimension / longest
  const width = Math.max(1, Math.round(canvas.width * ratio))
  const height = Math.max(1, Math.round(canvas.height * ratio))
  const scaled = document.createElement('canvas')
  scaled.width = width
  scaled.height = height
  const context = scaled.getContext('2d')
  if (!context) throw new Error('Canvas 2D rendering is not available in this browser.')
  context.drawImage(canvas, 0, 0, width, height)
  return scaled
}

export async function compressPdfHandler(
  context: LocalToolContext,
): Promise<LocalToolResult> {
  const { files, options, onProgress } = context
  if (files.length === 0) {
    throw new Error('Choose a PDF file.')
  }

  const presetId = String(options.level ?? 'recommended')
  const preset = PRESETS[presetId] ?? PRESETS.recommended

  const originalBytes = await localBytes(files[0])
  const originalSize = originalBytes.length

  const pdfDoc = await PDFDocument.load(originalBytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  })

  // Strip redundant metadata when the preset asks for it.
  if (preset.removeMetadata) {
    pdfDoc.setTitle('')
    pdfDoc.setAuthor('')
    pdfDoc.setSubject('')
    pdfDoc.setKeywords([])
  }

  // Decode images via pdf.js to find the actual pixel data.
  const loaded = await loadPdfDocument(originalBytes)
  const { document: pdfjsDoc, destroy } = loaded
  try {
    const totalPages = pdfjsDoc.numPages
    const replacements: Map<string, PDFRef> = new Map()
    const pages = pdfDoc.getPages()

    for (let index = 0; index < totalPages; index++) {
      const page = await pdfjsDoc.getPage(index + 1)
      const ops = await page.getOperatorList()

      for (let opIndex = 0; opIndex < ops.fnArray.length; opIndex++) {
        if (ops.fnArray[opIndex] !== pdfjs.OPS.paintImageXObject) continue
        const name = ops.argsArray[opIndex]?.[0] as string | undefined
        if (!name || replacements.has(name)) continue

        let imgData: { data: Uint8Array; width: number; height: number; kind: number }
        try {
          imgData = page.objs.get(name)
          if (!imgData || !imgData.data || !imgData.width || !imgData.height) continue
        } catch {
          continue
        }

        const canvas = decodedImageToCanvas(
          imgData.data,
          imgData.width,
          imgData.height,
          imgData.kind,
        )
        if (!canvas) continue

        const target = maybeDownscale(canvas, preset.maxDimension)
        const jpeg = await canvasToBlob(target, 'image/jpeg', preset.quality)
        const jpegBytes = new Uint8Array(await jpeg.arrayBuffer())
        const embedded = await pdfDoc.embedJpg(jpegBytes)
        replacements.set(name, embedded.ref)
      }

      onProgress?.(
        Math.round(((index + 1) / totalPages) * 60),
        `Analyzing page ${index + 1}`,
      )
    }

    // Replace the XObject entries in every page that references them.
    let replaced = 0
    for (const page of pages) {
      const resources = page.node.Resources()
      if (!resources) continue
      const xobjects = resources.lookupMaybe(PDFName.of('XObject'), PDFDict)
      if (!xobjects) continue
      for (const [name, ref] of replacements) {
        const key = PDFName.of(name)
        const entry = xobjects.get(key)
        if (entry instanceof PDFRef) {
          xobjects.set(key, ref)
          pdfDoc.context.delete(entry)
          replaced++
        }
      }
    }

    onProgress?.(80, `Replaced ${replaced} embedded image${replaced === 1 ? '' : 's'}`)

    // Re-serialize with object streams for compact output.
    const compressedBytes = await pdfDoc.save({ useObjectStreams: true })
    const compressedSize = compressedBytes.length
    const blob = new Blob([compressedBytes as unknown as BlobPart], {
      type: 'application/pdf',
    })

    const savedBytes = originalSize - compressedSize
    const savedPercent =
      originalSize > 0 ? Math.round((savedBytes / originalSize) * 100) : 0

    const details: { label: string; value: string }[] = [
      { label: 'Preset', value: preset.label },
      { label: 'Original size', value: formatSize(originalSize) },
      { label: 'Compressed size', value: formatSize(compressedSize) },
      { label: 'Saved', value: `${formatSize(Math.max(0, savedBytes))} (${savedPercent}%)` },
      { label: 'Images recompressed', value: String(replaced) },
    ]

    if (savedPercent < 5) {
      details.push({
        label: 'Note',
        value:
          'This PDF is mostly text and vector content, which cannot be compressed much further without degrading quality. Images were recompressed where possible.',
      })
    }

    return {
      blob,
      filename: `${baseName(files[0].name)}-compressed.pdf`,
      mimeType: 'application/pdf',
      summary: `${formatSize(compressedSize)} · ${savedPercent}% smaller`,
      details,
    }
  } finally {
    await destroy()
  }
}

function baseName(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '')
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export { LocalToolError }