import { useEffect, useState } from 'react'
import { Icon } from '@/components/icons/Icon'
import Button from '@/components/ui/Button'
import Radio from '@/components/ui/Radio'
import Spinner from '@/components/ui/Spinner'
import Textarea from '@/components/ui/Textarea'
import { normalizeSplitRanges, splitPdf } from '@/features/editor/engine'
import type { PageRange } from '@/features/editor/model'
import UploadDrop from '../components/UploadDrop'
import OrganizeResult from '../components/OrganizeResult'
import type { OrganizeOutput, PdfPreview } from '../lib'
import {
  loadPdfPreview,
  readPdfBytes,
  revokePreview,
  validatePdfOutput,
} from '../lib'

type SplitMode = 'every' | 'groups' | 'ranges'

function parseSplitRanges(text: string): PageRange[] | null {
  const tokens = text.split(',').map((token) => token.trim()).filter(Boolean)
  if (tokens.length === 0) return null
  const ranges: PageRange[] = []
  for (const token of tokens) {
    const match = /^(\d+)\s*-\s*(\d+)$/.exec(token)
    if (match) {
      ranges.push({ start: Number(match[1]), end: Number(match[2]) })
    } else if (/^\d+$/.test(token)) {
      const page = Number(token)
      ranges.push({ start: page, end: page })
    } else {
      return null
    }
  }
  return ranges
}

/**
 * SplitTool — split one PDF into separate PDFs by every page, equal page
 * groups, or custom ranges. The expected output is previewed first.
 */
export default function SplitTool() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PdfPreview | null>(null)
  const [mode, setMode] = useState<SplitMode>('every')
  const [groupSize, setGroupSize] = useState('5')
  const [rangeText, setRangeText] = useState('')
  const [rangeError, setRangeError] = useState('')
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [outputs, setOutputs] = useState<OrganizeOutput[] | null>(null)

  useEffect(() => {
    if (!file) {
      setPreview(null)
      setOutputs(null)
      return
    }
    let cancelled = false
    setOutputs(null)
    void loadPdfPreview(file, true).then((loaded) => {
      if (!cancelled) setPreview(loaded)
    })
    return () => {
      cancelled = true
      setPreview((current) => {
        if (current) revokePreview(current)
        return null
      })
    }
  }, [file])

  const pageCount = preview?.pageCount ?? 0

  const computedRanges: Array<{ start: number; end: number }> = (() => {
    if (pageCount <= 0) return []
    if (mode === 'every') {
      return normalizeSplitRanges('every', undefined, pageCount)
    }
    if (mode === 'groups') {
      const size = Math.max(1, Math.min(Number(groupSize) || 1, pageCount))
      const ranges: PageRange[] = []
      for (let start = 1; start <= pageCount; start += size) {
        ranges.push({ start, end: Math.min(pageCount, start + size - 1) })
      }
      return normalizeSplitRanges('ranges', ranges, pageCount)
    }
    const parsed = parseSplitRanges(rangeText)
    if (!parsed) return []
    return normalizeSplitRanges('ranges', parsed, pageCount)
  })()

  const rangesValid =
    mode === 'ranges' ? parseSplitRanges(rangeText) !== null : true

  function handleFile(next: File[]) {
    setFile(next[0] ?? null)
  }

  function handleSplit() {
    if (!file || pageCount <= 0 || !rangesValid || computedRanges.length === 0) {
      return
    }
    setProcessing(true)
    setError('')
    setOutputs(null)
    void (async () => {
      try {
        const bytes = await readPdfBytes(file)
        const parts = await splitPdf(bytes, computedRanges)
        const outputs: OrganizeOutput[] = []
        for (let index = 0; index < parts.length; index += 1) {
          const expected = computedRanges[index].end - computedRanges[index].start + 1
          const pages = await validatePdfOutput(parts[index], expected)
          outputs.push({
            filename: `split-${index + 1}.pdf`,
            bytes: parts[index],
            pages,
          })
        }
        setOutputs(outputs)
      } catch (reason) {
        setError(
          reason instanceof Error ? reason.message : 'The PDF could not be split.',
        )
      } finally {
        setProcessing(false)
      }
    })()
  }

  if (outputs) {
    return (
      <OrganizeResult
        outputs={outputs}
        zipName="split-parts.zip"
        onStartAnother={() => {
          setOutputs(null)
          setFile(null)
        }}
      />
    )
  }

  return (
    <div className="organize-workflow">
      <section className="organize-section">
        <div className="organize-section__heading">
          <h2>Upload PDF</h2>
          <p>Choose the document you want to split into separate files.</p>
        </div>
        <UploadDrop
          title="Drag & drop a PDF here"
          subtitle="Everything runs locally in your browser."
          accept=".pdf,application/pdf"
          onFiles={handleFile}
        />
      </section>

      {file && pageCount > 0 ? (
        <>
          <section className="organize-section">
            <div className="organize-section__heading">
              <h2>How to split</h2>
              <p>
                {file.name} has {pageCount} page{pageCount === 1 ? '' : 's'}.
              </p>
            </div>
            <div className="organize-modes">
              <Radio
                name="organize-split-mode"
                label="Every page"
                checked={mode === 'every'}
                onChange={() => setMode('every')}
              />
              <Radio
                name="organize-split-mode"
                label="Equal page groups"
                checked={mode === 'groups'}
                onChange={() => setMode('groups')}
              />
              <Radio
                name="organize-split-mode"
                label="Custom ranges"
                checked={mode === 'ranges'}
                onChange={() => setMode('ranges')}
              />
            </div>
            {mode === 'groups' ? (
              <div className="organize-field">
                <label className="field__label" htmlFor="organize-group-size">
                  Pages per part
                </label>
                <input
                  id="organize-group-size"
                  className="input"
                  type="number"
                  min={1}
                  max={pageCount}
                  value={groupSize}
                  onChange={(event) => setGroupSize(event.target.value)}
                />
              </div>
            ) : null}
            {mode === 'ranges' ? (
              <Textarea
                label="Ranges"
                rows={3}
                placeholder="1-5, 6-10, 11-15"
                value={rangeText}
                error={rangeError || undefined}
                onChange={(event) => {
                  setRangeText(event.target.value)
                  setRangeError('')
                }}
              />
            ) : null}
          </section>

          {computedRanges.length > 0 && rangesValid ? (
            <section className="organize-section">
              <div className="organize-section__heading">
                <h2>Expected output</h2>
                <p>
                  {computedRanges.length} PDF
                  {computedRanges.length === 1 ? '' : 's'} will be created.
                </p>
              </div>
              <ol className="organize-ranges">
                {computedRanges.map((range, index) => {
                  const count = range.end - range.start + 1
                  return (
                    <li key={index}>
                      <strong>
                        split-{index + 1}.pdf
                      </strong>
                      <span>
                        Pages {range.start}–{range.end} · {count} page
                        {count === 1 ? '' : 's'}
                      </span>
                    </li>
                  )
                })}
              </ol>
            </section>
          ) : null}

          {mode === 'ranges' && !rangesValid ? (
            <div className="organize-error" role="alert">
              <Icon name="alert-circle" size="sm" aria-hidden="true" />
              Enter ranges like 1-5, 6-10, 11-15.
            </div>
          ) : null}
        </>
      ) : null}

      {error ? (
        <div className="organize-error" role="alert">
          <Icon name="alert-circle" size="sm" aria-hidden="true" />
          {error}
        </div>
      ) : null}

      <div className="organize-actions">
        <Button
          size="lg"
          disabled={
            !file ||
            pageCount <= 0 ||
            !rangesValid ||
            computedRanges.length === 0 ||
            processing
          }
          onClick={handleSplit}
        >
          {processing ? <Spinner size="sm" label="Splitting" /> : null}
          {processing ? 'Splitting…' : `Split into ${computedRanges.length || 0} PDF${computedRanges.length === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  )
}