import { useEffect, useState } from 'react'
import { Icon } from '@/components/icons/Icon'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { extractPdf } from '@/features/editor/engine'
import PagePicker from '../components/PagePicker'
import UploadDrop from '../components/UploadDrop'
import OrganizeResult from '../components/OrganizeResult'
import { useSinglePdf } from '../hooks/useSinglePdf'
import type { OrganizeOutput } from '../lib'
import { readPdfBytes, validatePdfOutput } from '../lib'

/**
 * ExtractTool — pull selected pages out of a PDF into a new document.
 * The original is never modified.
 */
export default function ExtractTool() {
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

  const canRun = preview && selected.size > 0 && !processing

  async function handleExtract() {
    if (!file || !preview || selected.size === 0) return
    setProcessing(true)
    setError('')
    setOutputs(null)
    try {
      const bytes = await readPdfBytes(file)
      const indices = [...selected].sort((a, b) => a - b)
      const extracted = await extractPdf(bytes, indices)
      const pages = await validatePdfOutput(extracted, indices.length)
      setOutputs([
        { filename: 'extracted-pages.pdf', bytes: extracted, pages },
      ])
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The pages could not be extracted.',
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
          <p>Choose the document you want to extract pages from.</p>
        </div>
        <UploadDrop
          title="Drag & drop a PDF here"
          subtitle="The original file is never changed."
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
            <h2>Select pages</h2>
            <p>
              Choose the pages to keep in the new document ({file?.name}).
            </p>
          </div>
          <PagePicker
            preview={preview}
            selected={selected}
            onSelectedChange={setSelected}
          />
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
          disabled={!canRun}
          onClick={() => void handleExtract()}
        >
          {processing ? <Spinner size="sm" label="Extracting" /> : null}
          {processing
            ? 'Extracting…'
            : `Extract ${selected.size || 0} page${selected.size === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  )
}