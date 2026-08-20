import { useEffect, useState } from 'react'
import { Icon } from '@/components/icons/Icon'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import Spinner from '@/components/ui/Spinner'
import { protectPdf, type ProtectPermissions } from '@/features/editor/security'
import UploadDrop from '../organize/components/UploadDrop'
import OrganizeResult from '../organize/components/OrganizeResult'
import { useSinglePdf } from '../organize/hooks/useSinglePdf'
import type { OrganizeOutput } from '../organize/lib'
import { readPdfBytes } from '../organize/lib'

const DEFAULT_PERMISSIONS: ProtectPermissions = {
  restrictPrinting: false,
  restrictCopying: false,
  restrictEditing: false,
  restrictAnnotating: false,
  restrictFormFilling: false,
}

const PERMISSION_OPTIONS: {
  key: keyof ProtectPermissions
  label: string
  explanation: string
}[] = [
  {
    key: 'restrictPrinting',
    label: 'Restrict printing',
    explanation: 'Nobody can print the document while it stays protected.',
  },
  {
    key: 'restrictCopying',
    label: 'Restrict copying',
    explanation: 'Text and images cannot be copied or extracted.',
  },
  {
    key: 'restrictEditing',
    label: 'Restrict editing',
    explanation: 'The document cannot be modified beyond annotations and forms.',
  },
  {
    key: 'restrictAnnotating',
    label: 'Restrict commenting',
    explanation: 'Comments and annotations cannot be added or changed.',
  },
  {
    key: 'restrictFormFilling',
    label: 'Restrict form filling',
    explanation: 'Existing form fields cannot be filled in.',
  },
]

/**
 * ProtectTool — encrypt a PDF with an open password and optional
 * restrictions. Runs fully in the browser: nothing is uploaded.
 */
export default function ProtectTool() {
  const { file, preview, loading, loadError, select, clear } = useSinglePdf()
  const [openPassword, setOpenPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [permissions, setPermissions] = useState(DEFAULT_PERMISSIONS)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [outputs, setOutputs] = useState<OrganizeOutput[] | null>(null)

  useEffect(() => {
    setOutputs(null)
    setError('')
    setOpenPassword('')
    setConfirmPassword('')
    setOwnerPassword('')
    setPermissions(DEFAULT_PERMISSIONS)
  }, [file])

  const baseName = file
    ? file.name.replace(/\.pdf$/i, '') || 'document'
    : 'document'

  async function handleProtect() {
    if (!file) return
    setProcessing(true)
    setError('')
    setOutputs(null)
    try {
      if (openPassword !== confirmPassword) {
        throw new Error('The passwords do not match.')
      }
      const bytes = await readPdfBytes(file)
      const result = await protectPdf(bytes, {
        userPassword: openPassword,
        ownerPassword: ownerPassword || undefined,
        permissions,
      })
      setOutputs([
        {
          filename: `${baseName}-protected.pdf`,
          bytes: result.bytes,
          pages: result.pageCount,
        },
      ])
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The PDF could not be protected.',
      )
    } finally {
      setProcessing(false)
    }
  }

  if (outputs) {
    return (
      <OrganizeResult
        outputs={outputs}
        onStartAnother={() => {
          setOutputs(null)
          clear()
        }}
      />
    )
  }

  const passMismatch = confirmPassword.length > 0 && confirmPassword !== openPassword

  return (
    <div className="organize-workflow">
      <section className="organize-section">
        <div className="organize-section__heading">
          <h2>Upload PDF</h2>
          <p>Choose the document you want to protect.</p>
        </div>
        <UploadDrop
          title="Drag & drop a PDF here"
          subtitle="Protected locally in your browser — never uploaded."
          accept=".pdf,application/pdf"
          onFiles={select}
        />
      </section>

      {loadError ? (
        <div className="organize-error" role="alert">
          <Icon name="alert-circle" size="sm" aria-hidden="true" />
          {loadError}
        </div>
      ) : null}

      {file && loading ? (
        <div className="organize-loading" role="status">
          <Spinner size="sm" label="" /> Reading pages…
        </div>
      ) : null}

      {preview ? (
        <>
          <section className="organize-section">
            <div className="organize-section__heading">
              <h2>Set passwords</h2>
              <p>
                The open password is required to open the PDF. The permissions
                password controls the restrictions — leave it blank to reuse the
                open password.
              </p>
            </div>
            <div className="organize-field">
              <label className="field__label" htmlFor="protect-open">
                Open password
              </label>
              <input
                id="protect-open"
                className="input"
                type="password"
                autoComplete="new-password"
                value={openPassword}
                placeholder="At least 4 characters"
                onChange={(event) => {
                  setOpenPassword(event.target.value)
                  setError('')
                }}
              />
            </div>
            <div className="organize-field">
              <label className="field__label" htmlFor="protect-confirm">
                Confirm open password
              </label>
              <input
                id="protect-confirm"
                className="input"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                placeholder="Repeat the open password"
                onChange={(event) => {
                  setConfirmPassword(event.target.value)
                  setError('')
                }}
              />
              {passMismatch ? (
                <span className="field__error" role="alert">
                  The passwords do not match.
                </span>
              ) : null}
            </div>
            <div className="organize-field">
              <label className="field__label" htmlFor="protect-owner">
                Permissions password (optional)
              </label>
              <input
                id="protect-owner"
                className="input"
                type="password"
                autoComplete="new-password"
                value={ownerPassword}
                placeholder="Defaults to the open password"
                onChange={(event) => setOwnerPassword(event.target.value)}
              />
              <span className="organize-hint">
                Used to lift the restrictions below. Empty passwords are not
                stored or sent anywhere.
              </span>
            </div>
          </section>

          <section className="organize-section">
            <div className="organize-section__heading">
              <h2>Restrictions</h2>
              <p>
                These limits apply to anyone opening the PDF with the open
                password.
              </p>
            </div>
            <div className="security-checks">
              {PERMISSION_OPTIONS.map((option) => (
                <label
                  key={option.key}
                  className={`security-check${
                    permissions[option.key] ? ' security-check--checked' : ''
                  }`}
                >
                  <Checkbox
                    checked={permissions[option.key]}
                    onChange={(event) =>
                      setPermissions((current) => ({
                        ...current,
                        [option.key]: event.target.checked,
                      }))
                    }
                  />
                  <span className="security-check__text">
                    <strong>{option.label}</strong>
                    <span>{option.explanation}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          {error ? (
            <div className="organize-error" role="alert">
              <Icon name="alert-circle" size="sm" aria-hidden="true" />
              {error}
            </div>
          ) : null}

          <div className="organize-actions">
            <Button
              size="lg"
              disabled={
                openPassword.trim().length < 4 ||
                confirmPassword !== openPassword ||
                processing
              }
              onClick={() => void handleProtect()}
            >
              {processing ? <Spinner size="sm" label="Protecting" /> : null}
              {processing ? 'Protecting…' : 'Protect PDF'}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  )
}