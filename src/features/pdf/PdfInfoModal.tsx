import { useEffect, useState } from 'react'
import Button from '@/components/ui/Button'
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  ModalClose,
} from '@/components/ui'
import { Icon } from '@/components/icons/Icon'
import type { LocalDocument } from '@/features/documents'
import { downloadDocument, formatBytes } from '@/features/documents'
import { usePdfSession } from './PdfSessionProvider'

interface PdfInfoModalProps {
  open: boolean
  onClose: () => void
  document: LocalDocument
}

function formatDateField(value: string | null): string | null {
  if (!value) return null
  return value.replace(/^D:/, '').replace(/'$/, '')
}

/**
 * PdfInfoModal shows the metadata stored inside the PDF plus the local
 * file record. Metadata is read from the real document via pdf.js.
 */
export function PdfInfoModal({ open, onClose, document }: PdfInfoModalProps) {
  const session = usePdfSession()
  const [firstPageSize, setFirstPageSize] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !session.document) return
    let cancelled = false
    session.document
      .getPage(1)
      .then((page) => {
        if (cancelled) return
        const viewport = page.getViewport({ scale: 1 })
        setFirstPageSize(`${Math.round(viewport.width)} × ${Math.round(viewport.height)} pt`)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [open, session.document])

  const rows: Array<{ label: string; value: string | null }> = [
    { label: 'File name', value: document.name },
    { label: 'Size', value: formatBytes(document.size) },
    { label: 'Pages', value: session.numPages ? String(session.numPages) : null },
    { label: 'Page size', value: firstPageSize },
    { label: 'Title', value: session.info?.title ?? null },
    { label: 'Author', value: session.info?.author ?? null },
    { label: 'Creator', value: session.info?.creator ?? null },
    { label: 'Producer', value: session.info?.producer ?? null },
    { label: 'Created', value: session.info ? formatDateField(session.info.creationDate) : null },
    { label: 'Modified', value: session.info ? formatDateField(session.info.modificationDate) : null },
  ]

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <ModalHeader>
        <ModalTitle>Document information</ModalTitle>
        <ModalClose />
      </ModalHeader>
      <ModalBody>
        <dl className="pdf-info">
          {rows.map((row) => (
            <div className="pdf-info__row" key={row.label}>
              <dt className="pdf-info__label">{row.label}</dt>
              <dd className="pdf-info__value">
                {row.value ?? <span className="pdf-info__empty">Not set</span>}
              </dd>
            </div>
          ))}
        </dl>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="outline"
          onClick={() => void downloadDocument(document.id)}
        >
          <Icon name="download" size="sm" />
          Download file
        </Button>
      </ModalFooter>
    </Modal>
  )
}
