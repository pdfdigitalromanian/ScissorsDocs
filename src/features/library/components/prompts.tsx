import { useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui'
import { Icon } from '@/components/icons/Icon'
import IconButton from '@/components/ui/IconButton'
import { Radio } from '@/components/ui'
import type { LocalDocument, LocalFolder } from '@/features/documents'

export interface TextPromptResult {
  /** Form error shown inline; null submits. */
  error: string | null
  /** The submitted value when no error is returned. */
  value?: string
}

interface TextPromptModalProps {
  open: boolean
  title: string
  label: string
  initialValue: string
  hint?: string
  submitLabel: string
  onSubmit: (value: string) => Promise<TextPromptResult>
  onClose: () => void
}

/**
 * TextPromptModal — small single-field form used for renaming documents,
 * creating folders and renaming folders.
 */
export function TextPromptModal({
  open,
  title,
  label,
  initialValue,
  hint,
  submitLabel,
  onSubmit,
  onClose,
}: TextPromptModalProps) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit() {
    if (busy) return
    setBusy(true)
    try {
      const result = await onSubmit(value)
      if (result.error) {
        setError(result.error)
        setBusy(false)
        return
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <ModalHeader>
        <ModalTitle>{title}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <Input
          label={label}
          value={value}
          hint={hint}
          error={error ?? undefined}
          autoFocus
          onChange={(event) => {
            setValue(event.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void handleSubmit()
          }}
        />
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => void handleSubmit()}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
}

/** ConfirmModal — destructive confirmation for irreversible or trash actions. */
export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} size="sm">
      <ModalHeader>
        <ModalTitle>{title}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <p className="library-modal__message">{message}</p>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          className="library-modal__confirm"
          onClick={() => {
            onClose()
            onConfirm()
          }}
        >
          {confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

interface TagsModalProps {
  open: boolean
  document: LocalDocument
  onSave: (tags: string[]) => Promise<void>
  onClose: () => void
}

/** TagsModal — add, remove and save a document's tags. */
export function TagsModal({ open, document, onSave, onClose }: TagsModalProps) {
  const [tags, setTags] = useState<string[]>(document.tags)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  function addTag() {
    const tag = draft.trim()
    if (!tag) return
    if (!tags.includes(tag)) setTags([...tags, tag])
    setDraft('')
  }

  async function handleSave() {
    if (busy) return
    setBusy(true)
    try {
      await onSave(tags)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <ModalHeader>
        <ModalTitle>Edit tags</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <p className="library-modal__hint">
          Tags help you find documents across your library. Press Enter to add.
        </p>
        <div className="tags-editor">
          <div className="tags-editor__add">
            <Input
              label="Add a tag"
              value={draft}
              placeholder="e.g. invoice"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addTag()
                }
              }}
            />
            <Button variant="outline" onClick={addTag}>
              Add
            </Button>
          </div>
          <ul className="tags-editor__list" aria-label="Current tags">
            {tags.length === 0 ? (
              <li className="tags-editor__empty">No tags yet.</li>
            ) : (
              tags.map((tag) => (
                <li key={tag} className="tags-editor__tag">
                  <span>{tag}</span>
                  <IconButton
                    icon="close"
                    label={`Remove tag ${tag}`}
                    iconSize="xs"
                    onClick={() => setTags(tags.filter((entry) => entry !== tag))}
                  />
                </li>
              ))
            )}
          </ul>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => void handleSave()}>
          {busy ? 'Saving…' : 'Save tags'}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

interface MoveDocumentModalProps {
  open: boolean
  document: LocalDocument
  folders: LocalFolder[]
  onMove: (folderId: string | null) => Promise<void>
  onClose: () => void
}

/** MoveDocumentModal — pick a folder (or the root) for a document. */
export function MoveDocumentModal({
  open,
  document,
  folders,
  onMove,
  onClose,
}: MoveDocumentModalProps) {
  const [folderId, setFolderId] = useState<string | null>(document.folderId)
  const [busy, setBusy] = useState(false)

  async function handleMove() {
    if (busy) return
    setBusy(true)
    try {
      await onMove(folderId)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <ModalHeader>
        <ModalTitle>Move to folder</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <p className="library-modal__hint">
          Choose where <strong>{document.name}</strong> should live.
        </p>
        <ul className="move-list">
          <li>
            <Radio
              name="move-target"
              label="No folder"
              checked={folderId === null}
              onChange={() => setFolderId(null)}
            />
          </li>
          {folders.map((folder) => (
            <li key={folder.id}>
              <Radio
                name="move-target"
                label={folder.name}
                checked={folderId === folder.id}
                onChange={() => setFolderId(folder.id)}
              />
            </li>
          ))}
          {folders.length === 0 ? (
            <li className="move-list__empty">
              <Icon name="folder-open" size="sm" />
              No folders yet — create one from the library.
            </li>
          ) : null}
        </ul>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => void handleMove()}>
          {busy ? 'Moving…' : 'Move'}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
