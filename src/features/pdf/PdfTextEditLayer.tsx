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
  onCommit: (edit: PdfTextEdit) => void
}

type PdfTextContent = Awaited<ReturnType<PDFPageProxy['getTextContent']>>
type PdfTextContentItem = PdfTextContent['items'][number]
type EditableTextItem = Extract<PdfTextContentItem, { str: string }>

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

/**
 * PDF.js lays extracted text runs over the canvas at their exact visual
 * positions. Each run becomes a plaintext contenteditable while edit mode is
 * active. Typing is therefore visible immediately; blur commits the run into
 * the local PDF document.
 */
export function PdfTextEditLayer({
  page,
  scale,
  onCommit,
}: PdfTextEditLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef<EditableTextItem[]>([])
  const originalsRef = useRef<Map<number, string>>(new Map())
  const skipCommitRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false
    let layer: InstanceType<typeof pdfjs.TextLayer> | null = null
    skipCommitRef.current = new Set()
    container.replaceChildren()

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
        layer.textDivs.forEach((element, index) => {
          const original = items[index]?.str ?? ''
          if (hasNewerRunAtSameBaseline(items, index)) {
            element.remove()
            return
          }
          if (!original.trim()) return
          element.dataset.textItemIndex = String(index)
          element.classList.add('pdf-text-edit-layer__item')
          element.setAttribute('contenteditable', 'plaintext-only')
          element.setAttribute('role', 'textbox')
          element.setAttribute('aria-label', `Edit text: ${original}`)
          element.setAttribute('spellcheck', 'true')
          element.tabIndex = 0
        })
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
      container.replaceChildren()
    }
  }, [page, scale])

  function handleFocus(event: ReactFocusEvent<HTMLDivElement>) {
    editableTarget(event.target)?.classList.add(
      'pdf-text-edit-layer__item--active',
    )
  }

  function handleInput(event: ReactFormEvent<HTMLDivElement>) {
    const target = editableTarget(event.target)
    if (!target) return
    const index = Number(target.dataset.textItemIndex)
    target.classList.toggle(
      'pdf-text-edit-layer__item--changed',
      target.textContent !== originalsRef.current.get(index),
    )
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
    if (!target) return
    target.classList.remove('pdf-text-edit-layer__item--active')
    const index = Number(target.dataset.textItemIndex)
    if (skipCommitRef.current.delete(index)) {
      target.classList.remove('pdf-text-edit-layer__item--changed')
      return
    }
    const item = itemsRef.current[index]
    const text = target.textContent ?? ''
    if (!item || text === originalsRef.current.get(index)) return

    originalsRef.current.set(index, text)
    target.classList.remove('pdf-text-edit-layer__item--changed')
    onCommit({
      pageIndex: page.pageNumber - 1,
      x: Number(item.transform[4]),
      y: Number(item.transform[5]),
      width: Math.max(Number(item.width), Number(item.height)),
      height: Math.max(Number(item.height), 1),
      fontSize: Math.max(Number(item.height), 4),
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
