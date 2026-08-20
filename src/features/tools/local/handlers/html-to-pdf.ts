import html2canvas from 'html2canvas'
import {
  PDFDocument,
  PDFFont,
  StandardFonts,
  rgb,
} from 'pdf-lib'
import type { RGB } from 'pdf-lib'
import { localBytes } from '../types'
import type { LocalToolContext, LocalToolResult } from '../types'
import { decodeTextBytes, sanitizeWinAnsi } from '../lib/decode'

const A4 = { width: 595.28, height: 841.89 }
const LETTER = { width: 612, height: 792 }
const PT_TO_PX = 96 / 72

/**
 * Removes executable <script> blocks from a full HTML document string.
 * Used as a second-pass retry when a script-driven page prevents the visual
 * capture from being read.
 */
function stripScripts(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*\/>/gi, '')
}

export const NAVIGATION_GUARD_JS =
  '!function(){' +
  'try{window.addEventListener("beforeunload",function(e){e.preventDefault();e.returnValue=""})}catch(e){}' +
  'try{window.open=function(){return null}}catch(e){}' +
  '}();'

/**
 * Injected as the first element of the capture document's <head>. Blocks the
 * page's own scripts from navigating the iframe away (e.g. google.com ->
 * www.google.com). If the capture frame navigated cross-origin, its document
 * becomes unreadable and the rasterizer dies with a SecurityError, silently
 * falling back to a plain-text PDF — this guard prevents that.
 */
const NAVIGATION_GUARD = `<script>${NAVIGATION_GUARD_JS}</script>`

export interface HtmlPdfOutput {
  bytes: Uint8Array
  pageCount: number
}

export interface HtmlPdfOptions {
  pageSize?: 'a4' | 'letter'
  orientation?: 'portrait' | 'landscape'
  margin?: number
  /** Absolute URL the document's relative resources resolve against. */
  baseUrl?: string
  /**
   * Viewport width (in CSS pixels) the document is rendered and captured at.
   * Defaults to the page content width; pass a desktop width (e.g. 1280) to
   * lay the page out like it is opened in a browser instead of a narrow
   * mobile-width column.
   */
  viewportWidth?: number
  onProgress?: LocalToolContext['onProgress']
}

function pageSizeFor(pageSize: string): { width: number; height: number } {
  if (pageSize === 'letter') return LETTER
  return A4
}

interface TextStyle {
  bold: boolean
  italic: boolean
  underline: boolean
  color: RGB
  fontSize: number
}

interface InlineNode extends TextStyle {
  text: string
}

interface BlockNode {
  type: 'paragraph' | 'heading' | 'list-item' | 'quote' | 'rule' | 'pre'
  level?: number
  children: InlineNode[]
}

const BASE_STYLE: TextStyle = {
  bold: false,
  italic: false,
  underline: false,
  color: rgb(0, 0, 0),
  fontSize: 12,
}

/**
 * Rasterizes an HTML document with the browser's own engine by loading it
 * into a hidden iframe and capturing it with html2canvas — the standard
 * DOM-to-canvas renderer. html2canvas re-paints the live layout directly, so
 * stylesheets, images, icon fonts and scripts all travel into the raster the
 * way the browser paints them. The resulting canvas is sliced into fixed-size
 * page chunks and embedded as PNGs — this is what makes the PDF actually look
 * like the rendered webpage instead of plain text.
 *
 * The previous implementation routed the capture through an SVG
 * <foreignObject> loaded into an <img>. That approach was fragile: it is
 * unsupported in Firefox, Chromium can miss the first paint, inline scripts
 * were mangled by XMLSerializer, and any cross-origin sub-resource tainted
 * the canvas and silently degraded the PDF to the plain-text fallback.
 * html2canvas avoids all of those failure modes — unreadable images are
 * simply omitted instead of poisoning the whole capture.
 *
 * Stylesheets that are readable from the iframe are inlined before capture so
 * they travel into the raster (external <link> sheets do not paint inside a
 * foreignObject). When a `baseUrl` is provided a <base> element is injected
 * so relative stylesheets, images and fonts resolve like they do on the real
 * page.
 *
 * Throws when the browser blocks the capture; the caller falls back to the
 * text layout.
 */
async function renderHtmlToCanvas(
  html: string,
  contentWidthPx: number,
  baseUrl?: string,
): Promise<HTMLCanvasElement> {
  const fullDoc = /<html[\s>]/i.test(html)
    ? html
    : `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`
  // The navigation guard runs before any page script so the capture frame
  // always stays readable (its document is used to measure and serialize).
  const guardedDoc = /<head([^>]*)>/i.test(fullDoc)
    ? fullDoc.replace(
      /<head([^>]*)>/i,
      (_match, attrs: string) => `<head${attrs}>${NAVIGATION_GUARD}`,
    )
    : fullDoc.replace(
      /<html([^>]*)>/i,
      (_match, attrs: string) =>
        `<html${attrs}><head>${NAVIGATION_GUARD}</head>`,
    )

  // The iframe keeps the real content width (not 0) so media queries and
  // percentage layouts resolve the same way they would on the page.
  const frame = document.createElement('iframe')
  frame.setAttribute(
    'style',
    'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none;' +
    `width:${contentWidthPx}px;height:0;border:0;overflow:hidden;`,
  )
  // allow-scripts lets SPAs render; allow-same-origin keeps the srcdoc on the
  // parent origin so we can read it back. The sandbox also stops the fetched
  // page from navigating our app's own window.
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin')
  document.body.appendChild(frame)
  try {
    frame.srcdoc = guardedDoc
    await new Promise<void>((resolve) => {
      frame.addEventListener('load', () => resolve(), { once: true })
      // A page that never finishes loading (endless script, stalled resource)
      // must not hang the conversion forever.
      window.setTimeout(() => resolve(), 8000)
    })
    const doc = frame.contentDocument
    if (!doc || !doc.documentElement) {
      throw new Error('render: no document')
    }

    if (baseUrl) {
      const base = doc.createElement('base')
      base.href = baseUrl
      doc.head.appendChild(base)
    }

    // Inline every stylesheet the iframe can read. Inside the SVG capture a
    // <link rel="stylesheet"> is inert, so the rules must become <style> text
    // or the page would render without its CSS.
    for (const link of Array.from(
      doc.querySelectorAll('link[rel="stylesheet"]'),
    )) {
      const sheet = (link as HTMLLinkElement).sheet
      if (sheet && sheet.cssRules) {
        try {
          const css = Array.from(sheet.cssRules)
            .map((rule) => rule.cssText)
            .join('\n')
          if (css.trim()) {
            const style = doc.createElement('style')
            style.textContent = css
            link.parentNode?.insertBefore(style, link.nextSibling)
          }
        } catch {
          // Cross-origin sheet — keep the <link> (it still loads in the
          // iframe, just not inside the SVG capture).
        }
      }
    }

    const style = doc.createElement('style')
    style.textContent =
      'html,body{margin:0!important;padding:0!important;' +
      `width:${contentWidthPx}px!important;}` +
      'body{overflow:visible!important;}' +
      '*{-webkit-print-color-adjust:exact!important;' +
      'print-color-adjust:exact!important;}'
    doc.head.appendChild(style)

    const body = doc.body

    // Give script-driven pages (React/Next/Vite SPAs) time to render before
    // measuring the layout. Poll until the page height is stable so we
    // capture the real, hydrated content instead of an empty shell.
    const settleStart = Date.now()
    let lastHeight = -1
    let stableSamples = 0
    while (Date.now() - settleStart < 4500) {
      const h = Math.max(
        body?.scrollHeight ?? 0,
        body?.offsetHeight ?? 0,
        doc.documentElement.scrollHeight,
      )
      if (h === lastHeight) {
        stableSamples += 1
        if (stableSamples >= 3) break
      } else {
        stableSamples = 0
        lastHeight = h
      }
      await new Promise((resolve) => window.setTimeout(resolve, 200))
    }

    // html2canvas re-paints the document from its computed styles, so
    // cross-origin <link> stylesheets that loaded in the iframe paint
    // correctly without being inlined. Same-origin sheets are still inlined
    // above so html2canvas can read them directly; unreadable (cross-origin)
    // sheets are simply left as <link> tags and travel into the capture the
    // way the browser applies them.

    await Promise.race([
      Promise.all(
        Array.from(doc.images).map(
          (img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((resolve) => {
                img.addEventListener('load', () => resolve(), { once: true })
                img.addEventListener('error', () => resolve(), { once: true })
              }),
        ),
      ),
      new Promise((resolve) => window.setTimeout(resolve, 1500)),
    ])
    try {
      await (doc.fonts?.ready ?? Promise.resolve())
    } catch {
      // Fonts that fail to load must not abort the whole conversion.
    }
    await new Promise((resolve) => window.setTimeout(resolve, 120))

    // The frame starts at height 0 so content can grow unconstrained, but
    // `vh` units, `position: fixed` and height-based media queries would then
    // resolve against a zero-tall viewport and collapse ("fixed elements don't
    // show"). Grow the frame to the measured content height and let the layout
    // settle once so those rules render against a real viewport height.
    let height = Math.max(
      body?.scrollHeight ?? 0,
      body?.offsetHeight ?? 0,
      doc.documentElement.scrollHeight,
    )
    if (!height || height < 1) throw new Error('render: empty layout')
    frame.style.height = `${height}px`
    await new Promise((resolve) => window.setTimeout(resolve, 250))
    height = Math.max(
      body?.scrollHeight ?? 0,
      body?.offsetHeight ?? 0,
      doc.documentElement.scrollHeight,
    )
    if (height > 30000) throw new Error('render: document too tall')

    // Capture the rendered page with html2canvas, which re-paints the live
    // DOM directly (no SVG <foreignObject>, no XML serialization). The frame
    // has already grown to the measured content height, so the body's bounds
    // equal the full document height and the whole page lands in the raster.
    // Images that cannot be fetched (cross-origin without CORS) are omitted
    // rather than tainting the capture.
    const canvas = await html2canvas(body, {
      width: contentWidthPx,
      height,
      windowWidth: contentWidthPx,
      windowHeight: height,
      scale: 1,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
    })
    return canvas
  } finally {
    frame.remove()
  }
}

async function rasterizeHtmlToPdf(
  html: string,
  size: { width: number; height: number },
  margin: number,
  baseUrl: string | undefined,
  viewportWidth: number,
  onProgress?: LocalToolContext['onProgress'],
): Promise<HtmlPdfOutput> {
  const pdfDoc = await PDFDocument.create()
  // The capture happens at the requested viewport width; the page's own
  // aspect ratio decides how tall each PDF page is in pixels.
  const captureWidth = Math.max(1, Math.round(viewportWidth))
  const pageContentPx = Math.max(
    1,
    Math.round(captureWidth * (size.height / size.width)),
  )
  // First try with scripts so SPA-rendered sites capture their real content.
  // If a page's own scripts break the capture, retry the same document with
  // scripts removed rather than silently degrading to a plain-text PDF.
  let canvas: HTMLCanvasElement
  try {
    canvas = await renderHtmlToCanvas(html, captureWidth, baseUrl)
  } catch (reason) {
    console.warn(
      '[html-to-pdf] scripted capture failed, retrying without scripts.',
      reason,
    )
    canvas = await renderHtmlToCanvas(
      stripScripts(html),
      captureWidth,
      baseUrl,
    )
  }
  const fullHeight = canvas.height
  const count = Math.max(1, Math.ceil(fullHeight / pageContentPx))
  // Width/height of the drawn region on the PDF page, scaled to fit width.
  const drawWidth = size.width - margin * 2
  const drawHeight = drawWidth * (size.height / size.width)

  for (let index = 0; index < count; index += 1) {
    const y = index * pageContentPx
    const sliceHeight = Math.min(pageContentPx, fullHeight - y)
    const slice = document.createElement('canvas')
    slice.width = captureWidth
    slice.height = pageContentPx
    const ctx = slice.getContext('2d')
    if (!ctx) throw new Error('render: no 2d context')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, captureWidth, pageContentPx)
    ctx.drawImage(
      canvas,
      0,
      y,
      captureWidth,
      sliceHeight,
      0,
      0,
      captureWidth,
      sliceHeight,
    )
    const blob = await new Promise<Blob>((resolve, reject) =>
      slice.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error('render: no png')),
        'image/png',
      ),
    )
    const png = await pdfDoc.embedPng(
      new Uint8Array(await blob.arrayBuffer()),
    )
    const page = pdfDoc.addPage([size.width, size.height])
    page.drawImage(png, {
      x: margin,
      y: margin,
      width: drawWidth,
      height: drawHeight,
    })
    onProgress?.(
      ((index + 1) / count) * 100,
      `Rendering page ${index + 1} of ${count}`,
    )
  }

  const bytes = await pdfDoc.save({ useObjectStreams: true })
  return { bytes, pageCount: pdfDoc.getPageCount() }
}

// ------------------------------------------------------------------ //
// Text-layout fallback — a lightweight structured layout of the HTML
// when browser rasterization is unavailable.
// ------------------------------------------------------------------ //

function fontFor(
  fonts: {
    regular: PDFFont
    bold: PDFFont
    italic: PDFFont
    boldItalic: PDFFont
  },
  style: TextStyle,
): PDFFont {
  if (style.bold && style.italic) return fonts.boldItalic
  if (style.bold) return fonts.bold
  if (style.italic) return fonts.italic
  return fonts.regular
}

function styleOf(element: Element, inherited: TextStyle): TextStyle {
  const style = { ...inherited }
  const tag = element.tagName.toLowerCase()
  if (['b', 'strong'].includes(tag)) style.bold = true
  if (['i', 'em'].includes(tag)) style.italic = true
  if (['u', 'ins'].includes(tag)) style.underline = true
  const colorText = element.getAttribute('color')
  if (colorText && /^#([0-9a-fA-F]{6})$/.test(colorText)) {
    const num = parseInt(colorText.slice(1), 16)
    style.color = rgb(
      ((num >> 16) & 255) / 255,
      ((num >> 8) & 255) / 255,
      (num & 255) / 255,
    )
  }
  return style
}

function parseBlocks(html: string): BlockNode[] {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const blocks: BlockNode[] = []
  const pending: InlineNode[] = []

  function flush() {
    if (pending.length) {
      blocks.push({ type: 'paragraph', children: pending.splice(0) })
    }
  }

  function walk(node: Node, inherited: TextStyle) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? '').replace(/\s+/g, ' ')
      if (text.trim()) {
        pending.push({ ...inherited, text })
      }
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const element = node as Element
    const tag = element.tagName.toLowerCase()
    // Scripts and styles must never leak their source code into the text
    // output — that is what produced the "function codes" garbage when a
    // script-heavy page could not be rasterized.
    if (tag === 'script' || tag === 'style' || tag === 'template') return
    const style = styleOf(element, inherited)

    if (tag === 'br') {
      pending.push({ ...style, text: '\n' })
      return
    }
    if (tag === 'hr') {
      flush()
      blocks.push({ type: 'rule', children: [] })
      return
    }
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
      flush()
      const level = Number(tag[1])
      const headingStyle: TextStyle = {
        ...style,
        bold: true,
        fontSize: [24, 20, 16, 14, 13, 12][level - 1] ?? 12,
      }
      const headingChildren: InlineNode[] = []
      for (const child of Array.from(element.childNodes)) {
        const before = pending.length
        walk(child, headingStyle)
        headingChildren.push(...pending.splice(before))
      }
      blocks.push({ type: 'heading', level, children: headingChildren })
      return
    }
    if (tag === 'p') {
      flush()
      const paraChildren: InlineNode[] = []
      for (const child of Array.from(element.childNodes)) {
        const before = pending.length
        walk(child, style)
        paraChildren.push(...pending.splice(before))
      }
      blocks.push({ type: 'paragraph', children: paraChildren })
      return
    }
    if (['ul', 'ol'].includes(tag)) {
      flush()
      for (const child of Array.from(element.children)) {
        if (child.tagName.toLowerCase() === 'li') {
          const itemChildren: InlineNode[] = []
          for (const grandchild of Array.from(child.childNodes)) {
            const before = pending.length
            walk(grandchild, style)
            itemChildren.push(...pending.splice(before))
          }
          blocks.push({ type: 'list-item', children: itemChildren })
        }
      }
      return
    }
    if (tag === 'blockquote') {
      flush()
      const quoteChildren: InlineNode[] = []
      for (const child of Array.from(element.childNodes)) {
        const before = pending.length
        walk(child, style)
        quoteChildren.push(...pending.splice(before))
      }
      blocks.push({ type: 'quote', children: quoteChildren })
      return
    }
    if (tag === 'pre') {
      flush()
      const text = (element.textContent ?? '').replace(/\n{2,}/g, '\n')
      blocks.push({
        type: 'pre',
        children: [
          { ...style, fontSize: 9, text: text.split('\n').join('\n') },
        ],
      })
      return
    }
    for (const child of Array.from(element.childNodes)) {
      walk(child, style)
    }
  }

  walk(parsed.body, { ...BASE_STYLE })
  flush()
  return blocks
}

async function layoutHtmlAsPdf(
  html: string,
  size: { width: number; height: number },
  margin: number,
): Promise<HtmlPdfOutput> {
  const pdfDoc = await PDFDocument.create()
  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
  }

  const usableWidth = size.width - margin * 2

  let page = pdfDoc.addPage([size.width, size.height])
  let cursorY = size.height - margin

  function newPage() {
    page = pdfDoc.addPage([size.width, size.height])
    cursorY = size.height - margin
  }

  const blocks = parseBlocks(html)

  for (const block of blocks) {
    if (block.type === 'rule') {
      if (cursorY - 16 < margin) newPage()
      page.drawLine({
        start: { x: margin, y: cursorY - 8 },
        end: { x: size.width - margin, y: cursorY - 8 },
        thickness: 0.75,
        color: rgb(0.6, 0.6, 0.6),
      })
      cursorY -= 16
      continue
    }

    const isQuote = block.type === 'quote'
    const isListItem = block.type === 'list-item'
    const isPre = block.type === 'pre'
    const fontSize = isPre ? 9 : 12
    const lineHeight = fontSize * 1.45
    const leftInset = isQuote || isListItem ? 24 : 0

    // Collapse inline line breaks into paragraph breaks.
    const childGroups: InlineNode[][] = [[]]
    for (const node of block.children) {
      const text = sanitizeWinAnsi(node.text)
      const pieces = text.split('\n')
      pieces.forEach((piece, index) => {
        if (index > 0) childGroups.push([])
        if (piece) childGroups[childGroups.length - 1].push({ ...node, text: piece })
      })
    }

    // Wrap each group into display lines that fit the width.
    const displayLines: InlineNode[][] = []
    for (const group of childGroups) {
      if (group.length === 0) continue
      let line: InlineNode[] = []
      let width = 0
      const maxLineWidth = usableWidth - leftInset
      for (const node of group) {
        const drawFont = fontFor(fonts, node)
        const words = node.text.split(' ')
        for (let i = 0; i < words.length; i++) {
          const word = words[i]
          const spacing = i > 0 ? drawFont.widthOfTextAtSize(' ', node.fontSize) : 0
          const wordWidth = drawFont.widthOfTextAtSize(word, node.fontSize)
          if (width > 0 && width + spacing + wordWidth > maxLineWidth) {
            displayLines.push(line)
            line = []
            width = 0
          }
          const textToDraw = width > 0 ? ` ${word}` : word
          line.push({ ...node, text: textToDraw })
          width += width > 0 ? spacing + wordWidth : wordWidth
        }
      }
      if (line.length) displayLines.push(line)
    }

    if (displayLines.length === 0) {
      if (cursorY - 16 < margin) newPage()
      cursorY -= 12
      continue
    }

    if (cursorY - lineHeight * displayLines.length - 8 < margin) newPage()

    const leading = block.type === 'heading' ? 10 : 6
    cursorY -= leading

    for (const line of displayLines) {
      let x = margin + leftInset
      for (const node of line) {
        const drawFont = fontFor(fonts, node)
        page.drawText(node.text, {
          x,
          y: cursorY - lineHeight,
          size: node.fontSize,
          font: drawFont,
          color: node.color,
        })
        if (node.underline) {
          const textWidth = drawFont.widthOfTextAtSize(node.text, node.fontSize)
          page.drawLine({
            start: { x, y: cursorY - lineHeight - 1 },
            end: { x: x + textWidth, y: cursorY - lineHeight - 1 },
            thickness: 0.5,
            color: node.color,
          })
        }
        x += drawFont.widthOfTextAtSize(node.text, node.fontSize)
      }
      cursorY -= lineHeight
    }
    cursorY -= block.type === 'heading' ? 10 : 6
    if (cursorY < margin) newPage()
  }

  const bytes = await pdfDoc.save({ useObjectStreams: true })
  return { bytes, pageCount: pdfDoc.getPageCount() }
}

function pageSizeForOptions(options: HtmlPdfOptions): {
  width: number
  height: number
} {
  const baseSize = pageSizeFor(options.pageSize ?? 'a4')
  const orientation = options.orientation ?? 'portrait'
  return orientation === 'landscape' && baseSize.width < baseSize.height
    ? { width: baseSize.height, height: baseSize.width }
    : baseSize
}

/**
 * Converts HTML to PDF bytes, preferring full browser rasterization and
 * falling back to the structured text layout when the browser cannot capture
 * the page (e.g. Firefox and foreignObject).
 */
export async function htmlToPdfBytes(
  html: string,
  options: HtmlPdfOptions = {},
): Promise<HtmlPdfOutput> {
  const size = pageSizeForOptions(options)
  const margin = options.margin ?? 48
  const viewportWidth =
    options.viewportWidth ?? (size.width - margin * 2) * PT_TO_PX

  if (typeof document !== 'undefined') {
    try {
      return await rasterizeHtmlToPdf(
        html,
        size,
        margin,
        options.baseUrl,
        viewportWidth,
        options.onProgress,
      )
    } catch (reason) {
      console.warn(
        '[html-to-pdf] rasterization unavailable, using text layout.',
        reason,
      )
    }
  }
  return layoutHtmlAsPdf(html, size, margin)
}

export async function htmlToPdfHandler(
  context: LocalToolContext,
): Promise<LocalToolResult> {
  const { files, options } = context

  let html = String(options.html ?? '')
  if (!html.trim() && files.length) {
    html = decodeTextBytes(await localBytes(files[0]))
  }
  if (!html.trim()) {
    throw new Error('Paste some HTML or choose an .html file.')
  }

  const output = await htmlToPdfBytes(html, {
    pageSize: (String(options.page_size ?? 'a4') as 'a4' | 'letter'),
    orientation: String(options.orientation ?? 'portrait') as
      | 'portrait'
      | 'landscape',
    // Lay the page out at a desktop width so it matches how the HTML file
    // looks when opened in a browser, then scale it onto the PDF page.
    viewportWidth: 1280,
    onProgress: context.onProgress,
  })
  const blob = new Blob([output.bytes as unknown as BlobPart], {
    type: 'application/pdf',
  })
  return {
    blob,
    filename: `webpage-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    summary: `${output.pageCount} page${output.pageCount > 1 ? 's' : ''} · ${(
      blob.size / 1024
    ).toFixed(1)} KB`,
  }
}