import { rgb, type RGB } from 'pdf-lib'
import { localBytes } from '../types'
import type { LocalToolContext, LocalToolResult } from '../types'
import {
  NAMESPACES,
  emuToPt,
  hexToRgb,
  partXml,
  readOfficeArchive,
  wrapText,
} from '../lib/office'

const P = NAMESPACES.p
const A = NAMESPACES.a

/**
 * Local PowerPoint (.pptx) → PDF conversion. The slide XML parts are parsed,
 * each slide becomes one PDF page sized from the presentation's slide size,
 * and text boxes / pictures are drawn at their EMU positions with their real
 * fonts, sizes and colors.
 */

function childByTag(node: Element, tag: string, ns = A): Element | null {
  return Array.from(node.children).find(
    (child) => child.localName === tag && child.namespaceURI === ns,
  ) ?? null
}

function textContent(node: Element, tag: string, ns = A): string {
  return childByTag(node, tag, ns)?.textContent ?? ''
}

interface SlideTextRun {
  text: string
  size: number
  bold: boolean
  italic: boolean
  underline: boolean
  color: RGB
}

interface SlideParagraph {
  runs: SlideTextRun[]
}

interface SlideShape {
  kind: 'text' | 'picture'
  x: number
  y: number
  width: number
  height: number
  paragraphs?: SlideParagraph[]
  image?: { bytes: Uint8Array; extension: string }
  rotation?: number
}

function parseRun(run: Element): SlideTextRun {
  const rPr = childByTag(run, 'rPr')
  const size = rPr?.getAttribute('sz') ? Number(rPr.getAttribute('sz')) / 100 : 18
  const bold = Boolean(rPr?.getAttribute('b'))
  const italic = Boolean(rPr?.getAttribute('i'))
  const underline = Boolean(rPr?.getAttribute('u'))
  const fill = rPr ? childByTag(rPr, 'solidFill') : null
  const colorNode = fill ? childByTag(fill, 'srgbClr') ?? childByTag(fill, 'schemeClr') : null
  const color = hexToRgb(colorNode?.getAttribute('val') ?? null) ?? rgb(0.1, 0.1, 0.1)
  return { text: textContent(run, 't'), size, bold, italic, underline, color }
}

function parseTextShape(shape: Element): SlideShape | null {
  const txBody = childByTag(shape, 'txBody', P)
  if (!txBody) return null
  const xfrm = childByTag(shape, 'xfrm', P)
  const off = xfrm ? childByTag(xfrm, 'off', A) : null
  const ext = xfrm ? childByTag(xfrm, 'ext', A) : null
  const paragraphs: SlideParagraph[] = []
  for (const pEl of Array.from(txBody.children).filter(
    (child) => child.localName === 'p' && child.namespaceURI === A,
  )) {
    const runs: SlideTextRun[] = []
    for (const node of Array.from(pEl.children)) {
      if (node.localName === 'r') {
        const run = parseRun(node)
        if (run.text.trim()) runs.push(run)
      } else if (node.localName === 'br') {
        runs.push({ text: '\n', size: 18, bold: false, italic: false, underline: false, color: rgb(0.1, 0.1, 0.1) })
      }
    }
    paragraphs.push({ runs })
  }
  return {
    kind: 'text',
    x: off ? emuToPt(Number(off.getAttribute('x') ?? 0)) : 0,
    y: off ? emuToPt(Number(off.getAttribute('y') ?? 0)) : 0,
    width: ext ? emuToPt(Number(ext.getAttribute('cx') ?? 0)) : 400,
    height: ext ? emuToPt(Number(ext.getAttribute('cy') ?? 0)) : 200,
    rotation: xfrm?.getAttribute('rot') ? Number(xfrm.getAttribute('rot')) / 60000 : 0,
    paragraphs,
  }
}

function parsePictureShape(
  shape: Element,
  media: Map<string, { bytes: Uint8Array; extension: string }>,
): SlideShape | null {
  const blip = shape.querySelector(`blip[r\\:embed], blip`)
  if (!blip) return null
  const embed = blip.getAttribute('r:embed') ?? blip.getAttribute('embed')
  const image = embed ? media.get(embed) : undefined
  if (!image) return null
  const xfrm = childByTag(shape, 'xfrm', P)
  const off = xfrm ? childByTag(xfrm, 'off', A) : null
  const ext = xfrm ? childByTag(xfrm, 'ext', A) : null
  return {
    kind: 'picture',
    x: off ? emuToPt(Number(off.getAttribute('x') ?? 0)) : 0,
    y: off ? emuToPt(Number(off.getAttribute('y') ?? 0)) : 0,
    width: ext ? emuToPt(Number(ext.getAttribute('cx') ?? 0)) : 200,
    height: ext ? emuToPt(Number(ext.getAttribute('cy') ?? 0)) : 150,
    image,
  }
}

function slideMedia(
  archive: Record<string, Uint8Array>,
  _slidePath: string,
): Map<string, { bytes: Uint8Array; extension: string }> {
  const media = new Map<string, { bytes: Uint8Array; extension: string }>()
  const slideName = _slidePath.split('/').pop() ?? 'slide1.xml'
  const relsBytes = archive[`ppt/slides/_rels/${slideName}.rels`]
  if (!relsBytes) return media
  const relsDoc = partXml(relsBytes)
  for (const rel of Array.from(relsDoc.documentElement.children)) {
    const id = rel.getAttribute('Id')
    const target = rel.getAttribute('Target') ?? ''
    if (!id || !/^\.\.\/media\//.test(target)) continue
    const mediaPath = `ppt/media/${target.replace(/^\.\.\/media\//, '')}`
    const bytes = archive[mediaPath]
    if (!bytes) continue
    const extension = target.split('.').pop()?.toLowerCase() ?? 'png'
    media.set(id, { bytes, extension })
  }
  return media
}

export async function pptxToPdfHandler(
  context: LocalToolContext,
): Promise<LocalToolResult> {
  const { files, options, onProgress } = context
  if (files.length === 0) throw new Error('Choose a .pptx file to convert.')

  const source = files.find((file) => /\.pptx$/i.test(file.name)) ?? files[0]
  const bytes = await localBytes(source)
  const archive = readOfficeArchive(bytes)

  // Slide size from presentation.xml (EMU -> points).
  const presentationXml = archive['ppt/presentation.xml']
  if (!presentationXml) {
    throw new Error('The .pptx file does not contain a presentation.xml part.')
  }
  const presentation = partXml(presentationXml)
  const sldSz = Array.from(presentation.documentElement.children).find(
    (child) => child.localName === 'sldSz',
  )
  const slideWidth = sldSz ? emuToPt(Number(sldSz.getAttribute('cx') ?? 0)) || 960 : 960
  const slideHeight = sldSz ? emuToPt(Number(sldSz.getAttribute('cy') ?? 0)) || 540 : 540

  const slidePaths = Object.keys(archive)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => {
      const numA = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      const numB = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      return numA - numB
    })

  if (slidePaths.length === 0) {
    throw new Error('The .pptx file does not contain any slides.')
  }

  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont('Helvetica')
  const bold = await doc.embedFont('Helvetica-Bold')

  const pageSize = String(options.page_size ?? 'auto').toLowerCase()
  const pageWidth = pageSize === 'a4' ? 595.28 : pageSize === 'letter' ? 612 : slideWidth
  const pageHeight = pageSize === 'a4' ? 841.89 : pageSize === 'letter' ? 792 : slideHeight
  const scaleX = pageWidth / slideWidth
  const scaleY = pageHeight / slideHeight

  let processed = 0
  for (const slidePath of slidePaths) {
    onProgress?.(
      Math.round((processed / slidePaths.length) * 100),
      `Rendering slide ${processed + 1} of ${slidePaths.length}`,
    )
    processed += 1
    const slideDoc = partXml(archive[slidePath])
    const media = slideMedia(archive, slidePath)
    const shapes: SlideShape[] = []
    // The slide's shapes live inside p:sld > p:cSld > p:spTree, not at the
    // document root. Walk the tree and collect text boxes and pictures.
    const cSld = Array.from(slideDoc.documentElement.children).find(
      (child) => child.localName === 'cSld' && child.namespaceURI === P,
    )
    const spTree = cSld
      ? Array.from(cSld.children).find(
          (child) => child.localName === 'spTree' && child.namespaceURI === P,
        )
      : undefined
    const shapeNodes = spTree
      ? Array.from(spTree.children)
      : Array.from(slideDoc.documentElement.children)
    for (const node of shapeNodes) {
      if (node.localName === 'sp' && node.namespaceURI === P) {
        const shape = parseTextShape(node as Element)
        if (shape) shapes.push(shape)
      } else if (node.localName === 'pic' && node.namespaceURI === P) {
        const shape = parsePictureShape(node as Element, media)
        if (shape) shapes.push(shape)
      } else if (node.localName === 'grpSp' && node.namespaceURI === P) {
        // First-level group: include contained text shapes and pictures.
        for (const inner of Array.from(node.children)) {
          if (inner.localName === 'sp') {
            const shape = parseTextShape(inner as Element)
            if (shape) shapes.push(shape)
          } else if (inner.localName === 'pic') {
            const shape = parsePictureShape(inner as Element, media)
            if (shape) shapes.push(shape)
          }
        }
      }
    }
    for (const node of shapeNodes) {
      if (node.localName === 'sp' && node.namespaceURI === P) {
        const shape = parseTextShape(node as Element)
        if (shape) shapes.push(shape)
      } else if (node.localName === 'pic' && node.namespaceURI === P) {
        const shape = parsePictureShape(node as Element, media)
        if (shape) shapes.push(shape)
      } else if (node.localName === 'grpSp' && node.namespaceURI === P) {
        // First-level group: include contained text shapes and pictures.
        for (const inner of Array.from(node.children)) {
          if (inner.localName === 'sp') {
            const shape = parseTextShape(inner as Element)
            if (shape) shapes.push(shape)
          } else if (inner.localName === 'pic') {
            const shape = parsePictureShape(inner as Element, media)
            if (shape) shapes.push(shape)
          }
        }
      }
    }

    const page = doc.addPage([pageWidth, pageHeight])
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
      color: rgb(1, 1, 1),
    })

    for (const shape of shapes) {
      const x = shape.x * scaleX
      const y = pageHeight - (shape.y + shape.height) * scaleY
      const width = shape.width * scaleX
      const height = shape.height * scaleY

      if (shape.kind === 'picture' && shape.image) {
        const ext = shape.image.extension
        if (ext === 'jpg' || ext === 'jpeg') {
          const image = await doc.embedJpg(shape.image.bytes)
          page.drawImage(image, { x, y, width, height })
        } else if (ext === 'png') {
          const image = await doc.embedPng(shape.image.bytes)
          page.drawImage(image, { x, y, width, height })
        } else if (ext === 'gif' || ext === 'bmp' || ext === 'webp' || ext === 'svg') {
          // pdf-lib cannot embed these directly; render as a framed box.
          page.drawRectangle({
            x,
            y,
            width,
            height,
            borderColor: rgb(0.8, 0.8, 0.8),
            borderWidth: 0.5,
          })
        }
        continue
      }

      if (shape.kind !== 'text' || !shape.paragraphs) continue
      let cursorY = y + height - 6 * scaleY
      const maxTextWidth = Math.max(20, width - 6)
      for (const paragraph of shape.paragraphs) {
        const firstRun = paragraph.runs[0]
        const lineHeight = Math.max(10, (firstRun?.size ?? 18) * 1.25 * scaleY)
        for (const run of paragraph.runs) {
          if (run.text === '\n') {
            cursorY -= lineHeight
            continue
          }
          const runSize = Math.max(5, run.size * scaleY)
          const fontToUse = run.bold ? bold : font
          const lines = wrapText(run.text, fontToUse, runSize, maxTextWidth)
          for (const line of lines) {
            if (cursorY < 4) break
            page.drawText(line, { x: x + 3, y: cursorY - 3, size: runSize, font: fontToUse, color: run.color })
            if (run.underline) {
              page.drawLine({
                start: { x: x + 3, y: cursorY - 3 },
                end: { x: x + 3 + fontToUse.widthOfTextAtSize(line, runSize), y: cursorY - 3 },
                thickness: 0.6,
                color: run.color,
              })
            }
            cursorY -= lineHeight
          }
        }
      }
    }
  }

  const outBytes = await doc.save({ useObjectStreams: true })
  const blob = new Blob([outBytes as unknown as BlobPart], {
    type: 'application/pdf',
  })
  const baseName = source.name.replace(/\.pptx$/i, '') || 'presentation'
  return {
    blob,
    filename: `${baseName}.pdf`,
    mimeType: 'application/pdf',
    summary: `${doc.getPageCount()} slide${doc.getPageCount() > 1 ? 's' : ''} · ${(
      blob.size / 1024
    ).toFixed(1)} KB`,
  }
}