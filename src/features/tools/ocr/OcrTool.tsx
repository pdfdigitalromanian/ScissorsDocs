import { useEffect, useState } from 'react'
import { Icon } from '@/components/icons/Icon'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { usePdfDocument } from '../stage/usePdfDocument'
import UploadDrop from '../organize/components/UploadDrop'
import OrganizeResult from '../organize/components/OrganizeResult'
import type { OrganizeOutput, PdfPreview } from '../organize/lib'
import { loadPdfPreview, revokePreview } from '../organize/lib'
import {
  detectPagesToOcr,
  runOcr,
  OCR_LANGUAGES,
  type OcrPageInfo,
} from './ocr-lib'
import './ocr.css'

export default function OcrTool() {
  const { session, loading, error, load, clear } = usePdfDocument()
  const [preview, setPreview] = useState<PdfPreview | null>(null)
  const [pageInfos, setPageInfos] = useState<OcrPageInfo[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [dpi, setDpi] = useState(200)
  const [language, setLanguage] = useState('eng')
  const [processing, setProcessing] = useState(false)
  const [progressLabel, setProgressLabel] = useState('')
  const [workError, setWorkError] = useState('')
  const [outputs, setOutputs] = useState<OrganizeOutput[] | null>(null)

  useEffect(() => {
    setPreview((current) => {
      if (current) revokePreview(current)
      return null
    })
    setPageInfos([])
    setSelected(new Set())
    setOutputs(null)
    setWorkError('')
  }, [session])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    void (async () => {
      try {
        const info = await detectPagesToOcr(session.bytes)
        if (cancelled) return
        setPageInfos(info)
        setSelected(new Set(info.filter((page) => page.scanned).map((page) => page.index)))
        const loaded = await loadPdfPreview(session.file)
        if (!cancelled) setPreview(loaded)
      } catch {
        if (!cancelled) setWorkError('The pages could not be analysed for OCR.')
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  const scannedCount = pageInfos.filter((page) => page.scanned).length
  const selectedCount = selected.size
  const selectionSummary =
    selectedCount === 0
      ? 'No pages selected'
      : selectedCount === pageInfos.length
        ? 'All pages selected'
        : `${selectedCount} of ${pageInfos.length} pages selected`

  function togglePage(index: number) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function toggleAll() {
    setSelected(
      selected.size === pageInfos.length
        ? new Set()
        : new Set(pageInfos.map((page) => page.index)),
    )
  }

  function toggleScannedOnly() {
    setSelected(
      selected.size === scannedCount && scannedCount > 0
        ? new Set()
        : new Set(pageInfos.filter((page) => page.scanned).map((page) => page.index)),
    )
  }

  async function handleRun() {
    if (!session) return
    if (selectedCount === 0) {
      setWorkError('Select at least one page to run OCR on.')
      return
    }
    setProcessing(true)
    setProgressLabel('Preparing OCR engine…')
    setWorkError('')
    setOutputs(null)
    try {
      const indices = pageInfos
        .filter((page) => selected.has(page.index))
        .map((page) => page.index)
      const result = await runOcr(session.bytes, session.file.name, indices, {
        dpi,
        language,
      })
      const baseName = session.file.name.replace(/\.pdf$/i, '') || 'document'
      setOutputs([
        {
          filename: `${baseName}-ocr.pdf`,
          bytes: result.bytes,
          pages: result.pageCount,
        },
      ])
    } catch (reason) {
      setWorkError(
        reason instanceof Error
          ? `OCR could not be completed: ${reason.message}`
          : 'OCR could not be completed.',
      )
    } finally {
      setProcessing(false)
      setProgressLabel('')
    }
  }

  useEffect(
    () => () => {
      if (preview) revokePreview(preview)
    },
    [preview],
  )

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
            <p>
              Choose a scanned or image-based PDF to turn into searchable text.
            </p>
          </div>
          <UploadDrop
            title="Drag & drop a PDF here"
            subtitle="OCR runs entirely in your browser — the document never leaves your device."
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
    <div className="organize-workflow ocr-workflow">
      <section className="organize-section">
        <div className="organize-section__heading">
          <h2>Choose pages to OCR</h2>
          <p>
            Pages that already contain selectable text are marked{" "}
            <strong>text</strong>. Scanned pages are marked{" "}
            <strong>scan</strong> and are selected automatically.
          </p>
        </div>

        <div className="ocr-status" aria-live="polite">
          <span className="ocr-status__dot ocr-status__dot--ok" aria-hidden="true" />
          OCR engine ready — runs in your browser with Tesseract.js.
        </div>

        {loading || pageInfos.length === 0 ? (
          <div className="organize-loading" role="status">
            <Spinner size="sm" label="" /> Analysing pages…
          </div>
        ) : (
          <div className="ocr-pages">
            <div className="ocr-pages__actions">
              <Button type="button" variant="outline" size="sm" onClick={toggleAll}>
                {selected.size === pageInfos.length ? 'Clear selection' : 'Select all'}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={toggleScannedOnly}>
                {selected.size === scannedCount && scannedCount > 0
                  ? 'Clear scans'
                  : 'Select scans only'}
              </Button>
              <span className="ocr-pages__summary">{selectionSummary}</span>
            </div>
            <div className="ocr-pages__grid">
              {pageInfos.map((page) => (
                <button
                  key={page.index}
                  type="button"
                  className={`ocr-page${selected.has(page.index) ? ' ocr-page--selected' : ''}`}
                  onClick={() => togglePage(page.index)}
                  aria-pressed={selected.has(page.index)}
                  title={`Page ${page.index + 1} — ${page.scanned ? 'scan' : 'text'}`}
                >
                  {preview?.urls[page.index] ? (
                    <img
                      className="ocr-page__thumb"
                      src={preview.urls[page.index]}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <div className="ocr-page__thumb ocr-page__thumb--empty" />
                  )}
                  <span className="ocr-page__meta">
                    <span className="ocr-page__number">{page.index + 1}</span>
                    <span
                      className={`ocr-page__badge${
                        page.scanned ? ' ocr-page__badge--scan' : ' ocr-page__badge--text'
                      }`}
                    >
                      {page.scanned ? 'scan' : 'text'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="ocr-options">
          <label className="ocr-options__field">
            <span>Scan resolution (DPI)</span>
            <input
              type="number"
              min={100}
              max={400}
              step={10}
              value={dpi}
              onChange={(event) => setDpi(Number(event.target.value))}
            />
            <small>Higher is sharper but slower.</small>
          </label>
          <label className="ocr-options__field">
            <span>OCR language</span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              {OCR_LANGUAGES.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
            <small>The first run downloads that language pack from the CDN.</small>
          </label>
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
            disabled={selectedCount === 0 || processing}
            onClick={() => void handleRun()}
          >
            {processing ? <Spinner size="sm" label="Running OCR" /> : null}
            {processing ? 'Running OCR…' : 'Run OCR'}
          </Button>
          <span className="organize-hint" role="status">
            {processing
              ? progressLabel || 'Recognizing text on the selected pages…'
              : 'OCR makes scanned text searchable and selectable.'}
          </span>
        </div>
      </section>
    </div>
  )
}