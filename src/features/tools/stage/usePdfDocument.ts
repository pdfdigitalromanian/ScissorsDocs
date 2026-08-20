import { useEffect, useRef, useState } from 'react'
import { looksLikePdf } from '@/features/editor/engine'
import { loadPdfDocument, type LoadedPdf } from '../local/lib/pdf'

export interface PdfSession {
  file: File
  bytes: Uint8Array
  doc: LoadedPdf
  pageCount: number
}

export interface UsePdfDocumentResult {
  session: PdfSession | null
  loading: boolean
  error: string
  load: (file: File) => void
  clear: () => void
}

/**
 * Loads a single PDF and keeps the pdf.js document alive so pages can be
 * rendered interactively (used by the sign and redact workflows). The
 * document is destroyed when cleared or when the hook unmounts.
 */
export function usePdfDocument(): UsePdfDocumentResult {
  const [session, setSession] = useState<PdfSession | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const sessionRef = useRef<PdfSession | null>(null)

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(
    () => () => {
      const current = sessionRef.current
      if (current) void current.doc.destroy()
    },
    [],
  )

  function load(file: File) {
    setLoading(true)
    setError('')
    setSession(null)
    void (async () => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        if (!looksLikePdf(bytes)) {
          throw new Error(`“${file.name}” is not a valid PDF file.`)
        }
        const doc = await loadPdfDocument(bytes)
        setSession({ file, bytes, doc, pageCount: doc.document.numPages })
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'The PDF could not be read.',
        )
      } finally {
        setLoading(false)
      }
    })()
  }

  function clear() {
    const current = sessionRef.current
    if (current) void current.doc.destroy()
    sessionRef.current = null
    setSession(null)
    setError('')
    setLoading(false)
  }

  return { session, loading, error, load, clear }
}
