import { useState } from 'react'
import type { ChangeEvent } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Radio from '@/components/ui/Radio'
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  ModalClose,
  useToast,
} from '@/components/ui'
import { downloadBlob } from '@/features/documents'
import { usePdfEditor } from '../PdfEditorProvider'
import type { PageRange, SplitMode } from '../model'
import '../editor.css'

export type EditorDialogId = 'insert' | 'replace' | 'split' | 'merge'

interface EditorDialogsProps {
  dialog: EditorDialogId | null
  onClose: () => void
}

/**
 * EditorDialogs renders the modal workflows for the page tools: insert
 * PDFs/images, replace a page, split the document and merge documents.
 * Only the active dialog is mounted at a time.
 */
export function EditorDialogs({ dialog, onClose }: EditorDialogsProps) {
  return (
    <>
      {dialog === 'insert' && <InsertDialog onClose={onClose} />}
      {dialog === 'replace' && <ReplaceDialog onClose={onClose} />}
      {dialog === 'split' && <SplitDialog onClose={onClose} />}
      {dialog === 'merge' && <MergeDialog onClose={onClose} />}
    </>
  )
}

function downloadPdf(output: { name: string; bytes: Uint8Array }): void {
  downloadBlob(
    new Blob([output.bytes as BlobPart], { type: 'application/pdf' }),
    output.name,
  )
}

function InsertDialog({ onClose }: { onClose: () => void }) {
  const editor = usePdfEditor()
  const { toast } = useToast()
  const [files, setFiles] = useState<File[]>([])

  const chooseFiles = (event: ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(event.target.files ?? []))
  }

  const handleConfirm = async () => {
    if (files.length === 0) return
    await editor.insertPdfFiles(files)
    await editor.insertImageFiles(files)
    toast({
      title: 'Pages inserted',
      description: `${files.length} file${files.length === 1 ? '' : 's'} were added to the document.`,
      variant: 'success',
    })
    onClose()
  }

  return (
    <Modal open onClose={onClose} size="sm">
      <ModalHeader>
        <ModalTitle>Insert pages</ModalTitle>
        <ModalClose />
      </ModalHeader>
      <ModalBody>
        <p className="editor-dialog__text">
          Choose PDF files or images to append to the end of the document.
        </p>
        <Input
          type="file"
          label="Files"
          accept=".pdf,image/*"
          multiple
          onChange={chooseFiles}
        />
        {files.length > 0 && (
          <ul className="editor-dialog__list">
            {files.map((file) => (
              <li key={file.name}>{file.name}</li>
            ))}
          </ul>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={files.length === 0 || editor.busy}
          onClick={() => void handleConfirm()}
        >
          Insert
        </Button>
      </ModalFooter>
    </Modal>
  )
}

function ReplaceDialog({ onClose }: { onClose: () => void }) {
  const editor = usePdfEditor()
  const { toast } = useToast()
  const [file, setFile] = useState<File | null>(null)
  const firstId = editor.selectedPageIds[0]
  const pageIndex = editor.pages.findIndex((page) => page.id === firstId)

  const handleConfirm = async () => {
    if (!file || pageIndex < 0) return
    await editor.replacePageWithFile(pageIndex, file)
    toast({
      title: 'Page replaced',
      description: `Page ${pageIndex + 1} now shows the new file.`,
      variant: 'success',
    })
    onClose()
  }

  return (
    <Modal open onClose={onClose} size="sm">
      <ModalHeader>
        <ModalTitle>Replace page</ModalTitle>
        <ModalClose />
      </ModalHeader>
      <ModalBody>
        <p className="editor-dialog__text">
          {pageIndex >= 0
            ? `Replaces page ${pageIndex + 1} with the first page of a PDF or a single image.`
            : 'Select a page in the Pages panel first.'}
        </p>
        <Input
          type="file"
          label="Replacement"
          accept=".pdf,image/*"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        {file && <p className="editor-dialog__file">{file.name}</p>}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!file || pageIndex < 0 || editor.busy}
          onClick={() => void handleConfirm()}
        >
          Replace
        </Button>
      </ModalFooter>
    </Modal>
  )
}

function parseRanges(text: string): PageRange[] | null {
  const tokens = text
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
  if (tokens.length === 0) return null
  const ranges: PageRange[] = []
  for (const token of tokens) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(token)
    if (!match) return null
    ranges.push({
      start: Number(match[1]),
      end: match[2] ? Number(match[2]) : Number(match[1]),
    })
  }
  return ranges
}

function SplitDialog({ onClose }: { onClose: () => void }) {
  const editor = usePdfEditor()
  const { toast } = useToast()
  const [mode, setMode] = useState<SplitMode>('every')
  const [rangeText, setRangeText] = useState('')
  const [rangeError, setRangeError] = useState<string | null>(null)
  const selectionCount = editor.selectedPageIds.length

  const handleConfirm = async () => {
    let ranges: PageRange[] | undefined
    if (mode === 'selection') {
      ranges = editor.selectedPageIds
        .map((id) => {
          const index = editor.pages.findIndex((page) => page.id === id)
          return { start: index + 1, end: index + 1 }
        })
        .filter((range) => range.start >= 1)
    } else if (mode === 'ranges') {
      const parsed = parseRanges(rangeText)
      if (!parsed) {
        setRangeError('Enter ranges like 1-3, 5, 7-9.')
        return
      }
      ranges = parsed
    }
    const outputs = await editor.splitDocument(mode, ranges)
    if (outputs.length === 0) {
      setRangeError('Nothing to split with these settings.')
      return
    }
    for (const output of outputs) downloadPdf(output)
    toast({
      title: 'Document split',
      description: `${outputs.length} PDF${outputs.length === 1 ? '' : 's'} downloaded.`,
      variant: 'success',
    })
    onClose()
  }

  return (
    <Modal open onClose={onClose} size="sm">
      <ModalHeader>
        <ModalTitle>Split document</ModalTitle>
        <ModalClose />
      </ModalHeader>
      <ModalBody>
        <p className="editor-dialog__text">
          Split the document into separate PDF files.
        </p>
        <div className="editor-dialog__modes">
          <Radio
            name="editor-split-mode"
            label="Every page"
            checked={mode === 'every'}
            onChange={() => setMode('every')}
          />
          <Radio
            name="editor-split-mode"
            label={`Selected pages (${selectionCount} selected)`}
            checked={mode === 'selection'}
            disabled={selectionCount === 0}
            onChange={() => setMode('selection')}
          />
          <Radio
            name="editor-split-mode"
            label="Custom ranges"
            checked={mode === 'ranges'}
            onChange={() => setMode('ranges')}
          />
        </div>
        {mode === 'ranges' && (
          <Textarea
            label="Ranges"
            rows={3}
            placeholder="1-3, 5, 7-9"
            value={rangeText}
            error={rangeError ?? undefined}
            onChange={(event) => {
              setRangeText(event.target.value)
              setRangeError(null)
            }}
          />
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={editor.busy} onClick={() => void handleConfirm()}>
          Split
        </Button>
      </ModalFooter>
    </Modal>
  )
}

function MergeDialog({ onClose }: { onClose: () => void }) {
  const editor = usePdfEditor()
  const { toast } = useToast()
  const [files, setFiles] = useState<File[]>([])

  const chooseFiles = (event: ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(event.target.files ?? []))
  }

  const handleConfirm = async () => {
    if (files.length < 2) return
    const output = await editor.mergeDocuments(files)
    if (!output) return
    downloadPdf(output)
    toast({
      title: 'Documents merged',
      description: `${output.name} (${output.pageCount} pages) downloaded.`,
      variant: 'success',
    })
    onClose()
  }

  return (
    <Modal open onClose={onClose} size="sm">
      <ModalHeader>
        <ModalTitle>Merge documents</ModalTitle>
        <ModalClose />
      </ModalHeader>
      <ModalBody>
        <p className="editor-dialog__text">
          Choose at least two PDF files to combine into a single document.
        </p>
        <Input
          type="file"
          label="PDF files"
          accept=".pdf"
          multiple
          onChange={chooseFiles}
        />
        {files.length > 0 && (
          <ul className="editor-dialog__list">
            {files.map((file) => (
              <li key={file.name}>{file.name}</li>
            ))}
          </ul>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={files.length < 2 || editor.busy}
          onClick={() => void handleConfirm()}
        >
          Merge
        </Button>
      </ModalFooter>
    </Modal>
  )
}
