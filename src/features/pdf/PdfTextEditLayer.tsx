import { useEffect, useRef } from 'react'
import type {
  FocusEvent as ReactFocusEvent,
  FormEvent as ReactFormEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { PdfTextEdit } from '@/features/editor/model'
import { pdfjs } from './pdfjs'
import { bundledEditorFont, sameTextFormat } from './text-format'
import type { PdfTextFormat, PdfTextSelectionController } from './text-format'

interface PdfTextEditLayerProps {
  page: PDFPageProxy
  scale: number
  sourceCanvas: HTMLCanvasElement
  backgroundCanvas: HTMLCanvasElement
  onCommit: (edit: PdfTextEdit) => void
  onSelectionChange: (selection: PdfTextSelectionController | null) => void
}

type PdfTextContent = Awaited<ReturnType<PDFPageProxy['getTextContent']>>
type PdfTextContentItem = PdfTextContent['items'][number]
type EditableTextItem = Extract<PdfTextContentItem, { str: string }>

interface PdfFontFaceObject {
  data?: Uint8Array | ArrayBuffer | null
  isType3Font?: boolean
  loadedName?: string
  missingFile?: boolean
  name?: string
}

interface TextRunVisual {
  color: [number, number, number]
  pdfFontName: string
  browserFontFamily: string
  browserScaleX: string
  pdfHorizontalScale: number
}

interface ActiveTextRun {
  index: number
  element: HTMLElement
  format: PdfTextFormat
  originalFormat: PdfTextFormat
  patch: HTMLCanvasElement
  controller: PdfTextSelectionController
}

interface TextRunPaint {
  color: [number, number, number]
  painted: boolean
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function editableTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null
  return target.closest<HTMLElement>('[data-text-item-index]')
}

function isTextItem(item: PdfTextContentItem): item is EditableTextItem {
  return Boolean(
    item && typeof item === 'object' && 'str' in item && 'transform' in item,
  )
}

/**
 * True when a later run in the array sits at (near enough) the same
 * baseline AND is textually empty or identical to this one — i.e. it
 * looks like a ghost/duplicate layer (common under redaction blocks or
 * OCR text layers) rather than a genuinely different run that merely
 * starts at the same position. Only that narrower case is skipped —
 * treating ANY same-position pair as a duplicate previously dropped
 * legitimate, differently-worded runs from the editable layer entirely.
 */
function hasNewerRunAtSameBaseline(
  items: EditableTextItem[],
  index: number,
): boolean {
  const current = items[index]
  if (!current) return false
  const x = Number(current.transform[4])
  const y = Number(current.transform[5])
  const currentText = current.str.trim()
  return items.slice(index + 1).some((candidate) => {
    const samePosition =
      Math.abs(Number(candidate.transform[4]) - x) < 1 &&
      Math.abs(Number(candidate.transform[5]) - y) < 1
    if (!samePosition) return false
    const candidateText = candidate.str.trim()
    return candidateText.length === 0 || candidateText === currentText
  })
}

function textCanvasBounds(
  element: HTMLElement,
  container: HTMLElement,
  canvas: HTMLCanvasElement,
  paddingX = 0,
  paddingY = paddingX,
) {
  const elementRect = element.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const left = clamp(
    elementRect.left - containerRect.left - paddingX,
    0,
    containerRect.width,
  )
  const top = clamp(
    elementRect.top - containerRect.top - paddingY,
    0,
    containerRect.height,
  )
  const right = clamp(
    elementRect.right - containerRect.left + paddingX,
    left,
    containerRect.width,
  )
  const bottom = clamp(
    elementRect.bottom - containerRect.top + paddingY,
    top,
    containerRect.height,
  )
  const scaleX = canvas.width / containerRect.width
  const scaleY = canvas.height / containerRect.height
  return {
    css: { left, top, right, bottom },
    pixels: {
      left: Math.floor(left * scaleX),
      top: Math.floor(top * scaleY),
      right: Math.ceil(right * scaleX),
      bottom: Math.ceil(bottom * scaleY),
    },
  }
}

function inspectTextPaint(
  element: HTMLElement,
  container: HTMLElement,
  sourceCanvas: HTMLCanvasElement,
  backgroundCanvas: HTMLCanvasElement,
): TextRunPaint {
  const fallback: [number, number, number] = [0.08, 0.1, 0.16]
  const source = sourceCanvas.getContext('2d', { willReadFrequently: true })
  const background = backgroundCanvas.getContext('2d', {
    willReadFrequently: true,
  })
  if (!source || !background) return { color: fallback, painted: false }

  const { pixels } = textCanvasBounds(element, container, sourceCanvas, 1)
  const width = Math.max(1, pixels.right - pixels.left)
  const height = Math.max(1, pixels.bottom - pixels.top)
  try {
    const sourcePixels = source.getImageData(
      pixels.left,
      pixels.top,
      width,
      height,
    ).data
    const backgroundPixels = background.getImageData(
      pixels.left,
      pixels.top,
      width,
      height,
    ).data
    const candidates: Array<{
      score: number
      red: number
      green: number
      blue: number
    }> = []
    const stride = Math.max(1, Math.ceil(Math.sqrt((width * height) / 12000)))
    for (let row = 0; row < height; row += stride) {
      for (let column = 0; column < width; column += stride) {
        const offset = (row * width + column) * 4
        const red = sourcePixels[offset]
        const green = sourcePixels[offset + 1]
        const blue = sourcePixels[offset + 2]
        const score =
          Math.abs(red - backgroundPixels[offset]) +
          Math.abs(green - backgroundPixels[offset + 1]) +
          Math.abs(blue - backgroundPixels[offset + 2])
        if (score > 36) candidates.push({ score, red, green, blue })
      }
    }
    if (candidates.length === 0) {
      return { color: fallback, painted: false }
    }
    candidates.sort((left, right) => right.score - left.score)
    const sample = candidates.slice(
      0,
      Math.max(4, Math.ceil(candidates.length * 0.18)),
    )
    const total = sample.reduce(
      (sum, pixel) => ({
        red: sum.red + pixel.red,
        green: sum.green + pixel.green,
        blue: sum.blue + pixel.blue,
      }),
      { red: 0, green: 0, blue: 0 },
    )
    return {
      color: [
        total.red / sample.length / 255,
        total.green / sample.length / 255,
        total.blue / sample.length / 255,
      ],
      painted: true,
    }
  } catch {
    return { color: fallback, painted: false }
  }
}

function fontObjectFor(
  page: PDFPageProxy,
  fontName: string,
): PdfFontFaceObject | null {
  try {
    const font = page.commonObjs.get(fontName) as unknown
    return font && typeof font === 'object' ? (font as PdfFontFaceObject) : null
  } catch {
    return null
  }
}

function textHorizontalScale(item: EditableTextItem): number {
  const horizontal = Math.hypot(
    Number(item.transform[0]),
    Number(item.transform[1]),
  )
  const vertical = Math.hypot(
    Number(item.transform[2]),
    Number(item.transform[3]),
  )
  return Number.isFinite(horizontal / vertical) && vertical > 0
    ? horizontal / vertical
    : 1
}

function textFontSize(item: EditableTextItem): number {
  const transform = item.transform
  return Math.hypot(Number(transform[2]), Number(transform[3]))
}

function fontDataByteLength(font: PdfFontFaceObject | null): number {
  return font?.data?.byteLength ?? 0
}

function inferredFontWeight(fontName: string): 400 | 700 {
  return /(?:bold|black|heavy|semibold)/i.test(fontName) ? 700 : 400
}

function inferredItalic(fontName: string): boolean {
  return /(?:italic|oblique)/i.test(fontName)
}

function applyTextFormat(
  element: HTMLElement,
  format: PdfTextFormat,
  visual: TextRunVisual,
  scale: number,
): void {
  if (format.fontFamily === 'original') {
    element.style.fontFamily = visual.browserFontFamily
    element.style.setProperty('--scale-x', visual.browserScaleX)
  } else {
    element.style.fontFamily = `"${bundledEditorFont(format.fontFamily).cssFamily}"`
    element.style.setProperty('--scale-x', String(visual.pdfHorizontalScale))
  }
  element.style.setProperty('--font-height', `${format.fontSize}px`)
  element.style.fontWeight = String(format.fontWeight)
  element.style.fontStyle = format.italic ? 'italic' : 'normal'
  element.style.textDecorationLine = format.underline ? 'underline' : 'none'
  element.style.textDecorationThickness = format.underline ? '0.06em' : ''
  element.style.textUnderlineOffset = format.underline ? '0.08em' : ''
  element.style.letterSpacing = `${format.letterSpacing * scale}px`
  element.style.setProperty(
    '--pdf-text-color',
    `rgb(${Math.round(format.color[0] * 255)} ${Math.round(format.color[1] * 255)} ${Math.round(format.color[2] * 255)})`,
  )
}

function dataUrlBytes(dataUrl: string): Uint8Array {
  const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = window.atob(encoded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function createEditingPatch(
  element: HTMLElement,
  container: HTMLElement,
  backgroundCanvas: HTMLCanvasElement,
  paddingX: number,
  paddingY: number,
): HTMLCanvasElement {
  const bounds = textCanvasBounds(
    element,
    container,
    backgroundCanvas,
    paddingX,
    paddingY,
  )
  const width = Math.max(1, bounds.pixels.right - bounds.pixels.left)
  const height = Math.max(1, bounds.pixels.bottom - bounds.pixels.top)
  const patch = document.createElement('canvas')
  patch.className = 'pdf-text-edit-layer__patch'
  patch.width = width
  patch.height = height
  patch.style.left = `${bounds.css.left}px`
  patch.style.top = `${bounds.css.top}px`
  patch.style.width = `${bounds.css.right - bounds.css.left}px`
  patch.style.height = `${bounds.css.bottom - bounds.css.top}px`
  const context = patch.getContext('2d')
  if (!context) throw new Error('The PDF background could not be displayed.')
  context.drawImage(
    backgroundCanvas,
    bounds.pixels.left,
    bounds.pixels.top,
    width,
    height,
    0,
    0,
    width,
    height,
  )
  return patch
}

function captureBackgroundPatch(
  editingPatch: HTMLCanvasElement,
  page: PDFPageProxy,
  scale: number,
): PdfTextEdit['backgroundPatch'] {
  const left = Number.parseFloat(editingPatch.style.left)
  const top = Number.parseFloat(editingPatch.style.top)
  const width = Number.parseFloat(editingPatch.style.width)
  const height = Number.parseFloat(editingPatch.style.height)
  const viewport = page.getViewport({ scale })
  const first = viewport.convertToPdfPoint(left, top)
  const second = viewport.convertToPdfPoint(left + width, top + height)
  return {
    png: dataUrlBytes(editingPatch.toDataURL('image/png')),
    x: Math.min(first[0], second[0]),
    y: Math.min(first[1], second[1]),
    width: Math.abs(second[0] - first[0]),
    height: Math.abs(second[1] - first[1]),
  }
}

/**
 * PDF.js lays extracted text runs over the canvas at their exact visual
 * positions. Each run becomes a plaintext contenteditable while edit mode is
 * active. Typing is therefore visible immediately; blur commits the run into
 * the local PDF document.
 */
export function PdfTextEditLayer({
  page,
  scale,
  sourceCanvas,
  backgroundCanvas,
  onCommit,
  onSelectionChange,
}: PdfTextEditLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef<EditableTextItem[]>([])
  const originalsRef = useRef<Map<number, string>>(new Map())
  const visualsRef = useRef<Map<number, TextRunVisual>>(new Map())
  const patchesRef = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const activeRef = useRef<ActiveTextRun | null>(null)

  /**
   * Holds a rebuild that arrived while a run was actively being edited
   * (focused, not yet committed/cancelled). Every text commit reloads the
   * whole PDF document and republishes a new blob, which eventually gives
   * this layer a new `page` object and re-runs this effect. Rebuilding
   * immediately would wipe every contenteditable span via
   * `container.replaceChildren()` — including whatever DIFFERENT run the
   * user has already moved focus into and started typing in, if that
   * commit's async round trip is still in flight when they do — silently
   * discarding those keystrokes. Deferring the rebuild until the active
   * run's own commit/cancel finishes keeps that in-progress edit intact.
   *
   * Unlike an earlier version of this fix, this ALWAYS performs a real,
   * full rebuild once free — never a permanent skip. A run that was just
   * committed needs its "original" text refreshed to match what's now
   * actually baked into the PDF, or it stays stuck showing the rough CSS
   * font approximation (wrong color/kerning) forever instead of
   * reverting to transparent and trusting the freshly re-rendered, truly
   * correct canvas underneath. A permanent skip also left the very first
   * build's paint-detection/duplicate-baseline results (and cached
   * original text) permanently stale for the rest of the page's life —
   * which is what caused runs to inconsistently have text or not.
   */
  const deferredBuildRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false
    let layer: InstanceType<typeof pdfjs.TextLayer> | null = null

    function build() {
      if (cancelled) return
      const visuals = new Map<number, TextRunVisual>()
      const patches = new Map<number, HTMLCanvasElement>()
      visualsRef.current = visuals
      patchesRef.current = patches
      activeRef.current = null
      container!.replaceChildren()
      container!.classList.remove('pdf-text-edit-layer--ready')

      void page
        .getTextContent({ includeMarkedContent: false })
        .then(async (content) => {
          if (cancelled) return
          const items = content.items.filter(isTextItem)
          itemsRef.current = items
          originalsRef.current = new Map(
            items.map((item, index) => [index, item.str]),
          )
          const viewport = page.getViewport({ scale })
          container!.style.setProperty('--scale-factor', String(scale))
          container!.style.setProperty('--total-scale-factor', String(scale))
          layer = new pdfjs.TextLayer({
            textContentSource: content,
            container: container!,
            viewport,
          })
          await layer.render()
          if (cancelled) return
          let unavailableRuns = 0
          layer.textDivs.forEach((element, index) => {
            const original = items[index]?.str ?? ''
            if (hasNewerRunAtSameBaseline(items, index)) {
              element.remove()
              return
            }
            if (!original.trim()) return
            const item = items[index]
            const font = item ? fontObjectFor(page, item.fontName) : null
            const paint = inspectTextPaint(
              element,
              container!,
              sourceCanvas,
              backgroundCanvas,
            )
            if (
              !paint.painted ||
              fontDataByteLength(font) === 0 ||
              !font?.loadedName ||
              !font.name ||
              font.missingFile ||
              font.isType3Font
            ) {
              unavailableRuns += 1
              element.remove()
              return
            }
            visuals.set(index, {
              color: paint.color,
              pdfFontName: font.name,
              browserFontFamily: `"${font.loadedName}"`,
              browserScaleX: element.style.getPropertyValue('--scale-x') || '1',
              pdfHorizontalScale: textHorizontalScale(item),
            })
            element.dataset.textItemIndex = String(index)
            element.dataset.pdfFontSource = 'embedded'
            element.classList.add('pdf-text-edit-layer__item')
            element.style.setProperty(
              '--pdf-text-color',
              `rgb(${Math.round(paint.color[0] * 255)} ${Math.round(paint.color[1] * 255)} ${Math.round(paint.color[2] * 255)})`,
            )
            // PDF.js registers the embedded font program under this generated
            // family. Do not use cssFontInfo or synthesize weight/style here:
            // either can make the browser select a local or fallback face.
            element.style.fontFamily = `"${font.loadedName}"`
            if (font?.name) element.dataset.pdfFontName = font.name
            element.dataset.pdfFontSize = String(textFontSize(item))
            element.setAttribute('contenteditable', 'plaintext-only')
            element.setAttribute('role', 'textbox')
            element.setAttribute('aria-label', `Edit text: ${original}`)
            element.setAttribute('spellcheck', 'false')
            element.tabIndex = 0
          })
          container!.dataset.unavailableTextRuns = String(unavailableRuns)
          container!.classList.add('pdf-text-edit-layer--ready')
        })
        .catch((reason: unknown) => {
          if (!cancelled) {
            console.error(
              `Failed to build editable text for page ${page.pageNumber}.`,
              reason,
            )
          }
        })
    }

    if (activeRef.current) {
      deferredBuildRef.current = build
    } else {
      build()
    }

    return () => {
      cancelled = true
      layer?.cancel()
      deferredBuildRef.current = null
      itemsRef.current = []
      visualsRef.current.clear()
      patchesRef.current.clear()
      if (activeRef.current) onSelectionChange(null)
      activeRef.current = null
      container.replaceChildren()
    }
  }, [page, scale, sourceCanvas, backgroundCanvas, onSelectionChange])

  function removeEditingPatch(index: number) {
    patchesRef.current.get(index)?.remove()
    patchesRef.current.delete(index)
  }

  function updateChangedState(active: ActiveTextRun): boolean {
    const textChanged =
      active.element.textContent !== originalsRef.current.get(active.index)
    const formatChanged = !sameTextFormat(active.format, active.originalFormat)
    const changed = textChanged || formatChanged
    active.element.classList.toggle(
      'pdf-text-edit-layer__item--changed',
      changed,
    )
    active.patch.classList.toggle(
      'pdf-text-edit-layer__patch--visible',
      changed,
    )
    return changed
  }

  /** Fires a rebuild that arrived while the just-finished run was active
   * (see `deferredBuildRef` above), if one is pending. */
  function runDeferredBuildIfAny() {
    const pending = deferredBuildRef.current
    if (!pending) return
    deferredBuildRef.current = null
    pending()
  }

  function commitActive(index?: number) {
    const active = activeRef.current
    const container = containerRef.current
    if (
      !active ||
      !container ||
      (index !== undefined && active.index !== index)
    ) {
      return
    }
    activeRef.current = null
    const item = itemsRef.current[active.index]
    const visual = visualsRef.current.get(active.index)
    const text = active.element.textContent ?? ''
    if (!item || !visual || !updateChangedState(active)) {
      removeEditingPatch(active.index)
      active.element.classList.remove('pdf-text-edit-layer__item--active')
      onSelectionChange(null)
      runDeferredBuildIfAny()
      return
    }

    originalsRef.current.set(active.index, text)
    active.element.classList.remove('pdf-text-edit-layer__item--active')
    onSelectionChange(null)
    onCommit({
      pageIndex: page.pageNumber - 1,
      x: Number(item.transform[4]),
      y: Number(item.transform[5]),
      width: Math.max(Number(item.width), Number(item.height)),
      height: Math.max(Number(item.height), 1),
      fontSize: active.format.fontSize,
      horizontalScale: textHorizontalScale(item),
      rotation:
        (Math.atan2(Number(item.transform[1]), Number(item.transform[0])) *
          180) /
        Math.PI,
      color: active.format.color,
      pdfFontName: visual.pdfFontName,
      fontFamily: active.format.fontFamily,
      fontWeight: active.format.fontWeight,
      italic: active.format.italic,
      underline: active.format.underline,
      letterSpacing: active.format.letterSpacing,
      renderedWidth: active.element.getBoundingClientRect().width / scale,
      backgroundPatch: captureBackgroundPatch(active.patch, page, scale),
      text,
    })
    runDeferredBuildIfAny()
  }

  function cancelActive(index?: number) {
    const active = activeRef.current
    if (!active || (index !== undefined && active.index !== index)) return
    activeRef.current = null
    active.element.textContent = originalsRef.current.get(active.index) ?? ''
    active.format = active.originalFormat
    const visual = visualsRef.current.get(active.index)
    if (visual)
      applyTextFormat(active.element, active.originalFormat, visual, scale)
    active.element.classList.remove(
      'pdf-text-edit-layer__item--active',
      'pdf-text-edit-layer__item--changed',
    )
    removeEditingPatch(active.index)
    onSelectionChange(null)
    runDeferredBuildIfAny()
  }


  function handleFocus(event: ReactFocusEvent<HTMLDivElement>) {
    const target = editableTarget(event.target)
    const container = containerRef.current
    if (!target || !container) return
    const index = Number(target.dataset.textItemIndex)
    if (activeRef.current?.index === index) return
    if (activeRef.current) commitActive()
    const item = itemsRef.current[index]
    const visual = visualsRef.current.get(index)
    if (!item || !visual) return
    /* pdf.js's text-layer box approximates a run's line-height, but real
        * glyph ink routinely extends past it — descenders (g, y, p, q, j)
        * dip well below the baseline, and accented capitals or italic slant
        * can rise above the top. That overshoot is asymmetric and mostly
        * vertical, so vertical padding is deliberately much more generous
        * than horizontal — a flat/symmetric padding was covering kerning
        * bleed at the sides fine but still leaving slivers of ascenders or
        * descenders uncovered top and bottom. */
    const fontSizePx = Math.max(textFontSize(item), 4) * scale
    const patchPaddingX = Math.max(3, fontSizePx * 0.12)
    const patchPaddingY = Math.max(6, fontSizePx * 0.4)
    const patch = createEditingPatch(
      target,
      container,
      backgroundCanvas,
      patchPaddingX,
      patchPaddingY,
    )
    container.prepend(patch)
    patchesRef.current.set(index, patch)
    const originalFormat: PdfTextFormat = {
      fontFamily: 'original',
      fontSize: Math.max(textFontSize(item), 4),
      fontWeight: inferredFontWeight(visual.pdfFontName),
      italic: inferredItalic(visual.pdfFontName),
      underline: false,
      letterSpacing: 0,
      color: visual.color,
    }
    const controller: PdfTextSelectionController = {
      id: `${page.pageNumber}:${index}`,
      originalFontName: visual.pdfFontName.replace(/^[A-Z]{6}\+/, ''),
      format: originalFormat,
      applyFormat: (changes) => {
        const active = activeRef.current
        if (!active || active.index !== index) return controller.format
        const next: PdfTextFormat = {
          ...active.format,
          ...changes,
          fontSize: clamp(changes.fontSize ?? active.format.fontSize, 4, 144),
          letterSpacing: clamp(
            changes.letterSpacing ?? active.format.letterSpacing,
            -10,
            40,
          ),
        }
        active.format = next
        controller.format = next
        applyTextFormat(target, next, visual, scale)
        updateChangedState(active)
        onSelectionChange(controller)
        return next
      },
      resetFormat: () => controller.applyFormat(originalFormat),
      commit: () => commitActive(index),
      cancel: () => cancelActive(index),
    }
    activeRef.current = {
      index,
      element: target,
      format: originalFormat,
      originalFormat,
      patch,
      controller,
    }
    target.classList.add('pdf-text-edit-layer__item--active')
    onSelectionChange(controller)
  }

  function handleInput(event: ReactFormEvent<HTMLDivElement>) {
    const target = editableTarget(event.target)
    if (!target) return
    const active = activeRef.current
    if (active && active.element === target) updateChangedState(active)
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const target = editableTarget(event.target)
    if (!target) return
    const index = Number(target.dataset.textItemIndex)
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelActive(index)
      target.blur()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      commitActive(index)
      target.blur()
    }
  }

  function handleBlur(event: ReactFocusEvent<HTMLDivElement>) {
    const target = editableTarget(event.target)
    if (!target) return
    const next = event.relatedTarget
    if (
      next instanceof HTMLElement &&
      next.closest('[data-pdf-text-format-toolbar]')
    ) {
      return
    }
    const index = Number(target.dataset.textItemIndex)
    commitActive(index)
  }

  return (
    <div
      ref={containerRef}
      className="pdf-text-edit-layer textLayer"
      aria-label={`Editable text on page ${page.pageNumber}`}
      onFocus={handleFocus}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  )
}