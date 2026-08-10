import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { APP_NAME, LOGO_URL } from '@/config/app'
import Button from '@/components/ui/Button'
import { Icon } from '@/components/icons/Icon'
import type { IconName } from '@/components/icons/Icon'
import { useToast } from '@/components/ui'

/**
 * FRAME_FEATURES — the capabilities the framed collage advertises:
 * open, edit, convert, merge, keep private and organize.
 */
const FRAME_FEATURES: IconName[] = [
  'file-text',
  'scissors',
  'convert',
  'merge',
  'lock',
  'organize',
]

/**
 * HeroFrame — the hanging picture frame on the hero wall.
 *
 * It sways gently on its nail by default, swings wider on hover and
 * tilts in 3D toward the pointer. It is purely decorative, so the whole
 * assembly is hidden from assistive technology.
 */
function HeroFrame() {
  const tiltRef = useRef<HTMLDivElement>(null)

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const element = tiltRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const px = (event.clientX - rect.left) / rect.width - 0.5
    const py = (event.clientY - rect.top) / rect.height - 0.5
    element.style.setProperty('--tilt-y', `${(px * 8).toFixed(2)}deg`)
    element.style.setProperty('--tilt-x', `${(-py * 6).toFixed(2)}deg`)
  }

  function handlePointerLeave() {
    const element = tiltRef.current
    if (!element) return
    element.style.setProperty('--tilt-y', '0deg')
    element.style.setProperty('--tilt-x', '0deg')
  }

  return (
    <div className="home-hero__hanging">
      <span className="home-hero__nail" aria-hidden="true" />
      <div className="home-hero__swing">
        <div
          ref={tiltRef}
          className="home-hero__tilt"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        >
          <svg
            className="home-hero__wire"
            viewBox="0 0 100 60"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              className="home-hero__wire-line"
              d="M50 0 L18 60"
              pathLength="1"
            />
            <path
              className="home-hero__wire-line"
              d="M50 0 L82 60"
              pathLength="1"
            />
          </svg>
          <div className="home-hero__frame">
            <span className="home-hero__frame-glass" aria-hidden="true" />
            <div className="home-hero__frame-grid">
              {FRAME_FEATURES.map((name) => (
                <span key={name} className="home-hero__frame-cell">
                  <Icon name={name} size="lg" aria-hidden="true" />
                </span>
              ))}
            </div>
          </div>
          <p className="home-hero__plaque">{APP_NAME}</p>
        </div>
      </div>
    </div>
  )
}

/**
 * HeroSection — product identity, value proposition and the two primary
 * entry points of the landing experience, beside the hanging product frame.
 */
export default function HeroSection() {
  const { toast } = useToast()

  function handleUploadClick() {
    toast({
      title: 'Upload a document',
      description: 'Document upload arrives with the document workspace.',
      variant: 'info',
    })
  }

  return (
    <section className="home-hero" aria-labelledby="home-hero-title">
      <div className="home-hero__content">
        <span className="home-hero__brand">
          <img
            className="home-hero__logo-inline"
            src={LOGO_URL}
            alt=""
            width="20"
            height="24"
          />
          <span className="home-hero__eyebrow">{APP_NAME}</span>
        </span>

        <h1 id="home-hero-title" className="home-hero__title">
          The modern workspace for documents.
        </h1>

        <p className="home-hero__lede">
          Open, edit, convert and organize documents on your device — fast,
          private and offline-first.
        </p>

        <div className="home-hero__actions">
          <Button size="lg" onClick={handleUploadClick}>
            <Icon name="upload" size="sm" aria-hidden="true" />
            Upload a document
          </Button>
          <Link className="btn btn--outline btn--lg" to="/workspace">
            Open the Workspace
            <Icon name="arrow-right" size="sm" aria-hidden="true" />
          </Link>
        </div>

        <p className="home-hero__caption">
          Your documents stay on your device until you decide otherwise.
        </p>
      </div>

      <div className="home-hero__wall" aria-hidden="true">
        <img className="home-hero__wall-brand" src={LOGO_URL} alt="" />
        <HeroFrame />
      </div>
    </section>
  )
}
