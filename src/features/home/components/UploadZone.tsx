import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { useToast } from '@/components/ui'
import { Icon } from '@/components/icons/Icon'
import type { IconName } from '@/components/icons/Icon'
import { FILE_INPUT_ACCEPT } from '@/features/documents'

export type UploadStatus =
  'idle' | 'drag-over' | 'selected' | 'invalid' | 'loading' | 'empty'

interface UploadZoneProps {
  /**
   * Controlled status override. When omitted the zone manages its own
   * status through the drop/browse interactions.
   */
  status?: UploadStatus
  onStatusChange?: (status: UploadStatus) => void
  /**
   * Real file ingestion handler. When provided the zone feeds every
   * dropped or browsed file to it, shows a loading state while it runs
   * and surfaces failures. Resolving without navigating returns the
   * zone to its idle state.
   */
  onFiles?: (files: File[]) => void | Promise<void>
}

interface UploadStateConfig {
  icon: IconName
  title: string
  description: string
}

const UPLOAD_STATES: Record<UploadStatus, UploadStateConfig> = {
  idle: {
    icon: 'upload',
    title: 'Drag & drop a document here',
    description:
      'or browse from your device. Your document stays on your machine.',
  },
  'drag-over': {
    icon: 'upload',
    title: 'Drop it right here',
    description: 'Release to select the document for the workspace.',
  },
  selected: {
    icon: 'check-circle',
    title: 'Document selected',
    description: 'Ready to open in the workspace. Nothing has been uploaded.',
  },
  invalid: {
    icon: 'alert-triangle',
    title: 'This file could not be opened',
    description: 'Check the message and try a supported file type instead.',
  },
  loading: {
    icon: 'file-text',
    title: 'Preparing your document…',
    description: 'Reading the file and opening the workspace takes a moment.',
  },
  empty: {
    icon: 'upload',
    title: 'No documents yet',
    description: 'Drop a document here to start your first workspace session.',
  },
}

const BROWSEABLE_STATUSES: UploadStatus[] = ['idle', 'empty', 'invalid']

function displayName(files: File[]): string {
  if (files.length === 1) return files[0].name
  return `${files.length} documents`
}

/**
 * UploadZone is the drag & drop entry point of the home screen. It feeds
 * the selected files to an ingestion handler (real local file loading,
 * validation and registration) and renders the corresponding state.
 */
export default function UploadZone({
  status,
  onStatusChange,
  onFiles,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const [internalStatus, setInternalStatus] = useState<UploadStatus>('idle')
  const [fileName, setFileName] = useState('')
  const { toast } = useToast()

  const resolvedStatus = status ?? internalStatus
  const config = UPLOAD_STATES[resolvedStatus]

  function updateStatus(next: UploadStatus) {
    setInternalStatus(next)
    onStatusChange?.(next)
  }

  async function processFiles(files: File[]) {
    if (files.length === 0) {
      updateStatus('idle')
      return
    }

    setFileName(displayName(files))

    if (!onFiles) {
      updateStatus('selected')
      return
    }

    updateStatus('loading')
    try {
      await onFiles(files)
      updateStatus('idle')
    } catch (error) {
      toast({
        title: 'Could not open this file',
        description:
          error instanceof Error
            ? error.message
            : 'The file could not be read.',
        variant: 'error',
      })
      updateStatus('invalid')
      window.setTimeout(() => updateStatus('idle'), 3500)
    }
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    dragDepth.current += 1
    if (resolvedStatus === 'idle' || resolvedStatus === 'empty') {
      updateStatus('drag-over')
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      if (resolvedStatus === 'drag-over') {
        updateStatus('idle')
      }
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    dragDepth.current = 0
    void processFiles(Array.from(event.dataTransfer.files))
  }

  function handleBrowseClick() {
    inputRef.current?.click()
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    void processFiles(files)
  }

  function handleReset() {
    setFileName('')
    updateStatus('idle')
  }

  const canBrowse = BROWSEABLE_STATUSES.includes(resolvedStatus)

  return (
    <div
      className={`upload-zone upload-zone--${resolvedStatus}`}
      role="region"
      aria-label="Document upload zone"
      aria-live="polite"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="upload-zone__visual" aria-hidden="true">
        {resolvedStatus === 'loading' ? (
          <Spinner size="lg" label="" />
        ) : (
          <Icon name={config.icon} size="xl" />
        )}
      </div>

      <div className="upload-zone__content">
        <p className="upload-zone__title">{config.title}</p>
        <p className="upload-zone__description">{config.description}</p>
        {resolvedStatus === 'selected' && fileName && (
          <p className="upload-zone__filename">{fileName}</p>
        )}
        <div className="upload-zone__actions">
          {canBrowse ? (
            <Button variant="primary" onClick={handleBrowseClick}>
              Browse files
            </Button>
          ) : null}
          {resolvedStatus === 'selected' ? (
            <Button variant="outline" onClick={handleReset}>
              Choose another file
            </Button>
          ) : null}
        </div>
      </div>

      {resolvedStatus === 'idle' || resolvedStatus === 'empty' ? (
        <p className="upload-zone__hint">Files up to 200 MB</p>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={FILE_INPUT_ACCEPT}
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFileChange}
      />
    </div>
  )
}
