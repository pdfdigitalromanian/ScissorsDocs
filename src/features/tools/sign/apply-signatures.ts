import { degrees, PDFDocument } from 'pdf-lib'
import { looksLikePdf } from '@/features/editor/engine'
import { dataUrlToBytes, type SignatureImage } from './signature-lib'

/** One signature placed on a page, in PDF points (bottom-left origin). */
export interface PlacedSignature {
  id: string
  pageIndex: number
  sourceId: string
  x: number
  y: number
  width: number
  height: number
  /** Clockwise degrees, rotated about the signature's center. */
  rotation: number
  /** Optional per-placement color override (hex). */
  color?: string
  /** Optional per-placement stroke width as a percentage (100 = as drawn). */
  strokeWidth?: number
  /** Pre-rendered PNG data URL reflecting the color/strokeWidth overrides. */
  displayUrl?: string
}

export interface ApplySignaturesResult {
  bytes: Uint8Array
  pageCount: number
  placed: number
}

/**
 * Embeds every placed signature into the source PDF with pdf-lib. The output
 * is re-opened and verified before it is returned — placement never changes
 * the number of pages or any unrelated content.
 */
export async function applySignatures(
  sourceBytes: Uint8Array,
  signatures: SignatureImage[],
  placements: PlacedSignature[],
): Promise<ApplySignaturesResult> {
  if (!looksLikePdf(sourceBytes)) {
    throw new Error('The selected file is not a valid PDF.')
  }
  const doc = await PDFDocument.load(sourceBytes)
  const originalPages = doc.getPageCount()

  const embedded = new Map<string, Awaited<ReturnType<PDFDocument['embedPng']>>>()
  for (const signature of signatures) {
    if (embedded.has(signature.id)) continue
    embedded.set(signature.id, await doc.embedPng(signature.bytes))
  }

  let placed = 0
  for (const placement of placements) {
    if (placement.pageIndex < 0 || placement.pageIndex >= originalPages) {
      continue
    }
    let image = embedded.get(placement.sourceId)
    if (placement.displayUrl) {
      /* A per-placement override (color/stroke width) pre-renders its own
         PNG; embed that instead of the original asset. */
      image = await doc.embedPng(dataUrlToBytes(placement.displayUrl))
    }
    if (!image) continue
    const page = doc.getPage(placement.pageIndex)
    page.drawImage(image, {
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      rotate: degrees(placement.rotation),
    })
    placed += 1
  }

  if (placed === 0) {
    throw new Error(
      'Place at least one signature on the document before applying.',
    )
  }

  const bytes = await doc.save({ useObjectStreams: true })

  const reopened = await PDFDocument.load(bytes)
  if (reopened.getPageCount() !== originalPages) {
    throw new Error('The signed PDF lost content while it was being generated.')
  }

  return { bytes, pageCount: reopened.getPageCount(), placed }
}
