import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@/components/icons/Icon'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { usePdfDocument } from '../stage/usePdfDocument'
import UploadDrop from '../organize/components/UploadDrop'
import OrganizeResult from '../organize/components/OrganizeResult'
import type { OrganizeOutput, PdfPreview } from '../organize/lib'
import { loadPdfPreview, revokePreview } from '../organize/lib'
import {
  applyWatermark,
  isValidWatermarkImage,
  parseWatermarkRange,
  POSITION_OPTIONS,
  STAMP_PRESETS,
  type WatermarkConfig,
  type WatermarkFont,
  type WatermarkImageSource,
  type WatermarkKind,
  type WatermarkPosition,
} from './watermark-lib'
import './watermark.css'

const POSITION_PERCENT: Record<
  WatermarkPosition,
  { left: string; top: string; transform: string }
> = {
  'top-left': { left: '3%', top: '3%', transform: 'translate(0, 0)' },
  'top-center': { left: '50%', top: '3%', transform: 'translate(-50%, 0)' },
  'top-right': { left: '97%', top: '3%', transform: 'translate(-100%, 0)' },
  'middle-left': { left: '3%', top: '50%', transform: 'translate(0, -50%)' },
  center: { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' },
  'middle-right': { left: '97%', top: '50%', transform: 'translate(-100%, -50%)' },
  'bottom-left': { left: '3%', top: '97%', transform: 'translate(0, -100%)' },
  'bottom-center': {
    left: '50%',
    top: '97%',
    transform: 'translate(-50%, -100%)',
  },
  'bottom-right': {
    left: '97%',
    top: '97%',
    transform: 'translate(-100%, -100%)',
  },
}

function PreviewOverlay({
  config,
  imageUrl,
}: {
  config: WatermarkConfig
  imageUrl: string | null
}) {
  const previewFontSize = Math.max(10, config.fontSize / 2)
  const style = POSITION_PERCENT[config.position]
  const imageStyle = {
    width: `${Math.max(30, (config.imageScale ?? 0.25) * 300)}px`,
    opacity: config.opacity,
  }
  const instance = (
    <span
      className="watermark-preview__item"
      style={{
        color: config.kind === 'image' ? undefined : config.color,
        fontSize: previewFontSize,
        opacity: config.opacity,
        transform: `rotate(${config.rotation}deg) ${config.tile ? '' : style.transform}`,
        left: style.left,
        top: style.top,
      }}
    >
      {config.kind === 'image' && imageUrl ? (
        <img src={imageUrl} alt="" style={imageStyle} />
      ) : (
        config.text
      )}
    </span>
  )

  if (!config.tile) {
    return (
      <div className="watermark-preview__overlay" aria-hidden="true">
        {instance}
      </div>
    )
  }

  const rows = Array.from({ length: 5 }, (_, y) =>
    Array.from({ length: 4 }, (_, x) => (
      <span
        key={`${x}-${y}`}
        className="watermark-preview__tile"
        style={{
          color: config.kind === 'image' ? undefined : config.color,
          fontSize: previewFontSize,
          opacity: config.opacity,
        }}
      >
        {config.kind === 'image' && imageUrl ? (
          <img src={imageUrl} alt="" style={imageStyle} />
        ) : (
          config.text
        )}
      </span>
    )),
  )

  return (
    <div className="watermark-preview__overlay watermark-preview__overlay--tile" aria-hidden="true">
      {rows}
    </div>
  )
}

export default function WatermarkTool() {
  const { session, loading, error, load, clear } = usePdfDocument()
  const [preview, setPreview] = useState<PdfPreview | null>(null)
  const [kind, setKind] = useState<WatermarkKind>('text')
  const [text, setText] = useState('CONFIDENTIAL')
  const [fontSize, setFontSize] = useState(48)
  const [color, setColor] = useState('#b91c1c')
  const [opacity, setOpacity] = useState(0.2)
  const [rotation, setRotation] = useState(315)
  const [position, setPosition] = useState<WatermarkPosition>('center')
  const [tile, setTile] = useState(false)
  const [fontFamily, setFontFamily] = useState<WatermarkFont>('helvetica')
  const [image, setImage] = useState<WatermarkImageSource | null>(null)
  const [imageScale, setImageScale] = useState(0.25)
  const [stampLabel, setStampLabel] = useState('APPROVED')
  const [pageMode, setPageMode] = useState<'all' | 'range' | 'selected'>('all')
  const [rangeText, setRangeText] = useState('')
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set())
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState('')
  const [output, setOutput] = useState<OrganizeOutput | null>(null)

  const pageCount = session?.pageCount ?? 0

  useEffect(() => {
    setPreview((current) => {
      if (current) revokePreview(current)
      return null
    })
    setOutput(null)
    setApplyError('')
  }, [session])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    void loadPdfPreview(session.file, true).then((loaded) => {
      if (!cancelled) setPreview(loaded)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  useEffect(
    () => () => {
      if (preview) revokePreview(preview)
    },
    [preview],
  )

  const stampPreset = STAMP_PRESETS.find((stamp) => stamp.label === stampLabel)
  const stampColor = stampPreset?.color ?? '#b91c1c'

  const imageUrl = useMemo(
    () => (image ? URL.createObjectURL(new Blob([image.bytes as unknown as BlobPart])) : null),
    [image],
  )

  useEffect(
    () => () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl)
    },
    [imageUrl],
  )

  const config: WatermarkConfig = {
    kind,
    text: kind === 'stamp' ? stampLabel : text,
    fontSize,
    color: kind === 'stamp' ? stampColor : color,
    opacity,
    rotation,
    position,
    tile,
    fontFamily,
    image: kind === 'image' && image ? image : undefined,
    imageScale,
  }

  function resolveTargetPages(): number[] {
    if (pageMode === 'range') return parseWatermarkRange(rangeText, pageCount)
    if (pageMode === 'selected') {
      return Array.from(selectedPages).sort((a, b) => a - b)
    }
    return Array.from({ length: pageCount }, (_, index) => index)
  }

  const targetCount = resolveTargetPages().length

  function togglePage(index: number) {
    setSelectedPages((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  async function handleApply() {
    if (!session) return
    if (targetCount === 0) {
      setApplyError('No pages are selected for the watermark.')
      return
    }
    if (kind === 'image' && !image) {
      setApplyError('Upload a PNG or JPEG image to use as the watermark.')
      return
    }
    setApplying(true)
    setApplyError('')
    try {
      const result = await applyWatermark(
        session.bytes,
        config,
        resolveTargetPages(),
      )
      const baseName = session.file.name.replace(/\.pdf$/i, '') || 'document'
      setOutput({
        filename: `${baseName}-watermarked.pdf`,
        bytes: result.bytes,
        pages: result.pageCount,
      })
    } catch (reason) {
      setApplyError(
        reason instanceof Error
          ? reason.message
          : 'The watermark could not be applied.',
      )
    } finally {
      setApplying(false)
    }
  }

  async function handleImageFile(file: File) {
    if (!isValidWatermarkImage(file.type)) {
      setApplyError('Watermark images must be PNG or JPEG.')
      return
    }
    setApplyError('')
    setImage({
      bytes: new Uint8Array(await file.arrayBuffer()),
      mime: file.type,
    })
  }

  if (output) {
    return (
      <OrganizeResult
        outputs={[output]}
        warnings={[
          'The watermark is drawn above the page content. Layering behind content is not supported by the PDF engine, so it is not claimed.',
        ]}
        onStartAnother={() => {
          setOutput(null)
          clear()
        }}
      />
    )
  }

  if (!session) {
    return (
      <div className="organize-workflow">
        <section className="organize-section">
          <div className="organize-section__heading">
            <h2>Upload PDF</h2>
            <p>
              Add a watermark or stamp to your document. Everything runs
              locally — the file is never uploaded.
            </p>
          </div>
          <UploadDrop
            title="Drag & drop a PDF here"
            subtitle="Text, image and stamp watermarks are all applied in your browser."
            accept=".pdf,application/pdf"
            onFiles={(files) => {
              const pdf = files.find(
                (file) =>
                  file.type === 'application/pdf' ||
                  file.name.toLowerCase().endsWith('.pdf'),
              )
              if (pdf) load(pdf)
            }}
          />
        </section>
        {error ? (
          <div className="organize-error" role="alert">
            <Icon name="alert-circle" size="sm" aria-hidden="true" />
            {error}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="organize-workflow watermark-workflow">
      <section className="organize-section">
        <div className="organize-section__heading">
          <h2>Watermark setup</h2>
          <p>
            Choose what to add and where. The preview is an approximation —
            the actual watermark is drawn into the exported PDF.
          </p>
        </div>

        <div className="watermark-kind" role="tablist" aria-label="Watermark type">
          {(
            [
              ['text', 'Text'],
              ['image', 'Image'],
              ['stamp', 'Stamp'],
            ] as Array<[WatermarkKind, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={kind === value}
              className={kind === value ? 'is-active' : ''}
              onClick={() => setKind(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {kind === 'stamp' ? (
          <div className="watermark-stamps">
            {STAMP_PRESETS.map((stamp) => (
              <button
                key={stamp.label}
                type="button"
                className={`watermark-stamps__chip${stampLabel === stamp.label ? ' is-active' : ''}`}
                style={{ borderColor: stamp.color }}
                onClick={() => setStampLabel(stamp.label)}
                aria-pressed={stampLabel === stamp.label}
              >
                {stamp.label}
              </button>
            ))}
          </div>
        ) : null}

        {kind === 'image' ? (
          <div className="watermark-image">
            {image ? (
              <div className="watermark-image__loaded">
                <img
                  src={URL.createObjectURL(new Blob([image.bytes as unknown as BlobPart]))}
                  alt="Watermark image"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setImage(null)}
                >
                  Remove image
                </Button>
              </div>
            ) : (
              <label className="watermark-image__drop">
                <Icon name="image" size="md" aria-hidden="true" />
                <span>Upload PNG or JPEG image</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="visually-hidden"
                  onChange={(event) => {
                    const picked = event.target.files?.[0]
                    if (picked) void handleImageFile(picked)
                    event.target.value = ''
                  }}
                />
              </label>
            )}
          </div>
        ) : null}

        <div className="watermark-options">
          {kind === 'text' ? (
            <label className="watermark-options__field">
              <span>Watermark text</span>
              <input
                type="text"
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </label>
          ) : null}

          {kind === 'text' || kind === 'stamp' ? (
            <label className="watermark-options__field">
              <span>Font size ({fontSize}pt)</span>
              <input
                type="range"
                min={8}
                max={160}
                value={fontSize}
                onChange={(event) => setFontSize(Number(event.target.value))}
              />
            </label>
          ) : null}

          {kind === 'text' ? (
            <>
              <label className="watermark-options__field">
                <span>Color</span>
                <input
                  type="color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                />
              </label>
              <label className="watermark-options__field">
                <span>Font</span>
                <select
                  value={fontFamily}
                  onChange={(event) =>
                    setFontFamily(event.target.value as WatermarkFont)
                  }
                >
                  <option value="helvetica">Helvetica</option>
                  <option value="times">Times</option>
                  <option value="courier">Courier</option>
                </select>
              </label>
            </>
          ) : null}

          {kind === 'image' ? (
            <label className="watermark-options__field">
              <span>Scale ({Math.round(imageScale * 100)}% of page width)</span>
              <input
                type="range"
                min={0.05}
                max={0.8}
                step={0.01}
                value={imageScale}
                onChange={(event) => setImageScale(Number(event.target.value))}
              />
            </label>
          ) : null}

          <label className="watermark-options__field">
            <span>Opacity ({Math.round(opacity * 100)}%)</span>
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(event) => setOpacity(Number(event.target.value))}
            />
          </label>

          <label className="watermark-options__field">
            <span>Rotation ({rotation}°)</span>
            <input
              type="range"
              min={0}
              max={360}
              step={5}
              value={rotation}
              onChange={(event) => setRotation(Number(event.target.value))}
            />
          </label>

          <label className="watermark-options__field">
            <span>Position</span>
            <select
              value={position}
              onChange={(event) =>
                setPosition(event.target.value as WatermarkPosition)
              }
              disabled={tile}
            >
              {POSITION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="watermark-options__check">
            <input
              type="checkbox"
              checked={tile}
              onChange={(event) => setTile(event.target.checked)}
            />
            <span>Repeat across the page</span>
          </label>
        </div>

        <div className="watermark-scope">
          <h3>Apply to</h3>
          <div className="watermark-scope__modes">
            <button
              type="button"
              className={pageMode === 'all' ? 'is-active' : ''}
              onClick={() => setPageMode('all')}
            >
              All pages
            </button>
            <button
              type="button"
              className={pageMode === 'range' ? 'is-active' : ''}
              onClick={() => setPageMode('range')}
            >
              Page range
            </button>
            <button
              type="button"
              className={pageMode === 'selected' ? 'is-active' : ''}
              onClick={() => setPageMode('selected')}
            >
              Select pages
            </button>
          </div>
          <p className="watermark-scope__summary">
            {targetCount} of {pageCount} page{pageCount === 1 ? '' : 's'} will
            receive the watermark.
          </p>

          {pageMode === 'range' ? (
            <label className="watermark-scope__range">
              <span>Page range (e.g. 1-3,5,7)</span>
              <input
                type="text"
                value={rangeText}
                placeholder="1-3,5,7"
                onChange={(event) => setRangeText(event.target.value)}
              />
            </label>
          ) : null}

          {pageMode === 'selected' ? (
            <div className="watermark-scope__pages">
              {Array.from({ length: pageCount }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  className={selectedPages.has(index) ? 'is-active' : ''}
                  onClick={() => togglePage(index)}
                  aria-pressed={selectedPages.has(index)}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {preview && !loading ? (
          <div className="watermark-preview">
            <h3>Preview</h3>
            <div className="watermark-preview__stage">
              <img
                className="watermark-preview__page"
                src={preview.urls[0]}
                alt="First page preview"
              />
              <PreviewOverlay config={config} imageUrl={imageUrl} />
            </div>
          </div>
        ) : null}
      </section>

      {applyError ? (
        <div className="organize-error" role="alert">
          <Icon name="alert-circle" size="sm" aria-hidden="true" />
          {applyError}
        </div>
      ) : null}

      <section className="organize-section">
        <div className="organize-actions">
          <Button
            size="lg"
            disabled={
              applying ||
              targetCount === 0 ||
              (kind === 'image' && !image)
            }
            onClick={() => void handleApply()}
          >
            {applying ? <Spinner size="sm" label="Applying watermark" /> : null}
            {applying ? 'Applying…' : 'Apply watermark'}
          </Button>
          <span className="organize-hint">
            {loading
              ? 'Reading the document…'
              : 'Produces a new PDF — the original is never modified.'}
          </span>
        </div>
      </section>
    </div>
  )
}