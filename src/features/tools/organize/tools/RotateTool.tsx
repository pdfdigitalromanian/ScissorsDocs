import { useEffect, useState } from 'react'
import { Icon } from '@/components/icons/Icon'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { loadPdf, rotatePages, serializePdf } from '@/features/editor/engine'
import PagePicker from '../components/PagePicker'
import UploadDrop from '../components/UploadDrop'
import OrganizeResult from '../components/OrganizeResult'
import { useSinglePdf } from '../hooks/useSinglePdf'
import type { OrganizeOutput } from '../lib'
import { readPdfBytes, validatePdfOutput } from '../lib'

type RotationChoice = 'cw' | 'ccw' | 'flip'

const ROTATION_OPTIONS: Array<{ value: RotationChoice; label: string }> = [
  { value: 'cw', label: '90° clockwise' },
  { value: 'ccw', label: '90° counter-clockwise' },
  { value: 'flip', label: '180°' },
]

/**
 * RotateTool — rotate selected pages of a PDF by a quarter or half turn.
 * The rotation is written into the output PDF's page, not just the preview.
 */
export default function RotateTool() {
  const { file, preview, loading, loadError, select, clear } = useSinglePdf()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [choice, setChoice] = useState<RotationChoice>('cw')
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [outputs, setOutputs] = useState<OrganizeOutput[] | null>(null)

  useEffect(() => {
    setOutputs(null)
    setError('')
    if (preview) {
      setSelected(new Set(preview.urls.map((_, index) => index)))
    } else {
      setSelected(new Set())
    }
  }, [preview, file])

  const canRun = preview && selected.size > 0 && !processing

  async function handleRotate() {
    if (!file || !preview || selected.size === 0) return
    setProcessing(true)
    setError('')
    setOutputs(null)
    try {
      const bytes = await readPdfBytes(file)
      const doc = await loadPdf(bytes)
      const indices = [...selected].sort((a, b) => a - b)
      if (choice === 'flip') {
        rotatePages(doc, indices, 'clockwise')
        rotatePages(doc, indices, 'clockwise')
      } else {
        rotatePages(doc, indices, choice === 'cw' ? 'clockwise' : 'counter-clockwise')
      }
      const rotatedBytes = await serializePdf(doc)
      const pages = await validatePdfOutput(rotatedBytes, preview.pageCount)
      setOutputs([{ filename: 'rotated.pdf', bytes: rotatedBytes, pages }])
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The pages could not be rotated.',
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
          <p>Choose the document whose pages you want to rotate.</p>
        </div>
        <UploadDrop
          title="Drag & drop a PDF here"
          subtitle="The rotation is baked into the output PDF."
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
        <>
          <section className="organize-section">
            <div className="organize-section__heading">
              <h2>Rotation</h2>
              <p>Choose how the selected pages should turn.</p>
            </div>
            <div className="organize-modes">
              {ROTATION_OPTIONS.map((option) => (
                <label key={option.value} className="organize-choice">
                  <input
                    type="radio"
                    name="organize-rotation"
                    checked={choice === option.value}
                    onChange={() => setChoice(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </section>
          <section className="organize-section">
            <div className="organize-section__heading">
              <h2>Select pages</h2>
              <p>All pages are selected by default.</p>
            </div>
            <PagePicker
              preview={preview}
              selected={selected}
              onSelectedChange={setSelected}
            />
          </section>
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
          disabled={!canRun}
          onClick={() => void handleRotate()}
        >
          {processing ? <Spinner size="sm" label="Rotating" /> : null}
          {processing
            ? 'Rotating…'
            : `Rotate ${selected.size || 0} page${selected.size === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  )
}