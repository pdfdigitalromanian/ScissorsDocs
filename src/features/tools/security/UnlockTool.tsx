import { useEffect, useState } from 'react'
import { Icon } from '@/components/icons/Icon'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import {
  inspectPdfProtection,
  unlockPdf,
  type ProtectionReport,
} from '@/features/editor/security'
import UploadDrop from '../organize/components/UploadDrop'
import OrganizeResult from '../organize/components/OrganizeResult'
import { useSinglePdf } from '../organize/hooks/useSinglePdf'
import type { OrganizeOutput } from '../organize/lib'
import { readPdfBytes } from '../organize/lib'

/**
 * UnlockTool — remove password protection from a PDF the user is entitled to
 * open. It only decrypts with a password the user already knows; it never
 * guesses, cracks or bypasses protection.
 */
export default function UnlockTool() {
  const { file, preview, loading, loadError, select, clear } = useSinglePdf()
  const [password, setPassword] = useState('')
  const [protection, setProtection] = useState<ProtectionReport | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [outputs, setOutputs] = useState<OrganizeOutput[] | null>(null)

  useEffect(() => {
    setOutputs(null)
    setError('')
    setPassword('')
    setProtection(null)
  }, [file])

  useEffect(() => {
    if (!preview) {
      setProtection(null)
      return
    }
    let cancelled = false
    setChecking(true)
    setProtection(null)
    void inspectPdfProtection(preview.bytes)
      .then((report) => {
        if (cancelled) return
        setProtection(report)
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setError(
          reason instanceof Error
            ? reason.message
            : 'The PDF could not be read.',
        )
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [preview])

  const baseName = file
    ? file.name.replace(/\.pdf$/i, '') || 'document'
    : 'document'

  async function handleUnlock() {
    if (!file) return
    setProcessing(true)
    setError('')
    setOutputs(null)
    try {
      const bytes = await readPdfBytes(file)
      const result = await unlockPdf(bytes, password)
      setOutputs([
        {
          filename: `${baseName}-unlocked.pdf`,
          bytes: result.bytes,
          pages: result.pageCount,
        },
      ])
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The PDF could not be unlocked.',
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

  // PDF.js preview fails on locked files with "No password given." — that is
  // expected here, not an error. The unlock itself runs on pdf-lib below.
  const passwordRequired = loadError.toLowerCase().includes('password')
  const notProtected = protection !== null && !protection.encrypted
  const restrictionOnly = protection !== null && protection.encrypted && !protection.needsPassword
  const canUnlock = !passwordRequired || password.trim().length > 0

  return (
    <div className="organize-workflow">
      <section className="organize-section">
        <div className="organize-section__heading">
          <h2>Upload PDF</h2>
          <p>Choose the protected document you want to unlock.</p>
        </div>
        <UploadDrop
          title="Drag & drop a PDF here"
          subtitle="Unlocked locally in your browser — never uploaded."
          accept=".pdf,application/pdf"
          onFiles={select}
        />
      </section>

      {loadError && !passwordRequired ? (
        <div className="organize-error" role="alert">
          <Icon name="alert-circle" size="sm" aria-hidden="true" />
          {loadError}
        </div>
      ) : null}

      {file && passwordRequired ? (
        <div className="organize-note" role="status">
          <Icon name="info" size="sm" aria-hidden="true" />
          <div>
            <strong>This PDF is locked.</strong>
            <span>Enter the password used to open it, then press Unlock PDF.</span>
          </div>
        </div>
      ) : null}

      {file && (loading || checking) ? (
        <div className="organize-loading" role="status">
          <Spinner size="sm" label="" /> Reading pages…
        </div>
      ) : null}

      {file ? (
        <>
          {protection !== null && notProtected ? (
            <div className="organize-note" role="status">
              <Icon name="info" size="sm" aria-hidden="true" />
              <div>
                <strong>No open password detected.</strong>
                <span>
                  This PDF does not appear to be encrypted, but you can still
                  unlock it to remove any restrictions.
                </span>
              </div>
            </div>
          ) : null}

          {protection !== null && restrictionOnly ? (
            <div className="organize-note" role="status">
              <Icon name="info" size="sm" aria-hidden="true" />
              <div>
                <strong>This PDF has restrictions but no open password.</strong>
                <span>
                  You can remove the restrictions without entering a password.
                </span>
              </div>
            </div>
          ) : null}

          <section className="organize-section">
            <div className="organize-section__heading">
              <h2>Enter the password</h2>
              <p>
                If this PDF is locked, enter the password used to open it. If it
                only has restrictions, you can leave this empty.
              </p>
            </div>
            <div className="organize-field">
              <label className="field__label" htmlFor="unlock-password">
                PDF password
              </label>
              <input
                id="unlock-password"
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                placeholder="Password used to open the PDF"
                onChange={(event) => {
                  setPassword(event.target.value)
                  setError('')
                }}
              />
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
              disabled={!canUnlock || processing}
              onClick={() => void handleUnlock()}
            >
              {processing ? <Spinner size="sm" label="Unlocking" /> : null}
              {processing ? 'Unlocking…' : 'Unlock PDF'}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  )
}