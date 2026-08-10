import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { Icon } from '@/components/icons/Icon'
import { useToast } from '@/components/ui'
import { ingestFiles } from '@/features/documents'
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

  async function handleFiles(files: File[]) {
    const results = await ingestFiles(files)
    const registered = results.filter((result) => result.document !== null)
    const failed = results.filter((result) => result.error !== null)

    if (failed.length > 0) {
      toast({
        title: 'Some files could not be opened',
        description: failed[0].error ?? 'The file could not be read.',
        variant: 'error',
      })
    }

    if (registered.length === 0) {
      throw new Error(
        failed[0]?.error ?? 'The selected files could not be opened.',
      )
    }

    toast({
      title: 'Document added locally',
      description: `${registered[0].document!.name} opened in the workspace.`,
      variant: 'success',
    })
    navigate(`/workspace?doc=${encodeURIComponent(registered[0].document!.id)}`)
  }

  function handleBrowseFolder() {
    toast({
      title: 'Browse folders',
      description: 'Opening an entire folder arrives in a later phase.',
      variant: 'info',
    })
  }

  return (
    <HomeSection
      id="document-entry"
      title="Start working"
      description="Drop a document to begin, or choose how you'd like to get started."
    >
      <UploadZone onFiles={handleFiles} />

      <div className="home-entry__shortcuts">
        <button type="button" className="home-shortcut" onClick={handleBrowseFolder}>
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
