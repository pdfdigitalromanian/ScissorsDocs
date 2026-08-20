import { useEffect, useRef, useState } from 'react'
import type {
  FocusEvent as ReactFocusEvent,
  FormEvent as ReactFormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactElement,
} from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { PdfTextEdit, SelectedTextRun } from '@/features/editor/model'
import { pdfjs } from './pdfjs'
import { bundledEditorFont, sameTextFormat } from './text-format'
import type { PdfTextFormat, PdfTextSelectionController } from './text-format'
import TextSelectionOverlay from './TextSelectionOverlay'

interface PdfTextEditLayerProps {
  page: PDFPageProxy
  scale: number
  sourceCanvas: HTMLCanvasElement
  backgroundCanvas: HTMLCanvasElement
  onCommit: (edit: PdfTextEdit) => void
  onTransformCommit?: (edit: PdfTextEdit) => void
  onSelectionChange: (selection: PdfTextSelectionController | null) => void
  onSelectedRunChange?: (run: SelectedTextRun | null) => void
  onDeleteRun?: (edit: PdfTextEdit) => void
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
  minWidthPx = 0,
  minHeightPx = 0,
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
    Math.max(
      elementRect.right - containerRect.left + paddingX,
      left + minWidthPx,
    ),
    left,
    containerRect.width,
  )
  const bottom = clamp(
    Math.max(
      elementRect.bottom - containerRect.top + paddingY,
      top + minHeightPx,
    ),
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

/** The selection bounding box for a text run, relative to the layer
   * container. Width comes from the pdf.js text item's own advance metric
   * (item.width × scale) — the same measurement the Redact tool uses for
   * its text boxes — padded by a font-size-aware margin on every side. The
   * exact same box is used by the selection overlay, the hover preview and
   * the double-click edit box, so every highlight is always pixel-identical
   * to the box the user is actually about to grab. */
function boundsForRun(
  target: HTMLElement,
  container: HTMLElement,
  item: EditableTextItem,
  scale: number,
): { left: number; top: number; width: number; height: number; rotation: number } {
  const rect = target.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const fontSizePx = Math.max(textFontSize(item), 4) * scale
  const padX = Math.max(4, fontSizePx * 0.15)
  const padY = Math.max(3, fontSizePx * 0.12)
  const pdfWidthPx =
    Math.max(Math.max(Number(item.width), Number(item.height)), 1) * scale
  return {
    left: rect.left - containerRect.left - padX,
    top: rect.top - containerRect.top - padY,
    width: pdfWidthPx + padX * 2,
    height: rect.height + padY * 2,
    rotation:
      (Math.atan2(Number(item.transform[1]), Number(item.transform[0])) * 180) /
      Math.PI,
  }
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
  minWidthPx = 0,
  minHeightPx = 0,
): HTMLCanvasElement {
  const bounds = textCanvasBounds(
    element,
    container,
    backgroundCanvas,
    paddingX,
    paddingY,
    minWidthPx,
    minHeightPx,
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
 * positions. Each run is clickable to select it (showing a bounding box),
 * and double-clicking enters inline edit mode. Typing is therefore visible
 * immediately; blur commits the run into the local PDF document.
 */
export function PdfTextEditLayer({
  page,
  scale,
  sourceCanvas,
  backgroundCanvas,
  onCommit,
  onTransformCommit,
  onSelectionChange,
  onSelectedRunChange,
  onDeleteRun,
}: PdfTextEditLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef<EditableTextItem[]>([])
  const originalsRef = useRef<Map<number, string>>(new Map())
  const visualsRef = useRef<Map<number, TextRunVisual>>(new Map())
  const patchesRef = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const activeRef = useRef<ActiveTextRun | null>(null)
  const [selectedRun, setSelectedRun] = useState<SelectedTextRun | null>(null)
  /** Live drag displacement so the selection bounding box (and its handles)
   * follows the text while it is being dragged instead of staying behind. */
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(
    null,
  )
  /** Index of the run currently under the pointer, used to draw a faint
   * bounding-box preview on hover — the box the click is about to select. */
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  /** Removal patch captured at the run's original (untransformed) position
   * while it is selected, so move/resize/rotate/delete always erase the
   * original glyphs wherever the box is dragged to. */
  const removalPatchRef = useRef<HTMLCanvasElement | null>(null)
  /** The CSS transform the text span had before any drag, so preview
   * translations compose with pdf.js's own rotate/scale transform. */
  const selectionOriginRef = useRef<{ transform: string } | null>(null)

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
      setHoveredIndex(null)

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
              font?.isType3Font ||
              font?.missingFile ||
              (!font?.loadedName && !font?.name)
            ) {
              unavailableRuns += 1
              element.remove()
              return
            }
            const color =
              paint.painted && paint.color
                ? paint.color
                : ([0.08, 0.1, 0.16] as [number, number, number])
            visuals.set(index, {
              color,
              pdfFontName: font?.name ?? item.fontName,
              browserFontFamily: font?.loadedName
                ? `"${font.loadedName}"`
                : 'sans-serif',
              browserScaleX: element.style.getPropertyValue('--scale-x') || '1',
              pdfHorizontalScale: textHorizontalScale(item),
            })
            element.dataset.textItemIndex = String(index)
            element.dataset.pdfFontSource = font?.loadedName
              ? 'embedded'
              : 'fallback'
            element.classList.add('pdf-text-edit-layer__item')
            element.style.setProperty(
              '--pdf-text-color',
              `rgb(${Math.round(color[0] * 255)} ${Math.round(color[1] * 255)} ${Math.round(color[2] * 255)})`,
            )
            element.style.fontFamily = font?.loadedName
              ? `"${font.loadedName}"`
              : 'sans-serif'
            if (font?.name) element.dataset.pdfFontName = font.name
            element.dataset.pdfFontSize = String(textFontSize(item))
            element.setAttribute('role', 'button')
            element.setAttribute('aria-label', `Select text: ${original}`)
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
    /* Once the run has been touched (typing, formatting or dragging), the
     * removal patch stays visible for the rest of the edit: the original
     * glyphs underneath are erased so the CSS-rendered text never shows a
     * duplicate behind it or flips back to the PDF's color mid-edit. */
    active.patch.classList.add('pdf-text-edit-layer__patch--visible')
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
      originalX: Number(item.transform[4]),
      originalY: Number(item.transform[5]),
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

  function handleDoubleClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = editableTarget(event.target)
    const container = containerRef.current
    if (!target || !container) return
    const index = Number(target.dataset.textItemIndex)
    enterEditMode(target, index)
  }

  function enterEditMode(target: HTMLElement, index: number) {
    const container = containerRef.current
    if (!container) return
    if (activeRef.current?.index === index) return
    if (activeRef.current) {
      commitActive()
    }
    const item = itemsRef.current[index]
    const visual = visualsRef.current.get(index)
    if (!item || !visual) return

    target.classList.remove('pdf-text-edit-layer__item--selected')
    setSelectedRun(null)
    setDragOffset(null)
    setHoveredIndex(null)
    onSelectedRunChange?.(null)

    const fontSizePx = Math.max(textFontSize(item), 4) * scale
    const pdfWidthPx = Math.max(
      Math.max(Number(item.width), Number(item.height)),
      1,
    ) * scale
    /* Size the editable box to exactly match the bounding box the run gets
     * on single-click select (same padding and pdf.js width metric), so the
     * "editing" outline appears precisely where the selection box was. */
    const targetRect = target.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const boxPadX = Math.max(4, fontSizePx * 0.15)
    const boxPadY = Math.max(3, fontSizePx * 0.12)
    target.style.boxSizing = 'border-box'
    target.style.left = `${targetRect.left - containerRect.left - boxPadX}px`
    target.style.top = `${targetRect.top - containerRect.top - boxPadY}px`
    target.style.width = `${pdfWidthPx + boxPadX * 2}px`
    target.style.height = `${targetRect.height + boxPadY * 2}px`
    target.style.padding = `${boxPadY}px ${boxPadX}px`
    const patchPaddingX = Math.max(3, fontSizePx * 0.12)
    const patchPaddingY = Math.max(6, fontSizePx * 0.4)
    const patch = createEditingPatch(
      target,
      container,
      backgroundCanvas,
      patchPaddingX,
      patchPaddingY,
      pdfWidthPx + patchPaddingX * 2,
      fontSizePx + patchPaddingY * 2,
    )
    container.prepend(patch)
    patchesRef.current.set(index, patch)
    /* The patch starts visible so the original glyphs are erased the moment
     * editing begins — otherwise the PDF's real text shows through behind
     * the editable box like a duplicate in a different color. */
    patch.classList.add('pdf-text-edit-layer__patch--visible')
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
    target.setAttribute('contenteditable', 'plaintext-only')
    target.setAttribute('role', 'textbox')
    target.setAttribute('aria-label', `Edit text: ${originalsRef.current.get(index) ?? ''}`)
    target.classList.add('pdf-text-edit-layer__item--active')
    target.focus()
    onSelectionChange(controller)
  }

  function captureRemovalPatch(run: SelectedTextRun): {
    png: Uint8Array
    x: number
    y: number
    width: number
    height: number
  } {
    const viewport = page.getViewport({ scale })
    const container = containerRef.current
    const rect = run.element.getBoundingClientRect()
    const containerRect = container?.getBoundingClientRect()
    const left = containerRect ? rect.left - containerRect.left : 0
    const top = containerRect ? rect.top - containerRect.top : 0
    const width = Math.max(1, rect.width, run.pdfWidth * scale)
    const height = Math.max(1, rect.height, run.pdfHeight * scale)
    const first = viewport.convertToPdfPoint(left, top)
    const second = viewport.convertToPdfPoint(left + width, top + height)
    const scaleX = containerRect
      ? backgroundCanvas.width / containerRect.width
      : 1
    const scaleY = containerRect
      ? backgroundCanvas.height / containerRect.height
      : 1
    let png: Uint8Array = new Uint8Array()
    try {
      const snapshot = document.createElement('canvas')
      snapshot.width = Math.max(1, Math.round(width * scaleX))
      snapshot.height = Math.max(1, Math.round(height * scaleY))
      const context = snapshot.getContext('2d')
      if (context) {
        context.drawImage(
          backgroundCanvas,
          Math.round(left * scaleX),
          Math.round(top * scaleY),
          snapshot.width,
          snapshot.height,
          0,
          0,
          snapshot.width,
          snapshot.height,
        )
        png = dataUrlBytes(snapshot.toDataURL('image/png'))
      }
    } catch {
      png = new Uint8Array()
    }
    return {
      png,
      x: Math.min(first[0], second[0]),
      y: Math.min(first[1], second[1]),
      width: Math.abs(second[0] - first[0]),
      height: Math.abs(second[1] - first[1]),
    }
  }

  function handleSelectDelete() {
    if (!selectedRun) return
    const item = itemsRef.current[selectedRun.index]
    const visual = visualsRef.current.get(selectedRun.index)
    if (!item || !visual) return
    const patch = removalPatchRef.current
    const edit: PdfTextEdit = {
      pageIndex: page.pageNumber - 1,
      originalX: selectedRun.pdfX,
      originalY: selectedRun.pdfY,
      x: selectedRun.pdfX,
      y: selectedRun.pdfY,
      width: selectedRun.pdfWidth,
      height: selectedRun.pdfHeight,
      fontSize: textFontSize(item),
      horizontalScale: textHorizontalScale(item),
      rotation: selectedRun.pdfRotation,
      color: visual.color,
      pdfFontName: visual.pdfFontName,
      fontFamily: 'original',
      fontWeight: inferredFontWeight(visual.pdfFontName),
      italic: inferredItalic(visual.pdfFontName),
      underline: false,
      letterSpacing: 0,
      renderedWidth: selectedRun.element.getBoundingClientRect().width / scale,
      backgroundPatch: patch
        ? captureBackgroundPatch(patch, page, scale)
        : captureRemovalPatch(selectedRun),
      text: '',
    }
    if (patch) {
      patch.classList.add('pdf-text-edit-layer__patch--visible')
    }
    removalPatchRef.current = null
    selectionOriginRef.current = null
    setSelectedRun(null)
    setDragOffset(null)
    setHoveredIndex(null)
    selectedRun.element.classList.remove('pdf-text-edit-layer__item--selected')
    selectedRun.element.style.pointerEvents = 'none'
    selectedRun.element.style.visibility = 'hidden'
    onSelectedRunChange?.(null)
    onDeleteRun?.(edit)
  }

  function revealRemovalPatch() {
    if (removalPatchRef.current) {
      removalPatchRef.current.classList.add(
        'pdf-text-edit-layer__patch--visible',
      )
    }
  }

  /** The run's pre-drag CSS transform, or '' when it has none. Appending a
   * literal 'none' would make `translate(...) none` an invalid declaration
   * that the browser drops, so the text would never move. */
  function selectionTransformBase(): string {
    const transform = selectionOriginRef.current?.transform
    return transform && transform !== 'none' ? transform : ''
  }

  function handleMove(dx: number, dy: number) {
    if (!selectedRun) return
    revealRemovalPatch()
    selectedRun.element.style.transform =
      `translate(${dx}px, ${dy}px) ${selectionTransformBase()}`
    setDragOffset({ dx, dy })
  }

  function handleResizePreview(
    dx: number,
    _dy: number,
    corner: 'nw' | 'ne' | 'sw' | 'se',
  ) {
    if (!selectedRun) return
    revealRemovalPatch()
    const start = selectedRun.bounds
    const deltaX = corner === 'nw' || corner === 'sw' ? -dx : dx
    const factor = Math.max(0.2, (start.width + deltaX) / start.width)
    const item = itemsRef.current[selectedRun.index]
    if (item) {
      const fontSizePx = Math.max(textFontSize(item), 4) * scale
      selectedRun.element.style.fontSize = `${fontSizePx * factor}px`
    }
  }

  function handleRotatePreview(delta: number) {
    if (!selectedRun) return
    revealRemovalPatch()
    selectedRun.element.style.transformOrigin = 'center'
    selectedRun.element.style.transform =
      `rotate(${delta}deg) ${selectionTransformBase()}`
  }

  function commitTransform(
    run: SelectedTextRun,
    transform: { dx: number; dy: number; width: number; height: number; rotation: number },
  ) {
    const item = itemsRef.current[run.index]
    const visual = visualsRef.current.get(run.index)
    if (!item || !visual) return
    const widthFactor =
      transform.width > 0 && run.bounds.width > 0
        ? transform.width / run.bounds.width
        : 1
    const fontSize = Math.max(4, textFontSize(item) * widthFactor)

    /* Rotation happens about the run's box centre (Figma-style): the
     * committed text matrix pivot is adjusted so the box centre the user
     * sees stays put while the run rotates around it. The measured centre
     * is first un-rotated into the run's own text space, then re-rotated
     * to the target angle, and any drag translation is folded in. */
    const viewport = page.getViewport({ scale })
    const bounds = run.bounds
    const [centreX, centreY] = viewport.convertToPdfPoint(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    )
    const startRadians = (run.pdfRotation * Math.PI) / 180
    const endRadians = (transform.rotation * Math.PI) / 180
    const offsetX = centreX - run.pdfX
    const offsetY = centreY - run.pdfY
    const localX =
      Math.cos(startRadians) * offsetX + Math.sin(startRadians) * offsetY
    const localY =
      -Math.sin(startRadians) * offsetX + Math.cos(startRadians) * offsetY
    const movedCentreX = centreX + transform.dx / scale
    const movedCentreY = centreY - transform.dy / scale
    const newX =
      movedCentreX - (Math.cos(endRadians) * localX - Math.sin(endRadians) * localY)
    const newY =
      movedCentreY - (Math.sin(endRadians) * localX + Math.cos(endRadians) * localY)

    const patch = removalPatchRef.current
    const edit: PdfTextEdit = {
      pageIndex: page.pageNumber - 1,
      originalX: run.pdfX,
      originalY: run.pdfY,
      x: newX,
      y: newY,
      width: run.pdfWidth,
      height: run.pdfHeight,
      fontSize,
      horizontalScale: textHorizontalScale(item),
      rotation: transform.rotation,
      color: visual.color,
      pdfFontName: visual.pdfFontName,
      fontFamily: 'original',
      fontWeight: inferredFontWeight(visual.pdfFontName),
      italic: inferredItalic(visual.pdfFontName),
      underline: false,
      letterSpacing: 0,
      renderedWidth: (run.element.getBoundingClientRect().width / scale) * widthFactor,
      backgroundPatch: patch
        ? captureBackgroundPatch(patch, page, scale)
        : captureRemovalPatch(run),
      text: run.originalText,
    }
    if (patch) {
      patch.classList.add('pdf-text-edit-layer__patch--visible')
    }
    removalPatchRef.current = null
    selectionOriginRef.current = null
    /* Leave the run's inline transform and text in place until the reloaded
     * page rebuilds the layer: the original glyphs are already erased by the
     * (now visible) removal patch, and keeping the moved span exactly where
     * the drag left it makes the move look instant instead of snapping the
     * old text back on screen before the new PDF appears. The span just must
     * not look or behave like a selectable duplicate any more — drop the
     * selection styling and block its pointer events so it can't be
     * clicked, hovered or edited again while the fresh page loads. */
    setSelectedRun(null)
    setDragOffset(null)
    setHoveredIndex(null)
    run.element.classList.remove('pdf-text-edit-layer__item--selected')
    run.element.style.pointerEvents = 'none'
    run.element.style.color = 'var(--pdf-text-color, #111827)'
    onSelectedRunChange?.(null)
    if (onTransformCommit) {
      onTransformCommit(edit)
    } else {
      onCommit(edit)
    }
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
      if (activeRef.current) {
        cancelActive(index)
        target.blur()
      } else if (selectedRun) {
        removalPatchRef.current?.remove()
        removalPatchRef.current = null
        selectionOriginRef.current = null
        selectedRun.element.style.transform = ''
        selectedRun.element.style.transformOrigin = ''
        target.classList.remove('pdf-text-edit-layer__item--selected')
        setSelectedRun(null)
        setDragOffset(null)
        onSelectedRunChange?.(null)
      }
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (activeRef.current) {
        commitActive(index)
        target.blur()
      } else {
        enterEditMode(target, index)
      }
    }
    if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      selectedRun &&
      !activeRef.current
    ) {
      event.preventDefault()
      handleSelectDelete()
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
    if (activeRef.current) {
      commitActive(index)
    }
  }


  function handleContainerClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = editableTarget(event.target)
    const container = containerRef.current
    if (!container) return

    if (target && target.dataset.textItemIndex !== undefined) {
      const index = Number(target.dataset.textItemIndex)
      if (activeRef.current?.index === index) return
      if (activeRef.current) {
        commitActive()
        return
      }
      const item = itemsRef.current[index]
      const visual = visualsRef.current.get(index)
      if (!item || !visual) return

      const bounds = boundsForRun(target, container, item, scale)
      const run: SelectedTextRun = {
        index,
        element: target,
        bounds,
        pdfX: Number(item.transform[4]),
        pdfY: Number(item.transform[5]),
        pdfWidth: Math.max(Number(item.width), Number(item.height)),
        pdfHeight: Math.max(Number(item.height), 1),
        pdfRotation: bounds.rotation,
        originalText: originalsRef.current.get(index) ?? item.str,
        pdfFontName: visual.pdfFontName,
      }
      removalPatchRef.current?.remove()
      removalPatchRef.current = createEditingPatch(
        target,
        container,
        backgroundCanvas,
        Math.max(4, Math.max(textFontSize(item), 4) * scale * 0.15),
        Math.max(3, Math.max(textFontSize(item), 4) * scale * 0.12),
        bounds.width,
        bounds.height,
      )
      selectionOriginRef.current = {
        transform: window.getComputedStyle(target).transform,
      }
      target.classList.add('pdf-text-edit-layer__item--selected')
      setSelectedRun(run)
      setDragOffset(null)
      onSelectedRunChange?.(run)
      return
    }

    if (event.target === event.currentTarget) {
      if (activeRef.current) {
        commitActive()
      }
      if (selectedRun) {
        removalPatchRef.current?.remove()
        removalPatchRef.current = null
        selectionOriginRef.current = null
        selectedRun.element.style.transform = ''
        selectedRun.element.style.transformOrigin = ''
        selectedRun.element.classList.remove(
          'pdf-text-edit-layer__item--selected',
        )
        setSelectedRun(null)
        setDragOffset(null)
        onSelectedRunChange?.(null)
      }
    }
  }

  let hoverPreview: ReactElement | null = null
  if (
    hoveredIndex !== null &&
    hoveredIndex !== selectedRun?.index &&
    !activeRef.current
  ) {
    const container = containerRef.current
    const item = itemsRef.current[hoveredIndex]
    const element = container?.querySelector<HTMLElement>(
      `[data-text-item-index="${hoveredIndex}"]`,
    )
    if (container && item && element) {
      const b = boundsForRun(element, container, item, scale)
      hoverPreview = (
        <div
          className="pdf-text-edit-layer__hover-preview"
          style={{
            left: b.left,
            top: b.top,
            width: b.width,
            height: b.height,
            transform: b.rotation
              ? `rotate(${b.rotation}deg)`
              : undefined,
            transformOrigin: 'center',
          }}
        />
      )
    }
  }

  return (
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 2 }}
      onClick={handleContainerClick}
    >
      <div
        ref={containerRef}
        className="pdf-text-edit-layer textLayer"
        aria-label={`Editable text on page ${page.pageNumber}`}
        onDoubleClick={handleDoubleClick}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onPointerOver={(event) => {
          if (activeRef.current) return
          const el = editableTarget(event.target)
          if (el) setHoveredIndex(Number(el.dataset.textItemIndex))
        }}
        onPointerOut={(event) => {
          const related = event.relatedTarget
          if (related instanceof HTMLElement) {
            const el = editableTarget(related)
            if (el) return
          }
          setHoveredIndex(null)
        }}
      />
      {hoverPreview}
      {selectedRun && (
        <TextSelectionOverlay
          selected={selectedRun}
          onSelect={(run) => {
            setSelectedRun(run)
            onSelectedRunChange?.(run)
          }}
          onDoubleClick={(run) => {
            enterEditMode(run.element, run.index)
          }}
          onMove={(_run, dx, dy) => handleMove(dx, dy)}
          onResize={(_run, dx, dy, corner) => handleResizePreview(dx, dy, corner)}
          onRotate={(_run, angle) => handleRotatePreview(angle)}
          onTransformEnd={(run, transform) => commitTransform(run, transform)}
          onDelete={handleSelectDelete}
          dragOffset={dragOffset}
        />
      )}
    </div>
  )
}