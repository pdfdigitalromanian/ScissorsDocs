import { useEffect, useState } from 'react'
import type { PdfPreview } from '../lib'
import { loadPdfPreview, revokePreview } from '../lib'

export interface SinglePdfState {
  file: File | null
  preview: PdfPreview | null
  loading: boolean
  loadError: string
  select: (files: File[]) => void
  clear: () => void
}

/**
 * Loads a single PDF and renders all of its page thumbnails for the
 * selection-based organize workflows (extract, delete, rotate, rearrange).
 */
export function useSinglePdf(): SinglePdfState {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PdfPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!file) {
      setPreview(null)
      setLoadError('')
      setLoading(false)
      return
    }
    let cancelled = false
    setPreview(null)
    setLoading(true)
    setLoadError('')
    void loadPdfPreview(file, false)
      .then((loaded) => {
        if (cancelled) {
          revokePreview(loaded)
          return
        }
        setPreview(loaded)
        setLoading(false)
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setLoadError(
          reason instanceof Error
            ? reason.message
            : 'The PDF could not be read.',
        )
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [file])

  useEffect(
    () => () => {
      if (preview) revokePreview(preview)
    },
    [preview],
  )

  function select(files: File[]) {
    const next = files.find(
      (candidate) =>
        candidate.type === 'application/pdf' ||
        candidate.name.toLowerCase().endsWith('.pdf'),
    )
    setFile(next ?? null)
  }

  function clear() {
    setFile(null)
    setPreview(null)
  }

  return { file, preview, loading, loadError, select, clear }
}