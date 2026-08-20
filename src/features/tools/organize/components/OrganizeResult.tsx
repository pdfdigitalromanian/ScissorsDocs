import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '@/components/icons/Icon'
import Button from '@/components/ui/Button'
import { ingestFiles } from '@/features/documents'
import { createZipArchive } from '../../local/lib/zip'
import type { OrganizeOutput } from '../lib'
import { downloadBytes, formatBytes } from '../lib'

interface OrganizeResultProps {
  outputs: OrganizeOutput[]
  zipName?: string
  /** Non-blocking notes about limitations of the finished result. */
  warnings?: string[]
  onStartAnother: () => void
}

/**
 * OrganizeResult shows the generated PDF(s): one row per output with its
 * own download, a "download all as .zip" shortcut for multi-part results,
 * opening every output in the workspace, and starting another operation.
 */
export default function OrganizeResult({
  outputs,
  zipName,
  warnings = [],
  onStartAnother,
}: OrganizeResultProps) {
  const navigate = useNavigate()
  const [opening, setOpening] = useState(false)
  const totalPages = outputs.reduce((sum, output) => sum + output.pages, 0)

  async function handleOpenInWorkspace() {
    if (outputs.length === 0) return
    setOpening(true)
    try {
      const files = outputs.map(
        (output) =>
          new File([output.bytes as unknown as BlobPart], output.filename, {
            type: 'application/pdf',
          }),
      )
      const results = await ingestFiles(files)
      const ids = results
        .map((item) => item.document?.id)
        .filter((id): id is string => Boolean(id))
      if (ids.length === 0) {
        throw new Error('The result could not be opened in the workspace.')
      }
      navigate(`/workspace?docs=${encodeURIComponent(ids.join(','))}`)
    } catch {
      setOpening(false)
    }
  }

  function handleDownloadAll() {
    const entries = outputs.map((output) => ({
      name: output.filename,
      data: output.bytes,
    }))
    downloadBytes(
      createZipArchive(entries),
      zipName ?? 'parts.zip',
      'application/zip',
    )
  }

  return (
    <div className="organize-result" aria-live="polite">
      <div className="organize-result__heading">
        <Icon name="check-circle" size="sm" aria-hidden="true" />
        <div>
          <h3>Done</h3>
          <p>
            {outputs.length} PDF{outputs.length === 1 ? '' : 's'} · {totalPages}{' '}
            page{totalPages === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <ul className="organize-result__files">
        {outputs.map((output) => (
          <li key={output.filename}>
            <Icon name="file-text" aria-hidden="true" />
            <span className="organize-result__name">{output.filename}</span>
            <span className="organize-result__meta">
              {output.pages} page{output.pages === 1 ? '' : 's'} ·{' '}
              {formatBytes(output.bytes.length)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadBytes(output.bytes, output.filename)}
            >
              Download
            </Button>
          </li>
        ))}
      </ul>

      {warnings.length > 0 ? (
        <ul className="organize-result__warnings">
          {warnings.map((warning, index) => (
            <li key={index}>
              <Icon name="alert-triangle" size="sm" aria-hidden="true" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="organize-result__actions">
        {outputs.length > 1 ? (
          <Button type="button" variant="primary" onClick={handleDownloadAll}>
            <Icon name="download" size="sm" aria-hidden="true" />
            Download all (.zip)
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            onClick={() => downloadBytes(outputs[0].bytes, outputs[0].filename)}
          >
            <Icon name="download" size="sm" aria-hidden="true" />
            Download
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={opening}
          onClick={() => void handleOpenInWorkspace()}
        >
          <Icon name="workspace" size="sm" aria-hidden="true" />
          {opening ? 'Opening…' : 'Open in workspace'}
        </Button>
        <Button type="button" variant="ghost" onClick={onStartAnother}>
          Start another operation
        </Button>
      </div>
    </div>
  )
}