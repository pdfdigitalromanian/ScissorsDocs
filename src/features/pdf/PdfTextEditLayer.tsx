import { useEffect, useRef } from 'react'
import type {
  FocusEvent as ReactFocusEvent,
  FormEvent as ReactFormEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { PdfTextEdit } from '@/features/editor/model'
import { pdfjs } from './pdfjs'

interface PdfTextEditLayerProps {
  page: PDFPageProxy
  scale: number
  sourceCanvas: HTMLCanvasElement
  backgroundCanvas: HTMLCanvasElement
  onCommit: (edit: PdfTextEdit) => void
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

function hasNewerRunAtSameBaseline(
  items: EditableTextItem[],
  index: number,
): boolean {
  const current = items[index]
  if (!current) return false
  const x = Number(current.transform[4])
  const y = Number(current.transform[5])
  return items.slice(index + 1).some((candidate) => {
    return (
      Math.abs(Number(candidate.transform[4]) - x) < 1 &&
      Math.abs(Number(candidate.transform[5]) - y) < 1
    )
  })
}

function textCanvasBounds(
  element: HTMLElement,
  container: HTMLElement,
  canvas: HTMLCanvasElement,
  padding = 0,
) {
  const elementRect = element.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const left = clamp(
    elementRect.left - containerRect.left - padding,
    0,
    containerRect.width,
  )
  const top = clamp(
    elementRect.top - containerRect.top - padding,
    0,
    containerRect.height,
  )
  const right = clamp(
    elementRect.right - containerRect.left + padding,
    left,
    containerRect.width,
  )
  const bottom = clamp(
    elementRect.bottom - containerRect.top + padding,
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

function dataUrlBytes(dataUrl: string): Uint8Array {
  const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = window.atob(encoded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function createEditingPatch(
  element: HTMLElement,
  container: HTMLElement,
  backgroundCanvas: HTMLCanvasElement,
): HTMLCanvasElement {
  const bounds = textCanvasBounds(element, container, backgroundCanvas, 3)
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
  element: HTMLElement,
  container: HTMLElement,
  backgroundCanvas: HTMLCanvasElement,
  page: PDFPageProxy,
  scale: number,
): PdfTextEdit['backgroundPatch'] {
  const bounds = textCanvasBounds(element, container, backgroundCanvas, 2)
  const width = Math.max(1, bounds.pixels.right - bounds.pixels.left)
  const height = Math.max(1, bounds.pixels.bottom - bounds.pixels.top)
  const patch = document.createElement('canvas')
  patch.width = width
  patch.height = height
  const context = patch.getContext('2d')
  if (!context) throw new Error('The PDF background could not be captured.')
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

  const viewport = page.getViewport({ scale })
  const first = viewport.convertToPdfPoint(bounds.css.left, bounds.css.top)
  const second = viewport.convertToPdfPoint(bounds.css.right, bounds.css.bottom)
  return {
    png: dataUrlBytes(patch.toDataURL('image/png')),
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
}: PdfTextEditLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef<EditableTextItem[]>([])
  const originalsRef = useRef<Map<number, string>>(new Map())
  const visualsRef = useRef<Map<number, TextRunVisual>>(new Map())
  const patchesRef = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const skipCommitRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false
    let layer: InstanceType<typeof pdfjs.TextLayer> | null = null
    const visuals = new Map<number, TextRunVisual>()
    const patches = new Map<number, HTMLCanvasElement>()
    visualsRef.current = visuals
    patchesRef.current = patches
    skipCommitRef.current = new Set()
    container.replaceChildren()
    container.classList.remove('pdf-text-edit-layer--ready')

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
        container.style.setProperty('--scale-factor', String(scale))
        container.style.setProperty('--total-scale-factor', String(scale))
        layer = new pdfjs.TextLayer({
          textContentSource: content,
          container,
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
            container,
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
        container.dataset.unavailableTextRuns = String(unavailableRuns)
        container.classList.add('pdf-text-edit-layer--ready')
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          console.error(
            `Failed to build editable text for page ${page.pageNumber}.`,
            reason,
          )
        }
      })

    return () => {
      cancelled = true
      layer?.cancel()
      itemsRef.current = []
      visuals.clear()
      patches.clear()
      container.replaceChildren()
    }
  }, [page, scale, sourceCanvas, backgroundCanvas])

  function removeEditingPatch(index: number) {
    patchesRef.current.get(index)?.remove()
    patchesRef.current.delete(index)
  }

  function handleFocus(event: ReactFocusEvent<HTMLDivElement>) {
    const target = editableTarget(event.target)
    const container = containerRef.current
    if (!target || !container) return
    const index = Number(target.dataset.textItemIndex)
    if (!patchesRef.current.has(index)) {
      const patch = createEditingPatch(target, container, backgroundCanvas)
      container.prepend(patch)
      patchesRef.current.set(index, patch)
    }
    target.classList.add('pdf-text-edit-layer__item--active')
  }

  function handleInput(event: ReactFormEvent<HTMLDivElement>) {
    const target = editableTarget(event.target)
    if (!target) return
    const index = Number(target.dataset.textItemIndex)
    const changed = target.textContent !== originalsRef.current.get(index)
    target.classList.toggle('pdf-text-edit-layer__item--changed', changed)
    patchesRef.current
      .get(index)
      ?.classList.toggle('pdf-text-edit-layer__patch--visible', changed)
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const target = editableTarget(event.target)
    if (!target) return
    const index = Number(target.dataset.textItemIndex)
    if (event.key === 'Escape') {
      event.preventDefault()
      target.textContent = originalsRef.current.get(index) ?? ''
      skipCommitRef.current.add(index)
      target.blur()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      target.blur()
    }
  }

  function handleBlur(event: ReactFocusEvent<HTMLDivElement>) {
    const target = editableTarget(event.target)
    const container = containerRef.current
    if (!target || !container) return
    target.classList.remove('pdf-text-edit-layer__item--active')
    const index = Number(target.dataset.textItemIndex)
    if (skipCommitRef.current.delete(index)) {
      target.classList.remove('pdf-text-edit-layer__item--changed')
      removeEditingPatch(index)
      return
    }
    const item = itemsRef.current[index]
    const visual = visualsRef.current.get(index)
    const text = target.textContent ?? ''
    if (!item || !visual) {
      removeEditingPatch(index)
      return
    }
    if (text === originalsRef.current.get(index)) {
      removeEditingPatch(index)
      return
    }

    originalsRef.current.set(index, text)
    target.classList.add('pdf-text-edit-layer__item--changed')
    onCommit({
      pageIndex: page.pageNumber - 1,
      x: Number(item.transform[4]),
      y: Number(item.transform[5]),
      width: Math.max(Number(item.width), Number(item.height)),
      height: Math.max(Number(item.height), 1),
      fontSize: Math.max(textFontSize(item), 4),
      horizontalScale: textHorizontalScale(item),
      rotation:
        (Math.atan2(Number(item.transform[1]), Number(item.transform[0])) *
          180) /
        Math.PI,
      color: visual.color,
      pdfFontName: visual.pdfFontName,
      backgroundPatch: captureBackgroundPatch(
        target,
        container,
        backgroundCanvas,
        page,
        scale,
      ),
      text,
    })
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
