/**
 * Shared PDF watermark & stamp engine (Phase 4.10).
 *
 * A single implementation used by both the standalone Watermark workflow and
 * the Workspace watermark quick-action. Everything is client-side with
 * pdf-lib — documents are never uploaded.
 */
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import type { PDFFont, PDFImage, PDFPage } from 'pdf-lib'

export type WatermarkKind = 'text' | 'image' | 'stamp'

export type WatermarkPosition =
  | 'center'
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

export type WatermarkFont = 'helvetica' | 'times' | 'courier'

export interface WatermarkImageSource {
  bytes: Uint8Array
  mime: string
}

export interface WatermarkConfig {
  kind: WatermarkKind
  text: string
  fontSize: number
  /** Hex color, e.g. #112233. */
  color: string
  /** 0–1. */
  opacity: number
  /** Degrees, clockwise. */
  rotation: number
  position: WatermarkPosition
  /** Repeat across the page in a grid when true. */
  tile: boolean
  fontFamily: WatermarkFont
  /** Image watermarks: PNG or JPEG bytes. */
  image?: WatermarkImageSource
  /** Image scale as a fraction of page width. */
  imageScale?: number
}

export interface WatermarkResult {
  bytes: Uint8Array
  pageCount: number
}

export const STAMP_PRESETS: Array<{ label: string; color: string }> = [
  { label: 'APPROVED', color: '#15803d' },
  { label: 'DRAFT', color: '#b45309' },
  { label: 'CONFIDENTIAL', color: '#b91c1c' },
  { label: 'COPY', color: '#1d4ed8' },
  { label: 'REJECTED', color: '#b91c1c' },
  { label: 'REVIEWED', color: '#15803d' },
]

export const POSITION_OPTIONS: Array<{ value: WatermarkPosition; label: string }> = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-center', label: 'Top center' },
  { value: 'top-right', label: 'Top right' },
  { value: 'middle-left', label: 'Middle left' },
  { value: 'center', label: 'Center' },
  { value: 'middle-right', label: 'Middle right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-center', label: 'Bottom center' },
  { value: 'bottom-right', label: 'Bottom right' },
]

/** Parses "1-3,5,7-9" into 0-based page indices within bounds. */
export function parseWatermarkRange(
  range: string,
  pageCount: number,
): number[] {
  const seen = new Set<number>()
  const parts = range.split(',').map((part) => part.trim()).filter(Boolean)
  for (const part of parts) {
    const match = part.match(/^(\d+)\s*-\s*(\d+)$/)
    if (match) {
      const start = Math.max(1, Number(match[1]))
      const end = Math.min(pageCount, Number(match[2]))
      if (start <= end) {
        for (let page = start; page <= end; page += 1) seen.add(page - 1)
      }
    } else if (/^\d+$/.test(part)) {
      const page = Number(part)
      if (page >= 1 && page <= pageCount) seen.add(page - 1)
    }
  }
  return Array.from(seen).sort((a, b) => a - b)
}

/** Grid placement in pdf-lib coordinates (origin bottom-left, y up). */
function placeAt(
  position: WatermarkPosition,
  pageWidth: number,
  pageHeight: number,
  itemWidth: number,
  itemHeight: number,
  margin: number,
): { x: number; y: number } {
  const x =
    position === 'center' ||
    position === 'top-center' ||
    position === 'bottom-center'
      ? (pageWidth - itemWidth) / 2
      : position === 'top-right' ||
          position === 'middle-right' ||
          position === 'bottom-right'
        ? pageWidth - itemWidth - margin
        : margin
  const y =
    position === 'center' ||
    position === 'middle-left' ||
    position === 'middle-right'
      ? (pageHeight - itemHeight) / 2
      : position === 'top-left' ||
          position === 'top-center' ||
          position === 'top-right'
        ? pageHeight - itemHeight - margin
        : margin
  return { x, y }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace(/^#/, '')
  const value = Number.parseInt(cleaned, 16)
  if (cleaned.length !== 6 || Number.isNaN(value)) {
    return { r: 17, g: 17, b: 17 }
  }
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

export function isValidWatermarkImage(mime: string): boolean {
  return mime === 'image/png' || mime === 'image/jpeg'
}

async function embedWatermarkImage(
  doc: PDFDocument,
  source: WatermarkImageSource,
): Promise<PDFImage> {
  if (source.mime === 'image/png') return doc.embedPng(source.bytes)
  if (source.mime === 'image/jpeg') return doc.embedJpg(source.bytes)
  throw new Error(
    'Image watermarks accept PNG or JPEG. Convert the image and try again.',
  )
}

/** Draws a single watermark instance at a position on a page. */
function drawInstance(
  page: PDFPage,
  config: WatermarkConfig,
  font: PDFFont,
  boldFont: PDFFont,
  image: PDFImage | null,
  x: number,
  y: number,
  itemWidth: number,
  itemHeight: number,
): void {
  const color = hexToRgb(config.color)
  const fill = rgb(color.r / 255, color.g / 255, color.b / 255)
  const rotate = degrees(config.rotation)

  if (config.kind === 'image') {
    if (!image) return
    page.drawImage(image, {
      x,
      y,
      width: itemWidth,
      height: itemHeight,
      opacity: config.opacity,
      rotate,
    })
    return
  }

  const size = config.fontSize
  if (config.kind === 'stamp') {
    page.drawRectangle({
      x: x - size * 0.15,
      y: y - size * 0.4,
      width: itemWidth + size * 0.3,
      height: itemHeight + size * 0.5,
      borderColor: fill,
      borderWidth: Math.max(1.5, size * 0.04),
      opacity: config.opacity,
      rotate,
    })
    page.drawRectangle({
      x: x - size * 0.1,
      y: y - size * 0.35,
      width: itemWidth + size * 0.2,
      height: itemHeight + size * 0.4,
      borderColor: fill,
      borderWidth: Math.max(0.75, size * 0.015),
      opacity: config.opacity,
      rotate,
    })
  }

  page.drawText(config.text, {
    x,
    y: y - size * 0.35,
    size,
    font: config.kind === 'stamp' ? boldFont : font,
    color: fill,
    opacity: config.opacity,
    rotate,
  })
}

/** Applies a watermark to the selected pages and returns a new PDF. */
export async function applyWatermark(
  sourceBytes: Uint8Array,
  config: WatermarkConfig,
  pageIndices: number[],
): Promise<WatermarkResult> {
  const doc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true })
  const fontKey =
    config.fontFamily === 'times'
      ? StandardFonts.TimesRoman
      : config.fontFamily === 'courier'
        ? StandardFonts.Courier
        : StandardFonts.Helvetica
  const font = await doc.embedFont(fontKey)
  const boldFont = await doc.embedFont(
    config.fontFamily === 'times'
      ? StandardFonts.TimesRomanBold
      : config.fontFamily === 'courier'
        ? StandardFonts.CourierBold
        : StandardFonts.HelveticaBold,
  )

  const embeddedImage =
    config.kind === 'image' && config.image
      ? await embedWatermarkImage(doc, config.image)
      : null

  const margin = 48
  const pages = doc.getPages()
  for (const pageIndex of pageIndices) {
    if (pageIndex < 0 || pageIndex >= pages.length) continue
    const page = pages[pageIndex]
    const pageWidth = page.getWidth()
    const pageHeight = page.getHeight()

    let itemWidth: number
    let itemHeight: number
    if (config.kind === 'image' && embeddedImage) {
      const ratio = embeddedImage.height / embeddedImage.width
      itemWidth = Math.max(
        24,
        Math.min(pageWidth * (config.imageScale ?? 0.25), pageWidth - margin * 2),
      )
      itemHeight = itemWidth * ratio
    } else if (config.kind === 'stamp') {
      itemWidth = font.widthOfTextAtSize(config.text, config.fontSize)
      itemHeight = config.fontSize * 1.5
    } else {
      itemWidth = font.widthOfTextAtSize(config.text, config.fontSize)
      itemHeight = config.fontSize
    }

    if (config.tile) {
      const spacing = itemHeight * 1.5
      const cellWidth = itemWidth + spacing
      const cellHeight = itemHeight + spacing
      for (let x = margin; x < pageWidth - itemWidth - margin / 2; x += cellWidth) {
        for (
          let y = margin;
          y < pageHeight - itemHeight - margin / 2;
          y += cellHeight
        ) {
          drawInstance(
            page,
            config,
            font,
            boldFont,
            embeddedImage,
            x,
            y,
            itemWidth,
            itemHeight,
          )
        }
      }
    } else {
      const { x, y } = placeAt(
        config.position,
        pageWidth,
        pageHeight,
        itemWidth,
        itemHeight,
        margin,
      )
      drawInstance(
        page,
        config,
        font,
        boldFont,
        embeddedImage,
        x,
        y,
        itemWidth,
        itemHeight,
      )
    }
  }

  const bytes = await doc.save()
  return { bytes, pageCount: doc.getPageCount() }
}