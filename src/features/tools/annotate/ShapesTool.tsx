import { useEffect, useRef, useState } from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'
import { Icon } from '@/components/icons/Icon'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { usePdfDocument } from '../stage/usePdfDocument'
import { useCurrentPage } from '../stage/useCurrentPage'
import UploadDrop from '../organize/components/UploadDrop'
import OrganizeResult from '../organize/components/OrganizeResult'
import type { OrganizeOutput } from '../organize/lib'
import type { PdfElement, ShapeElement, ShapeKind } from '@/features/editor/elements'
import { AnnotateStage } from './AnnotateStage'
import {
  commitShape,
  exportElementsPdf,
  type ShapeDefaults,
} from './annotate-lib'
import './annotate.css'

const SHAPE_TOOLS: { id: ShapeKind; icon: 'square' | 'circle' | 'line' | 'arrow-right'; label: string }[] = [
  { id: 'rect', icon: 'square', label: 'Rectangle' },
  { id: 'ellipse', icon: 'circle', label: 'Ellipse' },
  { id: 'line', icon: 'line', label: 'Line' },
  { id: 'arrow', icon: 'arrow-right', label: 'Arrow' },
]

export default function ShapesTool() {
  const { session, loading, error, load, clear } = usePdfDocument()
  const [pageIndex, setPageIndex] = useState(0)
  const [scale, setScale] = useState(1)
  const [tool, setTool] = useState<'select' | ShapeKind>('select')
  const [elements, setElements] = useState<PdfElement[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [defaults, setDefaults] = useState<ShapeDefaults>({
    strokeColor: '#1f6feb',
    fillColor: '#1f6feb',
    strokeWidth: 2,
    cornerRadius: 0,
  })
  const [processing, setProcessing] = useState(false)
  const [workError, setWorkError] = useState('')
  const [outputs, setOutputs] = useState<OrganizeOutput[] | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  const page = useCurrentPage(session, pageIndex)
  const pageCount = session?.pageCount ?? 0
  const viewport = page ? page.getViewport({ scale }) : null
  const pageSize = viewport
    ? { width: viewport.width / scale, height: viewport.height / scale }
    : { width: 600, height: 800 }

  useEffect(() => {
    setPageIndex(0)
    setElements([])
    setSelectedId(null)
    setOutputs(null)
    setWorkError('')
  }, [session])

  useEffect(() => {
    if (!page) return
    const wrapper = stageRef.current
    const available = Math.max(320, (wrapper?.clientWidth ?? 800) - 48)
    const maxHeight = Math.max(320, window.innerHeight * 0.62)
    const fit = Math.min(
      2.2,
      Math.max(0.4, Math.min(available / viewportWidth(page), maxHeight / viewportHeight(page))),
    )
    setScale(fit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  function viewportWidth(pageProxy: PDFPageProxy): number {
    return pageProxy.getViewport({ scale: 1 }).width
  }
  function viewportHeight(pageProxy: PDFPageProxy): number {
    return pageProxy.getViewport({ scale: 1 }).height
  }

  const selectedShape =
    elements.find(
      (element): element is ShapeElement =>
        element.id === selectedId && element.type === 'shape',
    ) ?? null

  function updateElement(id: string, updates: Partial<PdfElement>) {
    setElements((current) =>
      current.map((element) =>
        element.id === id ? ({ ...element, ...updates } as PdfElement) : element,
      ),
    )
  }

  function deleteElement(id: string) {
    setElements((current) => current.filter((element) => element.id !== id))
    setSelectedId(null)
  }

  function patchSelected(updates: Partial<ShapeElement>) {
    if (selectedShape) {
      updateElement(selectedShape.id, updates)
    } else {
      setDefaults((current) => ({ ...current, ...updates }))
    }
  }

  function handleCommitCreate(shape: ShapeKind, start: { x: number; y: number }, current: { x: number; y: number }) {
    if (Math.hypot(current.x - start.x, current.y - start.y) < 4) return
    const element = commitShape(pageIndex, elements, shape, start, current, defaults)
    setElements((all) => [...all, element])
    setSelectedId(element.id)
  }

  async function handleApply() {
    if (!session) return
    setProcessing(true)
    setWorkError('')
    try {
      const result = await exportElementsPdf(session.bytes, elements)
      const baseName = session.file.name.replace(/\.pdf$/i, '') || 'document'
      setOutputs([
        {
          filename: `${baseName}-shapes.pdf`,
          bytes: result.bytes,
          pages: result.pageCount,
        },
      ])
    } catch (reason) {
      setWorkError(
        reason instanceof Error ? reason.message : 'The PDF could not be generated.',
      )
    } finally {
      setProcessing(false)
    }
  }

  function clearAll() {
    setElements([])
    setSelectedId(null)
  }

  if (outputs) {
    return (
      <OrganizeResult
        outputs={outputs}
        onStartAnother={() => {
          setOutputs(null)
          clear()
        }}
      />
    )
  }

  if (!session) {
    return (
      <div className="organize-workflow">
        <section className="organize-section">
          <div className="organize-section__heading">
            <h2>Upload PDF</h2>
            <p>Choose the document you want to add shapes to.</p>
          </div>
          <UploadDrop
            title="Drag & drop a PDF here"
            subtitle="Everything happens locally in your browser — nothing is uploaded."
            accept=".pdf,application/pdf"
            onFiles={(files) => {
              const pdf = files.find(
                (file) =>
                  file.type === 'application/pdf' ||
                  file.name.toLowerCase().endsWith('.pdf'),
              )
              if (pdf) load(pdf)
            }}
          />
        </section>
        {error ? (
          <div className="organize-error" role="alert">
            <Icon name="alert-circle" size="sm" aria-hidden="true" />
            {error}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="organize-workflow annotate-workflow">
      <section className="organize-section">
        <div className="organize-section__heading">
          <h2>Add shapes</h2>
          <p>
            Choose a shape, then drag on the page to draw it. Select a shape to
            move, resize, rotate, or delete it. Shapes are baked into the PDF
            when you apply.
          </p>
        </div>

        <div className="annotate-toolbar">
          <div className="annotate-toolbar__tools" role="group" aria-label="Tool">
            <button
              type="button"
              className={`annotate-tool${tool === 'select' ? ' annotate-tool--active' : ''}`}
              onClick={() => setTool('select')}
            >
              <Icon name="pointer" size="sm" aria-hidden="true" />
              Select
            </button>
            {SHAPE_TOOLS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`annotate-tool${tool === entry.id ? ' annotate-tool--active' : ''}`}
                onClick={() => setTool(entry.id)}
              >
                <Icon name={entry.icon} size="sm" aria-hidden="true" />
                {entry.label}
              </button>
            ))}
          </div>
          <div className="annotate-toolbar__pages">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pageIndex === 0}
              onClick={() => setPageIndex((index) => Math.max(0, index - 1))}
              aria-label="Previous page"
            >
              <Icon name="chevron-left" size="sm" aria-hidden="true" />
            </Button>
            <span className="annotate-toolbar__label">
              Page {pageIndex + 1} of {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pageIndex >= pageCount - 1}
              onClick={() => setPageIndex((index) => Math.min(pageCount - 1, index + 1))}
              aria-label="Next page"
            >
              <Icon name="chevron-right" size="sm" aria-hidden="true" />
            </Button>
          </div>
          <div className="annotate-toolbar__zoom">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setScale((value) => Math.max(0.3, value * 0.8))}
              aria-label="Zoom out"
            >
              <Icon name="zoom-out" size="sm" aria-hidden="true" />
            </Button>
            <span className="annotate-toolbar__label">{Math.round(scale * 100)}%</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setScale((value) => Math.min(4, value * 1.2))}
              aria-label="Zoom in"
            >
              <Icon name="zoom-in" size="sm" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="annotate-stage__scroll" ref={stageRef}>
          {loading ? (
            <div className="organize-loading" role="status">
              <Spinner size="sm" label="" /> Reading pages…
            </div>
          ) : page && viewport ? (
            <AnnotateStage
              page={page}
              scale={scale}
              pageIndex={pageIndex}
              pageSize={pageSize}
              elements={elements}
              selectedId={selectedId}
              tool={tool}
              onSelect={setSelectedId}
              onUpdateElement={updateElement}
              onDeleteElement={deleteElement}
              onCommitCreate={handleCommitCreate}
              onImageFile={() => undefined}
            />
          ) : (
            <div className="organize-loading" role="status">
              <Spinner size="sm" label="" /> Preparing page…
            </div>
          )}
        </div>

        <div className="annotate-panel">
          <div className="annotate-panel__heading">
            <span>{selectedShape ? 'Selected shape' : 'Shape style'}</span>
            {selectedShape ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedId(null)}
              >
                Done
              </Button>
            ) : null}
          </div>
          <div className="annotate-panel__grid">
            <label className="annotate-field">
              <span>Stroke</span>
              <input
                type="color"
                value={selectedShape?.strokeColor ?? defaults.strokeColor}
                onChange={(event) => patchSelected({ strokeColor: event.target.value })}
              />
            </label>
            <label className="annotate-field">
              <span>Width</span>
              <input
                type="number"
                min={0}
                max={24}
                step={0.5}
                value={selectedShape?.strokeWidth ?? defaults.strokeWidth}
                onChange={(event) =>
                  patchSelected({ strokeWidth: Math.max(0, Number(event.target.value)) })
                }
              />
            </label>
            <label className="annotate-field">
              <span>Fill</span>
              <input
                type="color"
                value={selectedShape?.fillColor ?? defaults.fillColor ?? '#ffffff'}
                onChange={(event) => patchSelected({ fillColor: event.target.value })}
              />
            </label>
            <label className="annotate-field annotate-field--check">
              <input
                type="checkbox"
                checked={
                  selectedShape
                    ? selectedShape.fillColor !== null
                    : defaults.fillColor !== null
                }
                onChange={(event) =>
                  patchSelected({ fillColor: event.target.checked ? '#ffffff' : null })
                }
              />
              <span>Filled</span>
            </label>
            {selectedShape?.shape === 'rect' || (!selectedShape && tool === 'rect') ? (
              <label className="annotate-field">
                <span>Corner radius</span>
                <input
                  type="number"
                  min={0}
                  max={200}
                  step={1}
                  value={selectedShape?.cornerRadius ?? defaults.cornerRadius}
                  onChange={(event) =>
                    patchSelected({ cornerRadius: Math.max(0, Number(event.target.value)) })
                  }
                />
              </label>
            ) : null}
            {selectedShape ? (
              <label className="annotate-field">
                <span>Opacity</span>
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={1}
                  value={Math.round((selectedShape.opacity ?? 1) * 100)}
                  onChange={(event) =>
                    updateElement(selectedShape.id, {
                      opacity: Number(event.target.value) / 100,
                    })
                  }
                />
                <span className="annotate-field__value">
                  {Math.round((selectedShape.opacity ?? 1) * 100)}%
                </span>
              </label>
            ) : null}
          </div>
        </div>

        {workError ? (
          <div className="organize-error" role="alert">
            <Icon name="alert-circle" size="sm" aria-hidden="true" />
            {workError}
          </div>
        ) : null}

        <div className="organize-actions">
          <Button
            size="lg"
            disabled={elements.length === 0 || processing}
            onClick={() => void handleApply()}
          >
            {processing ? <Spinner size="sm" label="Generating" /> : null}
            {processing ? 'Generating…' : 'Apply shapes'}
          </Button>
          {elements.length > 0 ? (
            <Button type="button" variant="ghost" disabled={processing} onClick={clearAll}>
              Clear all shapes
            </Button>
          ) : null}
          <span className="organize-hint">
            {elements.length} shape{elements.length === 1 ? '' : 's'} drawn
          </span>
        </div>
      </section>
    </div>
  )
}