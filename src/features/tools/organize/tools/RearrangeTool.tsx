import { useEffect, useState } from 'react'
import { Icon } from '@/components/icons/Icon'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { extractPdf } from '@/features/editor/engine'
import UploadDrop from '../components/UploadDrop'
import OrganizeResult from '../components/OrganizeResult'
import { useSinglePdf } from '../hooks/useSinglePdf'
import type { OrganizeOutput } from '../lib'
import { readPdfBytes, validatePdfOutput } from '../lib'

function parseOrder(text: string, pageCount: number): number[] | null {
  const tokens = text.split(',').map((token) => token.trim()).filter(Boolean)
  if (tokens.length !== pageCount) return null
  const seen = new Set<number>()
  const indices: number[] = []
  for (const token of tokens) {
    if (!/^\d+$/.test(token)) return null
    const page = Number(token)
    if (page < 1 || page > pageCount || seen.has(page)) return null
    seen.add(page)
    indices.push(page - 1)
  }
  return indices
}

/**
 * RearrangeTool — reorder a PDF's pages by typing the new page order
 * (e.g. "3, 1, 2"). Each page appears exactly once in the result.
 */
export default function RearrangeTool() {
  const { file, preview, loading, loadError, select, clear } = useSinglePdf()
  const [orderText, setOrderText] = useState('')
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [outputs, setOutputs] = useState<OrganizeOutput[] | null>(null)

  useEffect(() => {
    setOutputs(null)
    setError('')
    if (preview) {
      setOrderText(
        Array.from({ length: preview.pageCount }, (_, index) => index + 1).join(', '),
      )
    } else {
      setOrderText('')
    }
  }, [preview, file])

  const pageCount = preview?.pageCount ?? 0
  const order = parseOrder(orderText, pageCount)

  async function handleRearrange() {
    if (!file || !preview || !order) return
    setProcessing(true)
    setError('')
    setOutputs(null)
    try {
      const bytes = await readPdfBytes(file)
      const rearranged = await extractPdf(bytes, order)
      const pages = await validatePdfOutput(rearranged, pageCount)
      setOutputs([{ filename: 'rearranged.pdf', bytes: rearranged, pages }])
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The pages could not be rearranged.',
      )
    } finally {
      setProcessing(false)
    }
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

  return (
    <div className="organize-workflow">
      <section className="organize-section">
        <div className="organize-section__heading">
          <h2>Upload PDF</h2>
          <p>Choose the document whose pages you want to reorder.</p>
        </div>
        <UploadDrop
          title="Drag & drop a PDF here"
          subtitle="Your original file is never changed."
          accept=".pdf,application/pdf"
          onFiles={select}
        />
      </section>

      {loadError ? (
        <div className="organize-error" role="alert">
          <Icon name="alert-circle" size="sm" aria-hidden="true" />
          {loadError}
        </div>
      ) : null}

      {file && loading ? (
        <div className="organize-loading" role="status">
          <Spinner size="sm" label="" /> Reading pages…
        </div>
      ) : null}

      {preview ? (
        <section className="organize-section">
          <div className="organize-section__heading">
            <h2>New page order</h2>
            <p>
              Type every page number exactly once, in the order it should
              appear in the result.
            </p>
          </div>
          <div className="organize-field">
            <label className="field__label" htmlFor="organize-order">
              New order
            </label>
            <input
              id="organize-order"
              className="input"
              placeholder="3, 1, 2"
              value={orderText}
              onChange={(event) => {
                setOrderText(event.target.value)
                setError('')
              }}
            />
            {order === null ? (
              <span className="field__error" role="alert">
                Enter all {pageCount} page number{pageCount === 1 ? '' : 's'} once
                each — e.g. {Array.from({ length: pageCount }, (_, i) => i + 1).join(', ')}.
              </span>
            ) : null}
          </div>
          <div className="organize-actions organize-actions--inline">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setOrderText(
                  [...orderText.split(',').map((token) => token.trim()).filter(Boolean)]
                    .reverse()
                    .join(', '),
                )
              }
            >
              Reverse order
            </Button>
          </div>
          {preview.urls.length > 0 ? (
            <div className="organize-picker__grid organize-picker__grid--small">
              {preview.urls.map((url, index) => (
                <figure key={index} className="organize-page">
                  <img src={url} alt={`Preview of page ${index + 1}`} />
                  <figcaption className="organize-page__badge">
                    {index + 1}
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : null}
        </section>
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
          disabled={!preview || order === null || processing}
          onClick={() => void handleRearrange()}
        >
          {processing ? <Spinner size="sm" label="Rearranging" /> : null}
          {processing ? 'Rearranging…' : 'Rearrange pages'}
        </Button>
      </div>
    </div>
  )
}