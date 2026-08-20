import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'
import { Icon } from '@/components/icons/Icon'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { usePdfDocument } from '../stage/usePdfDocument'
import { useCurrentPage } from '../stage/useCurrentPage'
import PdfStage from '../stage/PdfStage'
import UploadDrop from '../organize/components/UploadDrop'
import OrganizeResult from '../organize/components/OrganizeResult'
import type { OrganizeOutput } from '../organize/lib'
import SignatureStudio from './components/SignatureStudio'
import { applySignatures, type PlacedSignature } from './apply-signatures'
import {
  transformSignatureDataUrl,
  type SignatureImage,
} from './signature-lib'

interface DragState {
  type: 'move' | 'resize' | 'rotate'
  placementId: string
  startClientX: number
  startClientY: number
  startX: number
  startY: number
  startWidth: number
  startHeight: number
  startRotation: number
  centerPdf: { x: number; y: number }
  centerCss: { x: number; y: number }
  scale: number
  handle: ResizeHandle | null
}

const MIN_SIZE = 24

type ResizeHandle = 'tl' | 't' | 'tr' | 'r' | 'br' | 'b' | 'bl' | 'l'

const RESIZE_HANDLES: ResizeHandle[] = [
  'tl',
  't',
  'tr',
  'r',
  'br',
  'b',
  'bl',
  'l',
]

interface RectPdf {
  x: number
  y: number
  width: number
  height: number
}

/** Rotates a point around an anchor so resize math happens in local space. */
function inverseRotatePoint(
  point: { x: number; y: number },
  anchor: { x: number; y: number },
  rotation: number,
): { x: number; y: number } {
  const radians = (-rotation * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const dx = point.x - anchor.x
  const dy = point.y - anchor.y
  return {
    x: anchor.x + dx * cos - dy * sin,
    y: anchor.y + dx * sin + dy * cos,
  }
}

/**
 * Computes the resized rect while keeping the opposite edge/corner fixed —
 * the same anchor-based directional resize the editor uses for shapes.
 */
function resizePlacementRect(
  startRect: RectPdf,
  handle: ResizeHandle,
  pointer: { x: number; y: number },
  rotation: number,
): RectPdf {
  const anchors: Record<ResizeHandle, { x: number; y: number }> = {
    tl: { x: startRect.x + startRect.width, y: startRect.y + startRect.height },
    t: {
      x: startRect.x + startRect.width / 2,
      y: startRect.y + startRect.height,
    },
    tr: { x: startRect.x, y: startRect.y + startRect.height },
    r: { x: startRect.x, y: startRect.y + startRect.height / 2 },
    br: { x: startRect.x, y: startRect.y },
    b: { x: startRect.x + startRect.width / 2, y: startRect.y },
    bl: { x: startRect.x + startRect.width, y: startRect.y },
    l: {
      x: startRect.x + startRect.width,
      y: startRect.y + startRect.height / 2,
    },
  }
  const anchor = anchors[handle]
  const local = inverseRotatePoint(pointer, anchor, rotation)
  const dx = local.x - anchor.x
  const dy = local.y - anchor.y

  const corner =
    handle === 'tl' || handle === 'tr' || handle === 'bl' || handle === 'br'
  const horizontal = handle === 'l' || handle === 'r'
  const vertical = handle === 't' || handle === 'b'

  let width = startRect.width
  let height = startRect.height
  if (corner) {
    width = Math.abs(handle === 'tr' || handle === 'br' ? dx : -dx)
    height = Math.abs(handle === 'br' || handle === 'bl' ? dy : -dy)
  } else if (horizontal) {
    width = Math.abs(handle === 'r' ? dx : -dx)
  } else if (vertical) {
    height = Math.abs(handle === 'b' ? dy : -dy)
  }

  width = Math.max(width, MIN_SIZE)
  height = Math.max(height, MIN_SIZE)

  switch (handle) {
    case 'br':
      return { x: anchor.x, y: anchor.y, width, height }
    case 'tl':
      return { x: anchor.x - width, y: anchor.y - height, width, height }
    case 'tr':
      return { x: anchor.x, y: anchor.y - height, width, height }
    case 'bl':
      return { x: anchor.x - width, y: anchor.y, width, height }
    case 'r':
      return { x: anchor.x, y: anchor.y - height / 2, width, height }
    case 'l':
      return { x: anchor.x - width, y: anchor.y - height / 2, width, height }
    case 'b':
      return { x: anchor.x - width / 2, y: anchor.y, width, height }
    case 't':
      return { x: anchor.x - width / 2, y: anchor.y - height, width, height }
    default:
      return startRect
  }
}

interface SignToolProps {
  /** When provided, the document loads immediately instead of showing the upload step. */
  initialBytes?: Uint8Array
  initialName?: string
}

export default function SignTool({
  initialBytes,
  initialName,
}: SignToolProps = {}) {
  const { session, loading, error, load, clear } = usePdfDocument()
  const [pageIndex, setPageIndex] = useState(0)
  const [scale, setScale] = useState(1)
  const [placementMode, setPlacementMode] = useState<'draw' | 'select'>('draw')
  const [signatures, setSignatures] = useState<SignatureImage[]>([])
  const [activeSignatureId, setActiveSignatureId] = useState<string | null>(null)
  const [placements, setPlacements] = useState<PlacedSignature[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [workError, setWorkError] = useState('')
  const [outputs, setOutputs] = useState<OrganizeOutput[] | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const transformSeqRef = useRef(0)

  const loadedInitialRef = useRef(false)
  useEffect(() => {
    if (initialBytes && !loadedInitialRef.current) {
      loadedInitialRef.current = true
      load(
        new File([initialBytes as unknown as BlobPart], initialName ?? 'document.pdf', {
          type: 'application/pdf',
        }),
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBytes, initialName])

  const page = useCurrentPage(session, pageIndex)
  const pageCount = session?.pageCount ?? 0
  const viewport = page ? page.getViewport({ scale }) : null
  const pageDims = page
    ? { width: page.view[2] - page.view[0], height: page.view[3] - page.view[1] }
    : null

  const activeSignature =
    signatures.find((signature) => signature.id === activeSignatureId) ?? null

  useEffect(() => {
    setPageIndex(0)
    setSignatures([])
    setActiveSignatureId(null)
    setPlacements([])
    setSelectedId(null)
    setOutputs(null)
    setWorkError('')
  }, [session])

  useEffect(() => {
    if (!page) return
    const wrapper = stageRef.current
    const available = Math.max(320, (wrapper?.clientWidth ?? 800) - 48)
    const maxHeight = Math.max(320, window.innerHeight * 0.68)
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

  // ── Signature management ────────────────────────────────────────────

  function handleCreateSignature(signature: SignatureImage) {
    setSignatures((current) => [...current, signature])
    setActiveSignatureId(signature.id)
    setWorkError('')
  }

  function handleRemoveSignature(id: string) {
    setSignatures((current) => current.filter((signature) => signature.id !== id))
    setPlacements((current) => current.filter((placement) => placement.sourceId !== id))
    setSelectedId(null)
    setActiveSignatureId((current) => (current === id ? null : current))
  }

  // ── Placement management ────────────────────────────────────────────

  function overlayPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = stageRef.current?.getBoundingClientRect()
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) }
  }

  function addPlacement(signature: SignatureImage, pdfX: number, pdfY: number) {
    const aspect = signature.height / signature.width
    let width = 180
    let height = width * aspect
    const maxWidth = (pageDims?.width ?? 600) * 0.6
    const maxHeight = (pageDims?.height ?? 800) * 0.35
    if (width > maxWidth) {
      width = Math.max(MIN_SIZE, maxWidth)
      height = width * aspect
    }
    if (height > maxHeight) {
      height = Math.max(MIN_SIZE, maxHeight)
      width = height / aspect
    }
    const placement: PlacedSignature = {
      id: `sig-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      pageIndex,
      sourceId: signature.id,
      x: pdfX - width / 2,
      y: pdfY - height / 2,
      width,
      height,
      rotation: 0,
    }
    setPlacements((current) => [...current, placement])
    setSelectedId(placement.id)
  }

  function handleOverlayPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    if (event.currentTarget !== event.target) return
    if (placementMode === 'select') return
    if (!activeSignature || !viewport) {
      setWorkError(
        activeSignature
          ? ''
          : 'Create a signature first, then click the page to place it.',
      )
      return
    }
    setWorkError('')
    const point = overlayPoint(event.clientX, event.clientY)
    const [pdfX, pdfY] = viewport.convertToPdfPoint(point.x, point.y)
    addPlacement(activeSignature, pdfX, pdfY)
  }

  function updatePlacement(id: string, updates: Partial<PlacedSignature>) {
    setPlacements((current) =>
      current.map((placement) =>
        placement.id === id ? { ...placement, ...updates } : placement,
      ),
    )
  }

  function duplicatePlacement(id: string) {
    setPlacements((current) => {
      const source = current.find((placement) => placement.id === id)
      if (!source) return current
      const copy: PlacedSignature = {
        ...source,
        id: `sig-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
        x: source.x + 16,
        y: source.y - 16,
      }
      setSelectedId(copy.id)
      return [...current, copy]
    })
  }

  function deletePlacement(id: string) {
    setPlacements((current) => current.filter((placement) => placement.id !== id))
    setSelectedId(null)
  }

  // ── Per-placement style (color / stroke width) ────────────────────

  function selectedPlacement(): PlacedSignature | null {
    return placements.find((placement) => placement.id === selectedId) ?? null
  }

  function placementSource(placement: PlacedSignature): SignatureImage | null {
    return signatures.find((signature) => signature.id === placement.sourceId) ?? null
  }

  async function handlePlacementColor(color: string) {
    const placement = selectedPlacement()
    if (!placement) return
    const source = placementSource(placement)
    if (!source) return
    const seq = ++transformSeqRef.current
    const displayUrl = await transformSignatureDataUrl(source.dataUrl, {
      color,
      strokeWidth: placement.strokeWidth ?? 100,
    })
    if (seq !== transformSeqRef.current) return
    updatePlacement(placement.id, { color, displayUrl })
  }

  async function handlePlacementStrokeWidth(width: number) {
    const placement = selectedPlacement()
    if (!placement) return
    const source = placementSource(placement)
    if (!source) return
    const seq = ++transformSeqRef.current
    const displayUrl = await transformSignatureDataUrl(source.dataUrl, {
      color: placement.color ?? null,
      strokeWidth: width,
    })
    if (seq !== transformSeqRef.current) return
    updatePlacement(placement.id, { strokeWidth: width, displayUrl })
  }

  // ── Drag interactions ───────────────────────────────────────────────

  function beginDrag(drag: DragState) {
    dragRef.current = drag
    window.addEventListener('pointermove', handleDragMove)
    window.addEventListener('pointerup', handleDragEnd)
    window.addEventListener('pointercancel', handleDragEnd)
  }

  function endDrag() {
    dragRef.current = null
    window.removeEventListener('pointermove', handleDragMove)
    window.removeEventListener('pointerup', handleDragEnd)
    window.removeEventListener('pointercancel', handleDragEnd)
  }

  function handleDragMove(event: PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const delta = {
      x: event.clientX - drag.startClientX,
      y: event.clientY - drag.startClientY,
    }
    if (drag.type === 'move') {
      updatePlacement(drag.placementId, {
        x: drag.startX + delta.x / drag.scale,
        y: drag.startY - delta.y / drag.scale,
      })
    } else if (drag.type === 'resize') {
      if (!viewport || !drag.handle) return
      const point = overlayPoint(event.clientX, event.clientY)
      const [pdfX, pdfY] = viewport.convertToPdfPoint(point.x, point.y)
      const next = resizePlacementRect(
        {
          x: drag.startX,
          y: drag.startY,
          width: drag.startWidth,
          height: drag.startHeight,
        },
        drag.handle,
        { x: pdfX, y: pdfY },
        drag.startRotation,
      )
      updatePlacement(drag.placementId, next)
    } else if (drag.type === 'rotate') {
      const point = overlayPoint(event.clientX, event.clientY)
      const angle =
        (Math.atan2(point.y - drag.centerCss.y, point.x - drag.centerCss.x) *
          180) /
        Math.PI
      const rotation = ((angle + 90) % 360 + 360) % 360
      updatePlacement(drag.placementId, { rotation })
    }
  }

  function handleDragEnd() {
    endDrag()
  }

  function handlePlacementPointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
    placement: PlacedSignature,
  ) {
    event.stopPropagation()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Pointer capture is best-effort.
    }
    setSelectedId(placement.id)
    const centerPdf = {
      x: placement.x + placement.width / 2,
      y: placement.y + placement.height / 2,
    }
    const [centerCssX, centerCssY] = viewport
      ? viewport.convertToViewportPoint(centerPdf.x, centerPdf.y)
      : [0, 0]
    beginDrag({
      type: 'move',
      placementId: placement.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: placement.x,
      startY: placement.y,
      startWidth: placement.width,
      startHeight: placement.height,
      startRotation: placement.rotation,
      centerPdf,
      centerCss: { x: centerCssX, y: centerCssY },
      scale,
      handle: null,
    })
  }

  function handleHandlePointerDown(
    event: ReactPointerEvent<HTMLElement>,
    placement: PlacedSignature,
    type: 'rotate' | ResizeHandle,
  ) {
    event.stopPropagation()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Pointer capture is best-effort.
    }
    const centerPdf = {
      x: placement.x + placement.width / 2,
      y: placement.y + placement.height / 2,
    }
    const [centerCssX, centerCssY] = viewport
      ? viewport.convertToViewportPoint(centerPdf.x, centerPdf.y)
      : [0, 0]
    beginDrag({
      type: type === 'rotate' ? 'rotate' : 'resize',
      placementId: placement.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: placement.x,
      startY: placement.y,
      startWidth: placement.width,
      startHeight: placement.height,
      startRotation: placement.rotation,
      centerPdf,
      centerCss: { x: centerCssX, y: centerCssY },
      scale,
      handle: type === 'rotate' ? null : type,
    })
  }

  useEffect(
    () => () => {
      endDrag()
    },
    [],
  )

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!selectedId) return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deletePlacement(selectedId)
      } else if (event.key === 'Escape') {
        setSelectedId(null)
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicatePlacement(selectedId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId])

  // ── Apply ───────────────────────────────────────────────────────────

  async function handleApply() {
    if (!session) return
    setProcessing(true)
    setWorkError('')
    try {
      const result = await applySignatures(session.bytes, signatures, placements)
      const baseName = session.file.name.replace(/\.pdf$/i, '') || 'document'
      setOutputs([
        {
          filename: `${baseName}-signed.pdf`,
          bytes: result.bytes,
          pages: result.pageCount,
        },
      ])
    } catch (reason) {
      setWorkError(
        reason instanceof Error
          ? reason.message
          : 'The PDF could not be signed.',
      )
    } finally {
      setProcessing(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────

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
            <p>Choose the document you want to sign.</p>
          </div>
          <UploadDrop
            title="Drag & drop a PDF here"
            subtitle="Signed locally in your browser — the PDF and your signature never leave this device."
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
    <div className="organize-workflow sign-workflow">
      <section className="organize-section">
        <div className="organize-section__heading">
          <h2>Create your signature</h2>
          <p>
            Draw, type, or upload a signature. It is created locally and never
            stored or sent anywhere.
          </p>
        </div>
        <SignatureStudio onCreate={handleCreateSignature} />
      </section>

      <section className="organize-section">
        <div className="organize-section__heading">
          <h2>Place on the document</h2>
          <p>
            Choose the signature below, then click anywhere on a page to place
            it. Click a placed signature to move, resize, rotate, duplicate, or
            delete it.
          </p>
        </div>

        {signatures.length > 0 ? (
          <div className="sign-signatures" role="list" aria-label="Your signatures">
            {signatures.map((signature) => (
              <div
                key={signature.id}
                role="listitem"
                className={`sign-signature${
                  activeSignatureId === signature.id
                    ? ' sign-signature--active'
                    : ''
                }`}
                onClick={() => setActiveSignatureId(signature.id)}
              >
                <img src={signature.dataUrl} alt={signature.label} />
                <button
                  type="button"
                  className="sign-signature__remove"
                  aria-label={`Remove ${signature.label}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleRemoveSignature(signature.id)
                  }}
                >
                  <Icon name="close" size="xs" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="sign-hint">Create a signature above to start placing it.</p>
        )}

        {(() => {
          const placement = selectedPlacement()
          if (!placement) return null
          const source = placementSource(placement)
          if (!source) return null
          return (
            <div className="sign-placement-controls" role="group" aria-label="Selected placement">
              <span className="sign-placement-controls__title">Selected placement</span>
              <label className="sign-placement-controls__field">
                <span>Color</span>
                <input
                  type="color"
                  className="sign-placement-controls__color"
                  value={placement.color ?? '#0f172a'}
                  onChange={(event) =>
                    void handlePlacementColor(event.target.value)
                  }
                />
              </label>
              <label className="sign-placement-controls__field sign-placement-controls__field--grow">
                <span>Stroke width</span>
                <input
                  type="range"
                  min={40}
                  max={300}
                  step={5}
                  value={placement.strokeWidth ?? 100}
                  onChange={(event) =>
                    void handlePlacementStrokeWidth(Number(event.target.value))
                  }
                />
                <span className="sign-placement-controls__value">
                  {placement.strokeWidth ?? 100}%
                </span>
              </label>
            </div>
          )
        })()}
      </section>

      <section className="organize-section">
        <div className="sign-toolbar">
          <div className="sign-toolbar__mode" role="group" aria-label="Placement tool">
            <Button
              type="button"
              variant={placementMode === 'draw' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setPlacementMode('draw')}
            >
              Draw
            </Button>
            <Button
              type="button"
              variant={placementMode === 'select' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setPlacementMode('select')}
            >
              Select
            </Button>
          </div>
          <div className="sign-toolbar__pages">
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
            <span className="sign-toolbar__label">
              Page {pageIndex + 1} of {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pageIndex >= pageCount - 1}
              onClick={() =>
                setPageIndex((index) => Math.min(pageCount - 1, index + 1))
              }
              aria-label="Next page"
            >
              <Icon name="chevron-right" size="sm" aria-hidden="true" />
            </Button>
          </div>
          <div className="sign-toolbar__zoom">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setScale((value) => Math.max(0.3, value * 0.8))}
              aria-label="Zoom out"
            >
              <Icon name="zoom-out" size="sm" aria-hidden="true" />
            </Button>
            <span className="sign-toolbar__label">{Math.round(scale * 100)}%</span>
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

        <div className="sign-stage__scroll" ref={stageRef}>
          {loading ? (
            <div className="organize-loading" role="status">
              <Spinner size="sm" label="" /> Reading pages…
            </div>
          ) : page && viewport ? (
            <PdfStage page={page} scale={scale}>
              <div
                className={`sign-stage__catcher${
                  placementMode === 'select' ? ' sign-stage__catcher--select' : ''
                }`}
                onPointerDown={handleOverlayPointerDown}
              />
              {placements
                .filter((placement) => placement.pageIndex === pageIndex)
                .map((placement) => {
                  const [centerCssX, centerCssY] = viewport.convertToViewportPoint(
                    placement.x + placement.width / 2,
                    placement.y + placement.height / 2,
                  )
                  const source = signatures.find(
                    (signature) => signature.id === placement.sourceId,
                  )
                  const selected = selectedId === placement.id
                  return (
                    <div
                      key={placement.id}
                      className={`sign-placement${selected ? ' sign-placement--selected' : ''}`}
                      style={{
                        left: centerCssX,
                        top: centerCssY,
                        width: placement.width * scale,
                        height: placement.height * scale,
                        transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)`,
                      }}
                      onPointerDown={(event) =>
                        handlePlacementPointerDown(event, placement)
                      }
                    >
                      {source ? (
                        <img
                          src={placement.displayUrl ?? source.dataUrl}
                          alt="Placed signature"
                          draggable={false}
                        />
                      ) : null}
                      {selected ? (
                        <>
                          <span className="sign-placement__rotate" onPointerDown={(event) => handleHandlePointerDown(event, placement, 'rotate')} />
                          {RESIZE_HANDLES.map((handle) => (
                            <span
                              key={handle}
                              className={`sign-placement__handle sign-placement__handle--${handle}`}
                              onPointerDown={(event) =>
                                handleHandlePointerDown(event, placement, handle)
                              }
                            />
                          ))}
                        </>
                      ) : null}
                    </div>
                  )
                })}
            </PdfStage>
          ) : (
            <div className="organize-loading" role="status">
              <Spinner size="sm" label="" /> Preparing page…
            </div>
          )}
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
            disabled={placements.length === 0 || processing}
            onClick={() => void handleApply()}
          >
            {processing ? <Spinner size="sm" label="Signing" /> : null}
            {processing ? 'Signing…' : 'Apply signatures'}
          </Button>
          {placements.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              disabled={processing}
              onClick={() => {
                setPlacements([])
                setSelectedId(null)
              }}
            >
              Clear all placements
            </Button>
          ) : null}
          <span className="organize-hint">
            {placementMode === 'select'
              ? 'Select mode — click a signature to move, resize, or delete it.'
              : `${placements.length} signature${placements.length === 1 ? '' : 's'} placed`}
          </span>
        </div>
      </section>
    </div>
  )
}