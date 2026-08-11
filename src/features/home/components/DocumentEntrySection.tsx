import { useNavigate } from 'react-router-dom'
import { Icon } from '@/components/icons/Icon'
import { useToast } from '@/components/ui'
import { ingestFiles } from '@/features/documents'
import UploadZone from './UploadZone'

const ENTRY_BENEFITS = [
  {
    label: 'Private by design',
    description: 'Files stay on your device',
    icon: 'security' as const,
  },
  {
    label: 'Easy to use',
    description: 'One clear path from file to work',
    icon: 'edit' as const,
  },
  {
    label: 'Ready in seconds',
    description: 'Open straight into your workspace',
    icon: 'recent' as const,
  },
]

/**
 * Primary local document entry point. Dropped or selected files are
 * validated, registered locally and opened in the existing workspace.
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

  return (
    <section id="document-entry" className="entry-upload">
      <div className="entry-upload__frame">
        <UploadZone onFiles={handleFiles} />
      </div>

      <p className="entry-upload__formats">
        PDF, Word, Excel, PowerPoint, images, and text files supported
      </p>

      <ul className="entry-benefits" aria-label="ScissorsDoc benefits">
        {ENTRY_BENEFITS.map((benefit) => (
          <li key={benefit.label} className="entry-benefit">
            <span className="entry-benefit__icon" aria-hidden="true">
              <Icon name={benefit.icon} size="sm" />
            </span>
            <span className="entry-benefit__copy">
              <strong>{benefit.label}</strong>
              <span>{benefit.description}</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="entry-upload__legal">
        By opening a file, you agree to the Terms of Use and Privacy Policy.
      </p>
    </section>
  )
}
