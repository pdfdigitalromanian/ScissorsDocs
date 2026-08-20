import { useRef, useState } from 'react'
import { Icon } from '@/components/icons/Icon'
import Button from '@/components/ui/Button'
import SignaturePad from './SignaturePad'
import {
  canvasToSignature,
  createTypedSignature,
  createUploadedSignature,
  TYPED_SIGNATURE_STYLES,
  type SignatureImage,
} from '../signature-lib'

interface SignatureStudioProps {
  onCreate: (signature: SignatureImage) => void
  /** Tab to show on mount (used by the workspace Sign toolbar). */
  initialTab?: StudioTab
}

export type StudioTab = 'draw' | 'type' | 'upload'

const SIGNATURE_COLORS = [
  '#0f172a',
  '#111827',
  '#1d4ed8',
  '#b91c1c',
  '#047857',
  '#7c3aed',
]

/**
 * SignatureStudio is where a signature is created: by drawing on a pad,
 * typing a name in a chosen style, or uploading a signature image. Each
 * creation is handed back to the parent as a transparent PNG.
 */
export default function SignatureStudio({
  onCreate,
  initialTab = 'draw',
}: SignatureStudioProps) {
  const [tab, setTab] = useState<StudioTab>(initialTab)
  const [color, setColor] = useState(SIGNATURE_COLORS[0])
  const padCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [padKey, setPadKey] = useState(0)
  const [padHasContent, setPadHasContent] = useState(false)
  const [typedName, setTypedName] = useState('')
  const [typedStyleId, setTypedStyleId] = useState(TYPED_SIGNATURE_STYLES[0].id)
  const [uploaded, setUploaded] = useState<{ url: string; file: File } | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const typedStyle =
    TYPED_SIGNATURE_STYLES.find((style) => style.id === typedStyleId) ??
    TYPED_SIGNATURE_STYLES[0]

  function handleClear() {
    setPadKey((key) => key + 1)
    setPadHasContent(false)
  }

  async function handleUseDrawn() {
    const canvas = padCanvasRef.current
    if (!canvas) return
    setBusy(true)
    setError('')
    try {
      const signature = await canvasToSignature(canvas, 'drawn', 'Drawn signature')
      onCreate(signature)
      handleClear()
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'The signature could not be created.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleUseTyped() {
    if (!typedName.trim()) return
    setBusy(true)
    setError('')
    try {
      const signature = await createTypedSignature(typedName, typedStyle, color)
      onCreate(signature)
      setTypedName('')
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'The signature could not be created.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleUploaded(file: File) {
    setError('')
    if (!/^image\/(png|jpe?g)$/i.test(file.type)) {
      setError('Choose a PNG or JPG image for the signature.')
      return
    }
    const url = URL.createObjectURL(file)
    setUploaded({ url, file })
  }

  async function handleUseUploaded() {
    if (!uploaded) return
    setBusy(true)
    setError('')
    try {
      const signature = await createUploadedSignature(uploaded.file)
      onCreate(signature)
      setUploaded(null)
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'The signature could not be read.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sign-studio">
      <div className="sign-studio__tabs" role="tablist" aria-label="Create signature">
        {(
          [
            { id: 'draw', label: 'Draw' },
            { id: 'type', label: 'Type' },
            { id: 'upload', label: 'Upload' },
          ] as { id: StudioTab; label: string }[]
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`sign-studio__tab${tab === item.id ? ' sign-studio__tab--active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="sign-studio__body">
        {tab !== 'upload' ? (
          <div className="sign-studio__colors">
            <span className="sign-studio__label">Color</span>
            <div className="sign-studio__color-row">
              {SIGNATURE_COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-label={`Signature color ${swatch}`}
                  className={`sign-studio__color${
                    color === swatch ? ' sign-studio__color--active' : ''
                  }`}
                  style={{ backgroundColor: swatch }}
                  onClick={() => setColor(swatch)}
                />
              ))}
              <label
                className={`sign-studio__color-custom${
                  !SIGNATURE_COLORS.includes(color)
                    ? ' sign-studio__color-custom--active'
                    : ''
                }`}
              >
                <Icon name="swatch" size="sm" aria-hidden="true" />
                <span
                  className="sign-studio__color-custom-icon"
                  style={{ backgroundColor: color }}
                />
                <span className="sign-studio__color-custom-label">Custom</span>
                <input
                  type="color"
                  value={color}
                  aria-label="Custom signature color"
                  onChange={(event) => setColor(event.target.value)}
                />
              </label>
            </div>
          </div>
        ) : null}

        {tab === 'draw' ? (
          <div className="sign-studio__pad-wrap">
            <SignaturePad
              key={padKey}
              canvasRef={padCanvasRef}
              onStroke={setPadHasContent}
              color={color}
            />
            <div className="sign-studio__row">
              <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
                Clear
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!padHasContent || busy}
                onClick={() => void handleUseDrawn()}
              >
                Use signature
              </Button>
            </div>
          </div>
        ) : null}

        {tab === 'type' ? (
          <div className="sign-studio__type">
            <label className="field__label" htmlFor="sign-type-name">
              Name
            </label>
            <input
              id="sign-type-name"
              className="input"
              type="text"
              placeholder="Jane Doe"
              maxLength={60}
              value={typedName}
              onChange={(event) => setTypedName(event.target.value)}
            />
            <span className="sign-studio__label">Style</span>
            <div className="sign-studio__styles">
              {TYPED_SIGNATURE_STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  className={`sign-studio__style${
                    typedStyleId === style.id ? ' sign-studio__style--active' : ''
                  }`}
                  onClick={() => setTypedStyleId(style.id)}
                >
                  {style.label}
                </button>
              ))}
            </div>
            <div className="sign-studio__row">
              <Button
                type="button"
                size="sm"
                disabled={!typedName.trim() || busy}
                onClick={() => void handleUseTyped()}
              >
                Use signature
              </Button>
            </div>
          </div>
        ) : null}

        {tab === 'upload' ? (
          <div className="sign-studio__upload">
            {uploaded ? (
              <div className="sign-studio__upload-preview">
                <img src={uploaded.url} alt="Uploaded signature" />
              </div>
            ) : (
              <label className="sign-studio__file">
                <Icon name="upload" size="lg" aria-hidden="true" />
                <span>Choose a signature image</span>
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void handleUploaded(file)
                  }}
                />
              </label>
            )}
            <div className="sign-studio__row">
              {uploaded ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setUploaded(null)}
                  >
                    Remove
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => void handleUseUploaded()}
                  >
                    Use signature
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="organize-error" role="alert">
            <Icon name="alert-circle" size="sm" aria-hidden="true" />
            {error}
          </div>
        ) : null}
      </div>
    </div>
  )
}
