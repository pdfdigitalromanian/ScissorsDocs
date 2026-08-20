import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/icons/Icon'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { ingestFiles } from '@/features/documents'
import { useNavigate } from 'react-router-dom'
import { loadPdfDocument, type LoadedPdf } from '../local/lib/pdf'
import { looksLikePdf } from '@/features/editor/engine'
import { downloadBytes } from '../organize/lib'
import {
  buildCompareReport,
  comparePdfBytes,
  CompareCancelledError,
  type CompareResult,
  type CompareStatus,
  type PageCompare,
} from './compare-lib'
import './compare.css'

const STATUS_LABEL: Record<CompareStatus, string> = {
  identical: 'Unchanged',
  changed: 'Changed',
  added: 'Added',
  removed: 'Removed',
  moved: 'Moved',
}

function statusClass(status: CompareStatus): string {
  return `compare-page--${status}`
}

interface LoadedFile {
  file: File
  bytes: Uint8Array
  doc: LoadedPdf | null
}

async function openLoadedFile(file: File): Promise<LoadedFile> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!looksLikePdf(bytes)) {
    throw new Error(`“${file.name}” is not a valid PDF file.`)
  }
  const doc = await loadPdfDocument(bytes)
  return { file, bytes, doc }
}

function destroyLoaded(value: LoadedFile | null) {
  if (value?.doc) void value.doc.destroy()
}

/** Renders one side of a comparison (or the overlaid diff) at display width. */
function PageCanvas({
  doc,
  pageIndex,
  compare,
  mode,
  width,
}: {
  doc: LoadedPdf | null
  pageIndex: number | null
  compare: PageCompare
  mode: 'side' | 'overlay'
  width: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rendered, setRendered] = useState(false)

  useEffect(() => {
    let active = true
    setRendered(false)
    const canvas = canvasRef.current
    if (!canvas || !doc || pageIndex === null) return
    void (async () => {
      try {
        const page = await doc.document.getPage(pageIndex + 1)
        const viewport = page.getViewport({ scale: 1 })
        const scale = width / viewport.width
        canvas.width = Math.floor(viewport.width * scale)
        canvas.height = Math.floor(viewport.height * scale)
        const context = canvas.getContext('2d')
        if (!context) return
        await page.render({ canvas, viewport }).promise
        if (active) setRendered(true)
      } catch {
        if (active) setRendered(false)
      }
    })()
    return () => {
      active = false
    }
  }, [doc, pageIndex, width])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !rendered) return
    const context = canvas.getContext('2d')
    if (!context) return
    if (mode !== 'overlay' || !compare.mask || compare.aIndex === pageIndex) {
      return
    }
    const overlayCanvas = document.createElement('canvas')
    overlayCanvas.width = compare.maskWidth
    overlayCanvas.height = compare.maskHeight
    const overlayContext = overlayCanvas.getContext('2d')
    if (!overlayContext) return
    const image = overlayContext.createImageData(
      compare.maskWidth,
      compare.maskHeight,
    )
    const data = image.data
    for (let index = 0; index < compare.mask.length; index += 1) {
      if (!compare.mask[index]) continue
      const pixel = index * 4
      if (compare.directional?.[index]) {
        data[pixel] = 239
        data[pixel + 1] = 68
        data[pixel + 2] = 68
      } else {
        data[pixel] = 22
        data[pixel + 1] = 163
        data[pixel + 2] = 74
      }
      data[pixel + 3] = 150
    }
    overlayContext.putImageData(image, 0, 0)
    context.drawImage(overlayCanvas, 0, 0, canvas.width, canvas.height)
  }, [canvasRef, rendered, mode, compare, pageIndex])

  if (!doc || pageIndex === null) {
    return (
      <div className="compare-canvas compare-canvas--empty">No page</div>
    )
  }

  return (
    <div className="compare-canvas">
      <canvas
        ref={canvasRef}
        className="compare-canvas__image"
        style={{ maxWidth: '100%', height: 'auto' }}
      />
      {rendered ? null : (
        <div className="compare-canvas__loading">
          <Spinner size="sm" label="Rendering page" />
        </div>
      )}
    </div>
  )
}

export default function CompareTool() {
  const navigate = useNavigate()
  const [fileA, setFileA] = useState<LoadedFile | null>(null)
  const [fileB, setFileB] = useState<LoadedFile | null>(null)
  const [loadingA, setLoadingA] = useState(false)
  const [loadingB, setLoadingB] = useState(false)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<CompareResult | null>(null)
  const [selected, setSelected] = useState(0)
  const [mode, setMode] = useState<'side' | 'overlay'>('side')
  const [opening, setOpening] = useState(false)
  const cancelledRef = useRef(false)
  const fileARef = useRef<LoadedFile | null>(null)
  const fileBRef = useRef<LoadedFile | null>(null)
  fileARef.current = fileA
  fileBRef.current = fileB

  useEffect(
    () => () => {
      destroyLoaded(fileARef.current)
      destroyLoaded(fileBRef.current)
    },
    [],
  )

  async function handleFile(side: 'a' | 'b', file: File) {
    const setter = side === 'a' ? setFileA : setFileB
    const loader = side === 'a' ? setLoadingA : setLoadingB
    setError('')
    setResult(null)
    loader(true)
    try {
      const loaded = await openLoadedFile(file)
      if (side === 'a') destroyLoaded(fileA)
      else destroyLoaded(fileB)
      setter(loaded)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The document could not be read.',
      )
    } finally {
      loader(false)
    }
  }

  async function handleCompare() {
    if (!fileA || !fileB) {
      setError('Upload both documents before comparing.')
      return
    }
    setError('')
    setRunning(true)
    setProgress('')
    cancelledRef.current = false
    setResult(null)
    setSelected(0)
    try {
      const comparison = await comparePdfBytes(
        fileA.bytes,
        fileB.bytes,
        fileA.file.name,
        fileB.file.name,
        {
          cancelled: () => cancelledRef.current,
          onProgress: (message) => setProgress(message),
        },
      )
      setResult(comparison)
    } catch (reason) {
      if (reason instanceof CompareCancelledError) {
        setError('Comparison cancelled.')
      } else {
        setError(
          reason instanceof Error
            ? reason.message
            : 'The documents could not be compared.',
        )
      }
    } finally {
      setRunning(false)
    }
  }

  const differenceIndexes =
    result?.pages
      .map((page, index) => ({ page, index }))
      .filter(({ page }) => page.status !== 'identical')
      .map(({ index }) => index) ?? []

  function goToDifference(direction: 1 | -1) {
    if (differenceIndexes.length === 0) return
    const current = selected
    const position = differenceIndexes.indexOf(current)
    if (direction === 1) {
      setSelected(differenceIndexes[(position + 1) % differenceIndexes.length])
    } else {
      setSelected(
        differenceIndexes[
          (position - 1 + differenceIndexes.length) % differenceIndexes.length
        ],
      )
    }
  }

  async function handleReport() {
    if (!result) return
    try {
      const bytes = await buildCompareReport(result)
      downloadBytes(bytes, 'comparison-report.pdf')
    } catch {
      setError('The comparison report could not be generated.')
    }
  }

  async function handleOpenInWorkspace() {
    if (!fileA || !fileB) return
    setOpening(true)
    try {
      const results = await ingestFiles([fileA.file, fileB.file])
      const ids = results
        .map((item) => item.document?.id)
        .filter((id): id is string => Boolean(id))
      if (ids.length === 0) {
        throw new Error('The documents could not be opened in the workspace.')
      }
      navigate(`/workspace?docs=${encodeURIComponent(ids.join(','))}`)
    } catch {
      setOpening(false)
    }
  }

  function startAnother() {
    destroyLoaded(fileA)
    destroyLoaded(fileB)
    setFileA(null)
    setFileB(null)
    setResult(null)
    setError('')
    setProgress('')
    setRunning(false)
    setSelected(0)
  }

  const uploadSection = (side: 'a' | 'b') => {
    const loaded = side === 'a' ? fileA : fileB
    const loading = side === 'a' ? loadingA : loadingB
    const label = side === 'a' ? 'Original / Version A' : 'Modified / Version B'
    return (
      <div className="compare-upload">
        <p className="compare-upload__label">{label}</p>
        {loaded ? (
          <div className="compare-upload__loaded">
            <Icon name="file-text" aria-hidden="true" />
            <span className="compare-upload__name">{loaded.file.name}</span>
            <span className="compare-upload__meta">
              {loaded.doc?.document.numPages ?? 0} pages
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = '.pdf,application/pdf'
                input.onchange = () => {
                  const picked = input.files?.[0]
                  if (picked) void handleFile(side, picked)
                }
                input.click()
              }}
            >
              Replace
            </Button>
          </div>
        ) : (
          <div className="compare-upload__drop">
            {loading ? (
              <Spinner size="sm" label="Reading PDF" />
            ) : (
              <button
                type="button"
                className="compare-upload__browse"
                onClick={() => {
                  const input = document.createElement('input')
                  input.type = 'file'
                  input.accept = '.pdf,application/pdf'
                  input.onchange = () => {
                    const picked = input.files?.[0]
                    if (picked) void handleFile(side, picked)
                  }
                  input.click()
                }}
              >
                <Icon name="upload" size="md" aria-hidden="true" />
                <span>Upload {side === 'a' ? 'Version A' : 'Version B'}</span>
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  if (result) {
    const current = result.pages[selected]
    const diffCount = differenceIndexes.length
    return (
      <div className="compare-review page-enter">
        <div className="compare-review__header">
          <div>
            <h2>Comparison review</h2>
            <p>
              {result.aName} vs {result.bName}
            </p>
          </div>
          <div className="compare-review__actions">
            <Button type="button" variant="outline" size="sm" onClick={() => void handleReport()}>
              <Icon name="download" size="sm" aria-hidden="true" />
              Report
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={opening} onClick={() => void handleOpenInWorkspace()}>
              <Icon name="workspace" size="sm" aria-hidden="true" />
              {opening ? 'Opening…' : 'Open in workspace'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={startAnother}>
              Start over
            </Button>
          </div>
        </div>

        <div className="compare-summary">
          <span className="compare-summary__item">
            <strong>{result.summary.identical}</strong> unchanged
          </span>
          <span className="compare-summary__item">
            <strong>{result.summary.changed}</strong> changed
          </span>
          <span className="compare-summary__item">
            <strong>{result.summary.moved}</strong> moved
          </span>
          <span className="compare-summary__item compare-summary__item--added">
            <strong>{result.summary.added}</strong> added
          </span>
          <span className="compare-summary__item compare-summary__item--removed">
            <strong>{result.summary.removed}</strong> removed
          </span>
        </div>

        <div className="compare-toolbar">
          <div className="compare-toolbar__mode" role="group" aria-label="View mode">
            <button
              type="button"
              className={mode === 'side' ? 'is-active' : ''}
              onClick={() => setMode('side')}
            >
              Side by side
            </button>
            <button
              type="button"
              className={mode === 'overlay' ? 'is-active' : ''}
              onClick={() => setMode('overlay')}
            >
              Difference view
            </button>
          </div>
          <div className="compare-toolbar__nav">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => goToDifference(-1)}
            >
              <Icon name="chevron-left" size="sm" aria-hidden="true" />
              Prev diff
            </Button>
            <span className="compare-toolbar__position">
              Page {selected + 1} of {result.pages.length} ·{' '}
              {diffCount === 0 ? 'no differences' : `${diffCount} diff${diffCount === 1 ? '' : 's'}`}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => goToDifference(1)}
            >
              Next diff
              <Icon name="chevron-right" size="sm" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="compare-stage">
          {mode === 'side' ? (
            <div className="compare-stage__side">
              <div className="compare-stage__column">
                <div className="compare-stage__caption">
                  <strong>Version A</strong>
                  <span>
                    Page {current.aIndex === null ? '—' : current.aIndex + 1}
                  </span>
                </div>
                <PageCanvas
                  doc={fileA?.doc ?? null}
                  pageIndex={current.aIndex}
                  compare={current}
                  mode={mode}
                  width={620}
                />
              </div>
              <div className="compare-stage__column">
                <div className="compare-stage__caption">
                  <strong>Version B</strong>
                  <span>
                    Page {current.bIndex === null ? '—' : current.bIndex + 1}
                  </span>
                </div>
                <PageCanvas
                  doc={fileB?.doc ?? null}
                  pageIndex={current.bIndex}
                  compare={current}
                  mode={mode}
                  width={620}
                />
              </div>
            </div>
          ) : current.status === 'identical' ? (
            <div className="compare-stage__overlay">
              <div className="compare-stage__caption">
                <strong>Version B</strong>
                <span>Page {current.bIndex === null ? '—' : current.bIndex + 1}</span>
              </div>
              <PageCanvas
                doc={fileB?.doc ?? null}
                pageIndex={current.bIndex}
                compare={current}
                mode="side"
                width={860}
              />
              <p className="compare-stage__note">No differences on this page.</p>
            </div>
          ) : (
            <div className="compare-stage__overlay">
              <div className="compare-stage__caption">
                <strong>Version B with differences</strong>
                <span>Page {current.bIndex === null ? '—' : current.bIndex + 1}</span>
              </div>
              <PageCanvas
                doc={fileB?.doc ?? null}
                pageIndex={current.bIndex}
                compare={current}
                mode="overlay"
                width={860}
              />
              <div className="compare-legend" aria-hidden="true">
                <span className="compare-legend__added">Added in B</span>
                <span className="compare-legend__removed">Removed from A</span>
              </div>
            </div>
          )}
        </div>

        {current.text && current.status !== 'identical' ? (
          <div className="compare-text">
            <h3>Text changes on this page</h3>
            {current.text.added.length === 0 && current.text.removed.length === 0 ? (
              <p className="compare-text__none">
                No text-level changes — the difference is visual only.
              </p>
            ) : (
              <div className="compare-text__grid">
                <div className="compare-text__added">
                  <h4>Added</h4>
                  <p>{current.text.added.join(' ')}</p>
                </div>
                <div className="compare-text__removed">
                  <h4>Removed</h4>
                  <p>{current.text.removed.join(' ')}</p>
                </div>
              </div>
            )}
            {current.text.truncated ? (
              <p className="compare-text__note">
                Long page — shown as a word summary.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="compare-pages">
          <h3>Pages</h3>
          <div className="compare-pages__grid">
            {result.pages.map((page, index) => (
              <button
                key={index}
                type="button"
                className={`compare-page ${statusClass(page.status)}${index === selected ? ' is-active' : ''}`}
                onClick={() => setSelected(index)}
                title={`Page ${index + 1}: ${STATUS_LABEL[page.status]}`}
              >
                <span className="compare-page__number">{index + 1}</span>
                <span className="compare-page__status">{STATUS_LABEL[page.status]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="organize-workflow compare-workflow">
      <section className="organize-section">
        <div className="organize-section__heading">
          <h2>Compare two PDFs</h2>
          <p>
            Upload the original and the modified version. Comparison runs
            entirely in your browser — nothing is uploaded.
          </p>
        </div>

        <div className="compare-uploads">
          {uploadSection('a')}
          <span className="compare-uploads__vs">vs</span>
          {uploadSection('b')}
        </div>

        {error ? (
          <div className="organize-error" role="alert">
            <Icon name="alert-circle" size="sm" aria-hidden="true" />
            {error}
          </div>
        ) : null}

        <div className="organize-actions">
          <Button
            size="lg"
            disabled={!fileA || !fileB || running}
            onClick={() => void handleCompare()}
          >
            {running ? <Spinner size="sm" label="Comparing" /> : null}
            {running ? 'Comparing…' : 'Compare'}
          </Button>
          {running ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                cancelledRef.current = true
              }}
            >
              Cancel
            </Button>
          ) : null}
          <span className="organize-hint" role="status">
            {running ? progress : 'Detects added, removed, moved and changed pages.'}
          </span>
        </div>
      </section>
    </div>
  )
}