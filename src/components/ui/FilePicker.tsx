import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { Icon } from '@/components/icons/Icon'
import './file-picker.css'

interface FilePickerProps {
  label?: string
  accept?: string
  multiple?: boolean
  minFiles?: number
  onChange: (files: File[]) => void
}

function fileMatchesAccept(file: File, accept: string): boolean {
  if (!accept) return true
  const name = file.name.toLowerCase()
  return accept.split(',').some((entry) => {
    const token = entry.trim().toLowerCase()
    if (!token) return false
    if (token === '*/*') return true
    if (token.endsWith('/*')) {
      const mimePrefix = token.slice(0, -1)
      return file.type.startsWith(mimePrefix)
    }
    if (token.startsWith('.')) return name.endsWith(token)
    return file.type === token
  })
}

export default function FilePicker({
  label,
  accept,
  multiple = false,
  minFiles = 1,
  onChange,
}: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)

  function update(next: File[]) {
    setFiles(next)
    onChange(next)
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = Array.from(event.target.files ?? []).filter((file) =>
      fileMatchesAccept(file, accept ?? ''),
    )
    update(multiple ? next : next.slice(0, 1))
    event.target.value = ''
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    const next = Array.from(event.dataTransfer.files).filter((file) =>
      fileMatchesAccept(file, accept ?? ''),
    )
    update(multiple ? next : next.slice(0, 1))
  }

  function handleRemove(index: number) {
    update(files.filter((_, fileIndex) => fileIndex !== index))
  }

  return (
    <div className={`field${label ? '' : ' field--unlabelled'}`}>
      {label && <span className="field__label">{label}</span>}
      <div
        className={`file-picker${dragging ? ' file-picker--dragging' : ''}`}
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
        <div className="file-picker__visual" aria-hidden="true">
          <Icon name="upload" size="md" />
        </div>
        <div className="file-picker__text">
          <p className="file-picker__title">
            Drag &amp; drop {multiple ? 'files' : 'a file'} here
          </p>
          <p className="file-picker__subtitle">
            or
            <button
              type="button"
              className="file-picker__browse"
              onClick={() => inputRef.current?.click()}
            >
              browse from your device
            </button>
          </p>
        </div>
        {files.length > 0 && (
          <ul className="file-picker__list">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="file-picker__file">
                <Icon name="file" size="xs" />
                <span className="file-picker__filename">{file.name}</span>
                <button
                  type="button"
                  className="file-picker__remove"
                  aria-label={`Remove ${file.name}`}
                  title="Remove"
                  onClick={() => handleRemove(index)}
                >
                  <Icon name="close" size="xs" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {files.length > 0 && minFiles > 1 && (
          <p className="file-picker__hint">
            {files.length} of at least {minFiles} selected
          </p>
        )}
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
    </div>
  )
}
