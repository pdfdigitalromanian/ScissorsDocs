import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/icons/Icon'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { mergePdfs } from '@/features/editor/engine'
import UploadDrop from '../components/UploadDrop'
import OrganizeResult from '../components/OrganizeResult'
import type { OrganizeOutput, PdfPreview } from '../lib'
import {
  formatBytes,
  loadPdfPreview,
  readPdfBytes,
  revokePreview,
  validatePdfOutput,
} from '../lib'

function fileKey(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`
}

/**
 * MergeTool — combine several PDFs into one. Files can be removed and
 * reordered (drag & drop or up/down), each with its first-page preview.
 */
export default function MergeTool() {
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<Record<string, PdfPreview>>({})
  const previewsRef = useRef<Record<string, PdfPreview>>({})
  const requestedRef = useRef<Set<string>>(new Set())
  const dragIndexRef = useRef<number | null>(null)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [outputs, setOutputs] = useState<OrganizeOutput[] | null>(null)

  useEffect(() => {
    previewsRef.current = previews
  }, [previews])

  useEffect(() => {
    const keys = new Set(files.map(fileKey))
    setPreviews((current) => {
      const next: Record<string, PdfPreview> = {}
      let changed = false
      for (const [key, preview] of Object.entries(current)) {
        if (keys.has(key)) {
          next[key] = preview
        } else {
          revokePreview(preview)
          changed = true
        }
      }
      return changed ? next : current
    })
    for (const file of files) {
      const key = fileKey(file)
      if (requestedRef.current.has(key)) continue
      requestedRef.current.add(key)
      void loadPdfPreview(file, true)
        .then((preview) =>
          setPreviews((current) =>
            current[key] ? current : { ...current, [key]: preview },
          ),
        )
        .catch(() => requestedRef.current.delete(key))
    }
  }, [files])

  useEffect(
    () => () => {
      for (const preview of Object.values(previewsRef.current)) {
        revokePreview(preview)
      }
    },
    [],
  )

  function addFiles(next: File[]) {
    setFiles((current) => [
      ...current,
      ...next.filter(
        (file) =>
          file.type === 'application/pdf' ||
          file.name.toLowerCase().endsWith('.pdf'),
      ),
    ])
    setOutputs(null)
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))
    setOutputs(null)
  }

  function moveFile(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= files.length) return
    setFiles((current) => {
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    setOutputs(null)
  }

  function handleDrop(target: number) {
    const source = dragIndexRef.current
    dragIndexRef.current = null
    if (source === null || source === target) return
    setFiles((current) => {
      const next = [...current]
      const [moved] = next.splice(source, 1)
      next.splice(target, 0, moved)
      return next
    })
    setOutputs(null)
  }

  const totalPages = files.reduce(
    (sum, file) => sum + (previews[fileKey(file)]?.pageCount ?? 0),
    0,
  )
  const previewsLoading = files.some((file) => !previews[fileKey(file)])

  async function handleMerge() {
    if (files.length < 2 || previewsLoading) return
    setProcessing(true)
    setError('')
    setOutputs(null)
    try {
      const bytesList = await Promise.all(files.map(readPdfBytes))
      const merged = await mergePdfs(bytesList)
      const expected = files.reduce(
        (sum, file) => sum + (previews[fileKey(file)]?.pageCount ?? 0),
        0,
      )
      const pages = await validatePdfOutput(merged, expected)
      setOutputs([{ filename: 'merged.pdf', bytes: merged, pages }])
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The PDFs could not be merged.',
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
          setFiles([])
        }}
      />
    )
  }

  return (
    <div className="organize-workflow">
      <section className="organize-section">
        <div className="organize-section__heading">
          <h2>Upload PDFs</h2>
          <p>Add at least two PDF files to combine into one document.</p>
        </div>
        <UploadDrop
          title="Drag & drop PDFs here"
          subtitle="Files stay on your machine — nothing is uploaded."
          accept=".pdf,application/pdf"
          multiple
          onFiles={addFiles}
        />
      </section>

      {files.length > 0 ? (
        <section className="organize-section">
          <div className="organize-section__heading">
            <h2>Arrange order</h2>
            <p>
              Drag files into the order you want. {totalPages} page
              {totalPages === 1 ? '' : 's'} across {files.length} file
              {files.length === 1 ? '' : 's'}.
            </p>
          </div>
          <ul className="organize-merge-list">
            {files.map((file, index) => {
              const preview = previews[fileKey(file)]
              return (
                <li
                  key={fileKey(file)}
                  className="organize-merge-row"
                  draggable
                  onDragStart={() => {
                    dragIndexRef.current = index
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleDrop(index)}
                >
                  <span
                    className="organize-merge-row__grip"
                    title="Drag to reorder"
                    aria-hidden="true"
                  >
                    <Icon name="reorder" size="sm" />
                  </span>
                  <span className="organize-merge-row__index">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {preview?.urls[0] ? (
                    <img
                      className="organize-merge-row__thumb"
                      src={preview.urls[0]}
                      alt={`First page of ${file.name}`}
                    />
                  ) : (
                    <span className="organize-merge-row__thumb organize-merge-row__thumb--loading">
                      <Spinner size="sm" label="" />
                    </span>
                  )}
                  <span className="organize-merge-row__meta">
                    <strong>{file.name}</strong>
                    <span>
                      {preview ? `${preview.pageCount} pages` : 'Reading…'} ·{' '}
                      {formatBytes(file.size)}
                    </span>
                  </span>
                  <span className="organize-merge-row__actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Move ${file.name} up`}
                      disabled={index === 0}
                      onClick={() => moveFile(index, -1)}
                    >
                      <Icon name="chevron-up" size="xs" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Move ${file.name} down`}
                      disabled={index === files.length - 1}
                      onClick={() => moveFile(index, 1)}
                    >
                      <Icon name="chevron-down" size="xs" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-button organize-merge-row__remove"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => removeFile(index)}
                    >
                      <Icon name="close" size="xs" aria-hidden="true" />
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
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
          disabled={
            files.length < 2 || previewsLoading || processing
          }
          onClick={() => void handleMerge()}
        >
          {processing ? <Spinner size="sm" label="Merging" /> : null}
          {processing ? 'Merging…' : `Merge ${files.length} PDF${files.length === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  )
}