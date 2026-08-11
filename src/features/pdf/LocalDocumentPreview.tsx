import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { Icon } from '@/components/icons/Icon'
import type { LocalDocument } from '@/features/documents'
import {
  downloadDocument,
  formatBytes,
  useLocalDocumentBlob,
} from '@/features/documents'
import { PdfViewer } from './PdfViewer'

interface LocalDocumentPreviewProps {
  document: LocalDocument
}

/**
 * LocalDocumentPreview renders the real preview for a registered local
 * document: pdf.js viewer for PDFs, native image/text previews, and an
 * honest informational surface for office documents whose editors arrive
 * in later milestones.
 */
export function LocalDocumentPreview({ document }: LocalDocumentPreviewProps) {
  switch (document.kind) {
    case 'pdf':
      return <PdfViewer key={document.id} document={document} />
    case 'image':
      return <ImagePreview document={document} />
    case 'text':
      return <TextPreview document={document} />
    case 'office':
      return <OfficePreview document={document} />
    default:
      return <UnknownPreview document={document} />
  }
}

function PreviewFrame({
  document,
  children,
}: {
  document: LocalDocument
  children: ReactNode
}) {
  return (
    <div className="local-preview">
      <div className="local-preview__body">{children}</div>
      <div className="local-preview__footer">
        <span className="local-preview__meta">
          {document.extension.toUpperCase()} · {formatBytes(document.size)}
        </span>
        <Button
          variant="outline"
          onClick={() => void downloadDocument(document.id)}
        >
          <Icon name="download" size="sm" />
          Download
        </Button>
      </div>
    </div>
  )
}

function ImagePreview({ document }: LocalDocumentPreviewProps) {
  const { state, blob, error } = useLocalDocumentBlob(document.id)
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob])

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [url])

  return (
    <PreviewFrame document={document}>
      {state === 'loading' && (
        <Spinner size="lg" label={`Loading ${document.name}`} />
      )}
      {state === 'error' && (
        <PreviewMessage
          title="This image could not be opened"
          hint={error ?? 'The stored file could not be read.'}
        />
      )}
      {state === 'ready' && url && (
        <div className="local-preview__image-wrap">
          <img className="local-preview__image" src={url} alt={document.name} />
        </div>
      )}
    </PreviewFrame>
  )
}

const TEXT_PREVIEW_LIMIT = 200_000

function TextPreview({ document }: LocalDocumentPreviewProps) {
  const { state, blob, error } = useLocalDocumentBlob(document.id)
  const [text, setText] = useState<string | null>(null)
  const [readError, setReadError] = useState(false)
  const [truncated, setTruncated] = useState(false)

  useEffect(() => {
    if (!blob) return
    let cancelled = false
    blob
      .slice(0, TEXT_PREVIEW_LIMIT)
      .text()
      .then((content) => {
        if (cancelled) return
        setText(content)
        setTruncated(blob.size > TEXT_PREVIEW_LIMIT)
        setReadError(false)
      })
      .catch(() => {
        if (cancelled) return
        setReadError(true)
      })
    return () => {
      cancelled = true
    }
  }, [blob])

  return (
    <PreviewFrame document={document}>
      {state === 'loading' && (
        <Spinner size="lg" label={`Loading ${document.name}`} />
      )}
      {state === 'error' && (
        <PreviewMessage
          title="This file could not be opened"
          hint={error ?? 'The stored file could not be read.'}
        />
      )}
      {state === 'ready' && readError && (
        <PreviewMessage
          title="This file could not be read"
          hint="The stored file could not be decoded as text."
        />
      )}
      {state === 'ready' && !readError && text !== null && (
        <div className="local-preview__text-wrap">
          <pre className="local-preview__text">{text}</pre>
          {truncated && (
            <p className="local-preview__note">
              Large file — showing the first{' '}
              {Math.round(TEXT_PREVIEW_LIMIT / 1000)} KB.
            </p>
          )}
        </div>
      )}
    </PreviewFrame>
  )
}

function OfficePreview({ document }: LocalDocumentPreviewProps) {
  return (
    <PreviewFrame document={document}>
      <PreviewMessage
        title={`${document.extension.toUpperCase()} files open in the workspace`}
        hint={`The ${document.extension.toUpperCase()} tools arrive in a later phase. Your file is stored on this device and can be downloaded.`}
      />
    </PreviewFrame>
  )
}

function UnknownPreview({ document }: LocalDocumentPreviewProps) {
  return (
    <PreviewFrame document={document}>
      <PreviewMessage
        title="This file type is not previewable yet"
        hint={`${document.extension.toUpperCase()} preview tools arrive in a later phase. Your file stays stored on this device.`}
      />
    </PreviewFrame>
  )
}

function PreviewMessage({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="local-preview__message">
      <Icon name="alert-circle" size="lg" />
      <p className="local-preview__message-title">{title}</p>
      <p className="local-preview__message-hint">{hint}</p>
    </div>
  )
}
