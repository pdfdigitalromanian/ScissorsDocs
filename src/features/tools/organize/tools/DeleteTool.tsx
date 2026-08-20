import { useEffect, useState } from 'react'
import { Icon } from '@/components/icons/Icon'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { deletePages, loadPdf, serializePdf } from '@/features/editor/engine'
import PagePicker from '../components/PagePicker'
import UploadDrop from '../components/UploadDrop'
import OrganizeResult from '../components/OrganizeResult'
import { useSinglePdf } from '../hooks/useSinglePdf'
import type { OrganizeOutput } from '../lib'
import { readPdfBytes, validatePdfOutput } from '../lib'

/**
 * DeleteTool — remove unwanted pages from a copy of the PDF. The original
 * file stays untouched and the result always keeps at least one page.
 */
export default function DeleteTool() {
  const { file, preview, loading, loadError, select, clear } = useSinglePdf()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [outputs, setOutputs] = useState<OrganizeOutput[] | null>(null)

  useEffect(() => {
    setSelected(new Set())
    setOutputs(null)
    setError('')
  }, [file])

  const pageCount = preview?.pageCount ?? 0
  const remaining = pageCount - selected.size
  const cannotDelete = selected.size === 0 || remaining < 1

  async function handleDelete() {
    if (!file || !preview || cannotDelete) return
    setProcessing(true)
    setError('')
    setOutputs(null)
    try {
      const bytes = await readPdfBytes(file)
      const doc = await loadPdf(bytes)
      deletePages(doc, [...selected].sort((a, b) => a - b))
      const removedBytes = await serializePdf(doc)
      const pages = await validatePdfOutput(removedBytes, remaining)
      setOutputs([{ filename: 'pages-removed.pdf', bytes: removedBytes, pages }])
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The pages could not be removed.',
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
          <p>Choose the document you want to remove pages from.</p>
        </div>
        <UploadDrop
          title="Drag & drop a PDF here"
          subtitle="A new copy is created — your original is untouched."
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
            <h2>Select pages to remove</h2>
            <p>
              {remaining} page{remaining === 1 ? '' : 's'} will remain in the
              new document.
            </p>
          </div>
          <PagePicker
            preview={preview}
            selected={selected}
            onSelectedChange={setSelected}
          />
          {cannotDelete && selected.size > 0 ? (
            <div className="organize-error" role="alert">
              <Icon name="alert-circle" size="sm" aria-hidden="true" />
              Keep at least one page — an empty PDF cannot be created.
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
          disabled={!preview || cannotDelete || processing}
          onClick={() => void handleDelete()}
        >
          {processing ? <Spinner size="sm" label="Removing" /> : null}
          {processing
            ? 'Removing…'
            : `Delete ${selected.size || 0} page${selected.size === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  )
}