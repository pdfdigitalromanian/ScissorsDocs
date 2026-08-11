import { useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Icon } from '@/components/icons/Icon'
import { useToast } from '@/components/ui'
import { ingestFiles, SUPPORTED_FILE_TYPES } from '@/features/documents'
import HomeSection from './HomeSection'
import UploadZone from './UploadZone'
import {
  documentEntryShortcuts,
  supportedFileTypes,
} from '../data/home-catalog'
import type { DocumentEntryShortcut } from '../data/home-catalog'

function Shortcut({ shortcut }: { shortcut: DocumentEntryShortcut }) {
  const { toast } = useToast()

  if (shortcut.to) {
    return (
      <Link className="home-shortcut" to={shortcut.to}>
        <Icon name={shortcut.icon} size="sm" aria-hidden="true" />
        {shortcut.label}
      </Link>
    )
  }

  function handleClick() {
    toast({
      title: shortcut.label,
      description: shortcut.hint,
      variant: 'info',
    })
  }

  return (
    <button type="button" className="home-shortcut" onClick={handleClick}>
      <Icon name={shortcut.icon} size="sm" aria-hidden="true" />
      {shortcut.label}
    </button>
  )
}

/**
 * DocumentEntrySection is the primary entry point of the platform: the
 * drag & drop upload zone, quick entry shortcuts and the supported file
 * types. Dropped files are validated, registered locally and opened in
 * the workspace.
 */
export default function DocumentEntrySection() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const folderInputRef = useRef<HTMLInputElement | null>(null)

  async function handleFiles(files: File[]) {
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

    if (registered.length === 0) {
      throw new Error(
        failed[0]?.error ?? 'The selected files could not be opened.',
      )
    }

    const ids = registered.map((result) => result.document!.id)
    toast({
      title:
        registered.length === 1
          ? 'Document added locally'
          : `${registered.length} documents added locally`,
      description:
        registered.length === 1
          ? `${registered[0].document!.name} opened in the workspace.`
          : 'Each document opened as a workspace tab.',
      variant: 'success',
    })
    navigate(`/workspace?docs=${encodeURIComponent(ids.join(','))}`)
  }

  function handleFolderSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return

    const supported = files.filter((file) => {
      const extension = file.name
        .slice(file.name.lastIndexOf('.') + 1)
        .toLowerCase()
      return SUPPORTED_FILE_TYPES.some((type) => type.extension === extension)
    })

    if (supported.length === 0) {
      toast({
        title: 'No supported documents found',
        description:
          'The folder does not contain any files ScissorsDoc can open.',
        variant: 'error',
      })
      return
    }

    toast({
      title: 'Opening folder',
      description: `Importing ${supported.length} supported document${
        supported.length === 1 ? '' : 's'
      } locally.`,
      variant: 'info',
    })
    handleFiles(supported).catch(() => undefined)
  }

  function handleBrowseFolder() {
    folderInputRef.current?.click()
  }

  return (
    <HomeSection
      id="document-entry"
      title="Start working"
      description="Drop a document to begin, or choose how you'd like to get started."
    >
      <UploadZone onFiles={handleFiles} />

      <input
        ref={folderInputRef}
        type="file"
        className="visually-hidden"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.docx,.xlsx,.pptx"
        // @ts-expect-error webkitdirectory is not part of the DOM typings
        webkitdirectory="true"
        multiple
        onChange={handleFolderSelection}
        aria-hidden="true"
        tabIndex={-1}
      />
      <div className="home-entry__shortcuts">
        <button
          type="button"
          className="home-shortcut"
          onClick={handleBrowseFolder}
        >
          <Icon name="folder-open" size="sm" aria-hidden="true" />
          Browse folder
        </button>
        {documentEntryShortcuts.map((shortcut) => (
          <Shortcut key={shortcut.id} shortcut={shortcut} />
        ))}
      </div>

      <ul className="supported-files" aria-label="Supported file types">
        {supportedFileTypes.map((type) => (
          <li key={type.id} className="supported-file">
            <span
              className={`supported-file__badge supported-file__badge--${type.tone}`}
            >
              {type.extension}
            </span>
            <span className="supported-file__label">{type.label}</span>
          </li>
        ))}
      </ul>
    </HomeSection>
  )
}
