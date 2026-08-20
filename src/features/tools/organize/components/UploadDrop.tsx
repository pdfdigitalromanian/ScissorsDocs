import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { Icon } from '@/components/icons/Icon'

interface UploadDropProps {
  title: string
  subtitle: string
  accept?: string
  multiple?: boolean
  onFiles: (files: File[]) => void
}

/**
 * UploadDrop is the drop/browse entry point of the standalone organize
 * workflows. It is a controlled picker — the parent owns the file list.
 */
export default function UploadDrop({
  title,
  subtitle,
  accept = '.pdf',
  multiple = false,
  onFiles,
}: UploadDropProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onFiles(Array.from(event.target.files ?? []))
    event.target.value = ''
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    onFiles(Array.from(event.dataTransfer.files))
  }

  return (
    <div
      className={`organize-drop${dragging ? ' organize-drop--dragging' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <div className="organize-drop__visual" aria-hidden="true">
        <Icon name="upload" size="lg" />
      </div>
      <div className="organize-drop__text">
        <p className="organize-drop__title">{title}</p>
        <p className="organize-drop__subtitle">{subtitle}</p>
      </div>
      <button
        type="button"
        className="btn btn--outline btn--sm"
        onClick={() => inputRef.current?.click()}
      >
        Browse files
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleChange}
      />
    </div>
  )
}
