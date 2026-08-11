import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui'
import { FILE_INPUT_ACCEPT, ingestFiles } from '@/features/documents'
import { useWorkspace } from '../state/use-workspace'

interface OpenDocumentButtonProps {
  label?: string
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * OpenDocumentButton is the workspace's real file entry point. It opens a
 * file picker, ingests the selected files through the local document
 * registry and opens every successfully registered document as a tab.
 */
export function OpenDocumentButton({
  label = 'Open Document',
  variant = 'primary',
  size = 'md',
  className = '',
}: OpenDocumentButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const { openLocalDocuments } = useWorkspace()
  const [busy, setBusy] = useState(false)

  async function handleFiles(files: File[]) {
    if (files.length === 0) return
    setBusy(true)
    try {
      const results = await ingestFiles(files)
      const registered = results.filter((result) => result.document !== null)
      const failed = results.filter((result) => result.error !== null)

      if (failed.length > 0) {
        toast({
          title:
            failed.length === 1
              ? 'A file could not be opened'
              : `${failed.length} files could not be opened`,
          description: failed[0].error ?? 'The file could not be read.',
          variant: 'error',
        })
      }

      if (registered.length > 0) {
        openLocalDocuments(registered.map((result) => result.document!))
        if (registered.length > 1) {
          toast({
            title: 'Documents opened',
            description: `${registered.length} documents were opened as workspace tabs.`,
            variant: 'success',
          })
        }
      }
    } finally {
      setBusy(false)
    }
  }

  function handleBrowseClick() {
    inputRef.current?.click()
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    void handleFiles(files)
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={busy}
        onClick={handleBrowseClick}
      >
        {busy ? 'Opening…' : label}
      </Button>
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
    </>
  )
}
