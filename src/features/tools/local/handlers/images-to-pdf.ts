import { PDFDocument, PDFImage } from 'pdf-lib'
import { decodeImageFile } from '../lib/image'
import type { LocalToolContext, LocalToolResult } from '../types'

const A4 = { width: 595.28, height: 841.89 }
const LETTER = { width: 612, height: 792 }

function pageSizeFor(pageSize: string): { width: number; height: number } {
  if (pageSize === 'letter') return LETTER
  return A4
}

function applyOrientation(
  page: { width: number; height: number },
  orientation: 'auto' | 'portrait' | 'landscape',
  imageRatio: number,
): { width: number; height: number } {
  if (orientation === 'portrait') {
    return page.width > page.height
      ? { width: page.height, height: page.width }
      : page
  }
  if (orientation === 'landscape') {
    return page.width < page.height
      ? { width: page.height, height: page.width }
      : page
  }
  return imageRatio >= 1
    ? { width: Math.max(page.width, page.height), height: Math.min(page.width, page.height) }
    : { width: Math.min(page.width, page.height), height: Math.max(page.width, page.height) }
}

async function embedImage(
  pdfDoc: PDFDocument,
  data: Uint8Array,
  mimeType: string,
): Promise<PDFImage> {
  if (mimeType === 'image/jpeg') return pdfDoc.embedJpg(data)
  return pdfDoc.embedPng(data)
}

export async function imagesToPdfHandler(
  context: LocalToolContext,
): Promise<LocalToolResult> {
  const { files, options, onProgress } = context
  if (files.length === 0) {
    throw new Error('Choose at least one image.')
  }

  const dpi = Number(options.dpi ?? 150)
  const pageSizeId = String(options.page_size ?? 'auto')
  const orientation = String(options.orientation ?? 'auto') as
    | 'auto'
    | 'portrait'
    | 'landscape'

  const pdfDoc = await PDFDocument.create()
  pdfDoc.setProducer('ScissorsDoc local converter')
  pdfDoc.setCreator('ScissorsDoc')

  for (let index = 0; index < files.length; index++) {
    const file = files[index]
    const decoded = await decodeImageFile(file)
    const image = await embedImage(pdfDoc, decoded.data, decoded.mimeType)
    const imageRatio = decoded.width / decoded.height

    if (pageSizeId === 'auto') {
      const dpiScale = dpi / 72
      const rawWidth = Math.max(1, Math.round(decoded.width * dpiScale))
      const rawHeight = Math.max(1, Math.round(decoded.height * dpiScale))
      const size = applyOrientation(
        { width: rawWidth, height: rawHeight },
        orientation,
        imageRatio,
      )
      const page = pdfDoc.addPage([size.width, size.height])
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: size.width,
        height: size.height,
      })
    } else {
      const base = pageSizeFor(pageSizeId)
      const size = applyOrientation(base, orientation, imageRatio)
      const page = pdfDoc.addPage([size.width, size.height])
      const margin = 36
      const maxWidth = page.getWidth() - margin * 2
      const maxHeight = page.getHeight() - margin * 2
      const ratio = Math.min(
        maxWidth / decoded.width,
        maxHeight / decoded.height,
      )
      const drawWidth = decoded.width * ratio
      const drawHeight = decoded.height * ratio
      page.drawImage(image, {
        x: (page.getWidth() - drawWidth) / 2,
        y: (page.getHeight() - drawHeight) / 2,
        width: drawWidth,
        height: drawHeight,
      })
    }

    onProgress?.(
      Math.round(((index + 1) / files.length) * 100),
      `Adding ${file.name}`,
    )
  }

  const bytes = await pdfDoc.save({ useObjectStreams: true })
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: 'application/pdf',
  })
  return {
    blob,
    filename: `images-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    summary: `${files.length} image${files.length > 1 ? 's' : ''} · ${(
      blob.size / 1024
    ).toFixed(1)} KB`,
  }
}