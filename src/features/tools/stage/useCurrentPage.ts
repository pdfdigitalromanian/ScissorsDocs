import { useEffect, useState } from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { PdfSession } from './usePdfDocument'

/**
 * Loads (and caches) the pdf.js page proxy for `pageIndex` within the active
 * session. Returns null while the page is loading or no session is set.
 */
export function useCurrentPage(
  session: PdfSession | null,
  pageIndex: number,
): PDFPageProxy | null {
  const [page, setPage] = useState<PDFPageProxy | null>(null)

  useEffect(() => {
    let cancelled = false
    setPage(null)
    if (!session) return
    void session.doc.document
      .getPage(pageIndex + 1)
      .then((loaded) => {
        if (!cancelled) setPage(loaded)
      })
      .catch(() => {
        // A page that fails to load simply stays unrendered.
      })
    return () => {
      cancelled = true
    }
  }, [session, pageIndex])

  return page
}
