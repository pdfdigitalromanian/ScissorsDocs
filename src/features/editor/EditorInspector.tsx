/**
 * EditorInspector — contextual properties for the selected object or page,
 * shown in the right-side Inspector panel while editing. Replaces the style
 * and arrange controls that previously crowded the top toolbar.
 *
 * The Inspector is contextual:
 *  - one element selected  → element properties (text / image / shape)
 *  - one page selected     → page properties (size, orientation, actions)
 *  - nothing selected      → a clean empty/document state
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import { Icon } from '@/components/icons/Icon'
import type { IconName } from '@/components/icons/Icon'
import { useToast } from '@/components/ui'
import { downloadBlob } from '@/features/documents'
import { useSettings } from '@/features/settings/SettingsProvider'
import { convertPtToUnit, convertUnitToPt } from '@/features/settings/store'
import type { MeasurementUnit } from '@/features/settings/store'
import {
  FONT_FAMILIES,
  normalizeRotation,
} from './elements'
import type { FontFamily, PdfElement, TextAlign } from './elements'
import type { EditorPage } from './model'
import { usePdfEditor } from './PdfEditorProvider'
import { ConfirmDialog } from './components/ConfirmDialog'
import { PdfTextFormattingToolbar } from '@/features/pdf/PdfTextFormattingToolbar'
import { usePdfSession } from '@/features/pdf/PdfSessionProvider'
import './editor.css'

const ALIGNMENTS: Array<{ value: TextAlign; icon: IconName; label: string }> = [
  { value: 'left', icon: 'align-left', label: 'Align left' },
  { value: 'center', icon: 'align-center', label: 'Align center' },
  { value: 'right', icon: 'align-right', label: 'Align right' },
]

/** Page size presets in PDF points (portrait orientation). */
const PAGE_PRESETS: Array<{
  label: string
  width: number
  height: number
}> = [
  { label: 'A4', width: 595.28, height: 841.89 },
  { label: 'A3', width: 841.89, height: 1190.55 },
  { label: 'A5', width: 419.53, height: 595.28 },
  { label: 'Letter', width: 612, height: 792 },
  { label: 'Legal', width: 612, height: 1008 },
]

const UNIT_SUFFIX: Record<MeasurementUnit, string> = {
  pt: 'pt',
  in: 'in',
  cm: 'cm',
  mm: 'mm',
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="editor-inspector__section">
      <h4 className="editor-inspector__section-title">{title}</h4>
      {children}
    </section>
  )
}

function Field({
  label,
  children,
  grow = false,
  className = '',
}: {
  label: string
  children: ReactNode
  grow?: boolean
  className?: string
}) {
  const classes = [
    'editor-inspector__field',
    grow ? 'editor-inspector__field--grow' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <label className={classes}>
      <span className="editor-inspector__field-label">{label}</span>
      {children}
    </label>
  )
}

function InspectorEmpty({
  icon,
  title,
  hint,
  actions,
}: {
  icon: IconName
  title: string
  hint: string
  actions?: ReactNode
}) {
  return (
    <div className="editor-inspector__empty">
      <Icon name={icon} size="lg" />
      <p className="editor-inspector__empty-title">{title}</p>
      <p className="editor-inspector__empty-hint">{hint}</p>
      {actions && (
        <div className="editor-inspector__empty-actions">{actions}</div>
      )}
    </div>
  )
}

/** Rounds to two decimals for stable display. */
function formatValue(value: number): number {
  return Math.round(value * 100) / 100
}

interface NumberFieldProps {
  label: string
  value: number
  suffix?: string
  min?: number
  max?: number
  step?: number
  grow?: boolean
  onChange: (value: number) => void
}

function NumberField({
  label,
  value,
  suffix,
  min = 0,
  max = 999999,
  step = 1,
  grow = false,
  onChange,
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <Field label={label} grow={grow}>
      <div className="editor-inspector__number">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          className="editor-inspector__input editor-inspector__input--number"
          value={draft ?? formatValue(value)}
          onChange={(event) => {
            const next = event.target.valueAsNumber
            if (Number.isNaN(next)) {
              setDraft(event.target.value)
            } else {
              setDraft(null)
              onChange(Math.min(Math.max(next, min), max))
            }
          }}
          onBlur={() => setDraft(null)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur()
            }
          }}
        />
        {suffix && <span className="editor-inspector__suffix">{suffix}</span>}
      </div>
    </Field>
  )
}

function PositionSizeSection({
  element,
  units,
  onPatch,
}: {
  element: PdfElement
  units: MeasurementUnit
  onPatch: (patch: Partial<PdfElement>) => void
}) {
  const toUnit = (points: number) => convertPtToUnit(points, units)
  const toPoints = (value: number) => convertUnitToPt(value, units)

  const patchSize = (patch: { width?: number; height?: number }) => {
    const next = { ...patch }
    if (
      element.type === 'image' &&
      element.lockAspect &&
      element.width > 0 &&
      element.height > 0
    ) {
      const ratio = element.height / element.width
      if (next.width !== undefined && next.height === undefined) {
        next.height = Math.round(next.width * ratio * 100) / 100
      }
      if (next.height !== undefined && next.width === undefined) {
        next.width = Math.round((next.height / ratio) * 100) / 100
      }
    }
    onPatch(next)
  }

  return (
    <Section title="Position & size">
      <div className="editor-inspector__row">
        <NumberField
          label="X"
          value={toUnit(element.x)}
          suffix={UNIT_SUFFIX[units]}
          grow
          onChange={(value) => onPatch({ x: toPoints(value) })}
        />
        <NumberField
          label="Y"
          value={toUnit(element.y)}
          suffix={UNIT_SUFFIX[units]}
          grow
          onChange={(value) => onPatch({ y: toPoints(value) })}
        />
      </div>
      <div className="editor-inspector__row">
        <NumberField
          label="Width"
          value={toUnit(element.width)}
          suffix={UNIT_SUFFIX[units]}
          min={1}
          grow
          onChange={(value) => patchSize({ width: toPoints(value) })}
        />
        <NumberField
          label="Height"
          value={toUnit(element.height)}
          suffix={UNIT_SUFFIX[units]}
          min={1}
          grow
          onChange={(value) => patchSize({ height: toPoints(value) })}
        />
      </div>
      <div className="editor-inspector__row">
        <NumberField
          label="Rotation"
          value={normalizeRotation(element.rotation)}
          suffix="°"
          min={0}
          max={360}
          grow
          onChange={(value) => onPatch({ rotation: normalizeRotation(value) })}
        />
        <div className="editor-inspector__row">
          <IconButton
            icon="rotate"
            label="Rotate 90° counter-clockwise"
            iconSize="sm"
            className="editor-inspector__icon-flip"
            onClick={() =>
              onPatch({ rotation: normalizeRotation(element.rotation - 90) })
            }
          />
          <IconButton
            icon="rotate"
            label="Rotate 90° clockwise"
            iconSize="sm"
            onClick={() =>
              onPatch({ rotation: normalizeRotation(element.rotation + 90) })
            }
          />
        </div>
      </div>
      <Field label="Opacity">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          className="editor-inspector__range"
          value={Math.round((element.opacity ?? 1) * 100)}
          onChange={(event) =>
            onPatch({ opacity: Number(event.target.value) / 100 })
          }
        />
      </Field>
    </Section>
  )
}

function ArrangeSection({
  elementId,
  onDuplicate,
  onDelete,
}: {
  elementId: string
  onDuplicate: () => void
  onDelete: () => void
}) {
  const { moveElementToLayer } = usePdfEditor()
  return (
    <Section title="Arrange">
      <div className="editor-inspector__row">
        <button
          type="button"
          className="editor-inspector__button"
          onClick={() => void moveElementToLayer(elementId, 'front')}
        >
          To front
        </button>
        <button
          type="button"
          className="editor-inspector__button"
          onClick={() => void moveElementToLayer(elementId, 'back')}
        >
          To back
        </button>
      </div>
      <div className="editor-inspector__row">
        <button
          type="button"
          className="editor-inspector__button"
          onClick={onDuplicate}
        >
          Duplicate
        </button>
        <button
          type="button"
          className="editor-inspector__button editor-inspector__button--danger"
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </Section>
  )
}

function PageInspector({ page }: { page: EditorPage }) {
  const {
    pages,
    rotateSelected,
    duplicateSelected,
    moveSelectedBy,
    extractSelected,
    resizePage,
    deleteSelected,
  } = usePdfEditor()
  const { settings } = useSettings()
  const { toast } = useToast()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const units = settings.editor.units
  const unit = UNIT_SUFFIX[units]
  const pageNumber = page.index + 1
  const isLandscape = page.width > page.height
  const canMoveUp = page.index > 0
  const canMoveDown = page.index < pages.length - 1

  const resizeWidth = (value: number) =>
    void resizePage(page.id, Math.max(1, value), page.height)
  const resizeHeight = (value: number) =>
    void resizePage(page.id, page.width, Math.max(1, value))

  const applyPreset = (label: string) => {
    const preset = PAGE_PRESETS.find((item) => item.label === label)
    if (!preset) return
    const presetLandscape = preset.width > preset.height
    const width = isLandscape !== presetLandscape ? preset.height : preset.width
    const height = isLandscape !== presetLandscape ? preset.width : preset.height
    void resizePage(page.id, width, height)
  }

  const applyOrientation = (orientation: 'portrait' | 'landscape') => {
    const landscape = orientation === 'landscape'
    if (isLandscape === landscape) return
    void resizePage(page.id, page.height, page.width)
  }

  const handleExtract = async () => {
    const output = await extractSelected()
    if (!output) return
    downloadBlob(
      new Blob([output.bytes as BlobPart], { type: 'application/pdf' }),
      output.name,
    )
    toast({
      title: 'Page extracted',
      description: `Page ${pageNumber} saved as "${output.name}".`,
      variant: 'success',
    })
  }

  return (
    <>
      <p className="editor-inspector__summary">
        Page {pageNumber} · {formatValue(convertPtToUnit(page.width, units))}×
        {formatValue(convertPtToUnit(page.height, units))}
        {unit}
      </p>

      <Section title="Page size">
        <div className="editor-inspector__row">
          <NumberField
            label="Width"
            value={convertPtToUnit(page.width, units)}
            suffix={unit}
            min={1}
            grow
            onChange={(value) => resizeWidth(convertUnitToPt(value, units))}
          />
          <NumberField
            label="Height"
            value={convertPtToUnit(page.height, units)}
            suffix={unit}
            min={1}
            grow
            onChange={(value) => resizeHeight(convertUnitToPt(value, units))}
          />
        </div>
        <Field label="Size preset" grow>
          <select
            className="editor-inspector__input"
            value=""
            onChange={(event) => {
              applyPreset(event.target.value)
            }}
          >
            <option value="" disabled>
              Choose a preset…
            </option>
            {PAGE_PRESETS.map((preset) => (
              <option key={preset.label} value={preset.label}>
                {preset.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="editor-inspector__row">
          <button
            type="button"
            className="editor-inspector__button"
            aria-pressed={!isLandscape}
            onClick={() => applyOrientation('portrait')}
          >
            Portrait
          </button>
          <button
            type="button"
            className="editor-inspector__button"
            aria-pressed={isLandscape}
            onClick={() => applyOrientation('landscape')}
          >
            Landscape
          </button>
        </div>
      </Section>

      <Section title="Page actions">
        <div className="editor-inspector__row">
          <button
            type="button"
            className="editor-inspector__button"
            disabled={!canMoveUp}
            onClick={() => void moveSelectedBy(-1)}
          >
            Move up
          </button>
          <button
            type="button"
            className="editor-inspector__button"
            disabled={!canMoveDown}
            onClick={() => void moveSelectedBy(1)}
          >
            Move down
          </button>
        </div>
        <div className="editor-inspector__row">
          <IconButton
            icon="rotate"
            label="Rotate counter-clockwise"
            iconSize="sm"
            className="editor-inspector__icon-flip"
            onClick={() => void rotateSelected('counter-clockwise')}
          />
          <IconButton
            icon="rotate"
            label="Rotate clockwise"
            iconSize="sm"
            onClick={() => void rotateSelected('clockwise')}
          />
          <IconButton
            icon="copy"
            label="Duplicate page"
            iconSize="sm"
            onClick={() => void duplicateSelected()}
          />
          <IconButton
            icon="scissors"
            label="Extract page"
            iconSize="sm"
            onClick={() => void handleExtract()}
          />
          <IconButton
            icon="trash"
            label="Delete page"
            iconSize="sm"
            onClick={() => setConfirmDelete(true)}
          />
        </div>
      </Section>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this page?"
        description={`Page ${pageNumber} will be removed from the document.`}
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmDelete(false)
          void deleteSelected()
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  )
}

export function EditorInspector() {
  const {
    editMode,
    setEditMode,
    elements,
    selectedElementIds,
    selectedPageIds,
    pages,
    updateElement,
    duplicateElements,
    deleteElements,
    clearElementSelection,
  } = usePdfEditor()
  const { settings } = useSettings()
  const session = usePdfSession()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const units = settings.editor.units

  const selectedElements = elements.filter((element) =>
    selectedElementIds.includes(element.id),
  )
  const single = selectedElements.length === 1 ? selectedElements[0] : null
  const selectedText = single?.type === 'text' ? single : null
  const selectedShape = single?.type === 'shape' ? single : null
  const selectedImage = single?.type === 'image' ? single : null

  const singlePage = selectedPageIds.length === 1
    ? pages.find((page) => page.id === selectedPageIds[0]) ?? null
    : null

  function patch(id: string, patch: Partial<PdfElement>) {
    void updateElement(id, patch)
  }

  const textFormattingToolbar = session.textEditing ? (
    <PdfTextFormattingToolbar
      selection={session.textSelection}
      onChange={session.applyTextFormat}
      onReset={session.resetTextFormat}
      onCommit={session.commitTextSelection}
    />
  ) : null

  let body: ReactNode

  if (!editMode) {
    const editingText = session.textEditing
    body = (
      <InspectorEmpty
        icon={editingText ? 'text' : 'edit'}
        title={editingText ? 'Editing PDF text' : 'Not editing'}
        hint={
          editingText
            ? 'Click any text on the page to edit it, or select formatted text to change its properties above.'
            : 'Turn on Edit content to select and modify objects on the page.'
        }
        actions={
          <>
            <Button
              variant="outline"
              size="lg"
              className="editor-inspector__empty-button"
              aria-pressed={editingText}
              onClick={() => {
                if (editingText) {
                  session.commitTextSelection()
                  session.setTextEditing(false)
                } else {
                  setEditMode(false)
                  session.setTextEditing(true)
                }
              }}
            >
              Edit text
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="editor-inspector__empty-button"
              disabled={editingText}
              onClick={() => {
                session.setTextEditing(false)
                setEditMode(true)
              }}
            >
              Edit content
            </Button>
          </>
        }
      />
    )
  } else if (!single && singlePage) {
    body = <PageInspector page={singlePage} />
  } else if (!single) {
    body = (
      <InspectorEmpty
        icon="pointer"
        title={
          selectedElements.length > 0
            ? `${selectedElements.length} objects selected`
            : 'Nothing selected'
        }
        hint={
          selectedElements.length > 0
            ? 'Select a single object to edit its properties.'
            : 'Select an object on the page, or a page in the Pages panel, to edit its properties here.'
        }
      />
    )
  } else {
    body = (
      <>
        <p className="editor-inspector__summary">
          {single.type === 'text'
            ? 'Text'
            : single.type === 'image'
              ? 'Image'
              : 'Shape'}
          {' · '}
          {formatValue(convertPtToUnit(single.x, units))}×
          {formatValue(convertPtToUnit(single.y, units))}
          {UNIT_SUFFIX[units]}
        </p>

        <PositionSizeSection
          element={single}
          units={units}
          onPatch={(elementPatch) => patch(single.id, elementPatch)}
        />

        {selectedText && (
          <Section title="Text">
            <Field label="Font family" grow>
              <select
                className="editor-inspector__input"
                value={selectedText.fontFamily}
                onChange={(event) =>
                  patch(selectedText.id, {
                    fontFamily: event.target.value as FontFamily,
                  })
                }
              >
                {FONT_FAMILIES.map((family) => (
                  <option key={family} value={family}>
                    {family}
                  </option>
                ))}
              </select>
            </Field>
            <div className="editor-inspector__row">
              <NumberField
                label="Size"
                value={selectedText.fontSize}
                suffix="pt"
                min={1}
                max={240}
                grow
                onChange={(value) =>
                  patch(selectedText.id, { fontSize: Math.min(value, 240) })
                }
              />
              <NumberField
                label="Line spacing"
                value={selectedText.lineHeight ?? 1.25}
                min={0.5}
                max={4}
                step={0.05}
                grow
                onChange={(value) => patch(selectedText.id, { lineHeight: value })}
              />
            </div>
            <div className="editor-inspector__row">
              <IconButton
                icon="bold"
                label="Bold"
                iconSize="sm"
                aria-pressed={selectedText.bold}
                onClick={() =>
                  patch(selectedText.id, { bold: !selectedText.bold })
                }
              />
              <IconButton
                icon="italic"
                label="Italic"
                iconSize="sm"
                aria-pressed={selectedText.italic}
                onClick={() =>
                  patch(selectedText.id, { italic: !selectedText.italic })
                }
              />
              <span className="editor-inspector__divider" />
              {ALIGNMENTS.map(({ value, icon, label }) => (
                <IconButton
                  key={value}
                  icon={icon}
                  label={label}
                  iconSize="sm"
                  aria-pressed={selectedText.alignment === value}
                  onClick={() => patch(selectedText.id, { alignment: value })}
                />
              ))}
            </div>
            <Field label="Text color" className="editor-inspector__field--color">
              <input
                type="color"
                className="editor-inspector__color"
                value={selectedText.color}
                onChange={(event) =>
                  patch(selectedText.id, { color: event.target.value })
                }
              />
            </Field>
          </Section>
        )}

        {selectedShape && (
          <Section title="Fill & stroke">
            <div className="editor-inspector__row">
              <Field label="Stroke">
                <input
                  type="color"
                  className="editor-inspector__color"
                  value={selectedShape.strokeColor}
                  onChange={(event) =>
                    patch(selectedShape.id, { strokeColor: event.target.value })
                  }
                />
              </Field>
              <NumberField
                label="Stroke width"
                value={selectedShape.strokeWidth}
                min={0}
                max={24}
                grow
                onChange={(value) =>
                  patch(selectedShape.id, { strokeWidth: Math.min(value, 24) })
                }
              />
            </div>
            <div className="editor-inspector__row">
              <Field label="Fill">
                <input
                  type="color"
                  className="editor-inspector__color"
                  value={selectedShape.fillColor ?? '#000000'}
                  onChange={(event) =>
                    patch(selectedShape.id, { fillColor: event.target.value })
                  }
                />
              </Field>
              <button
                type="button"
                className="editor-inspector__toggle"
                aria-pressed={selectedShape.fillColor === null}
                onClick={() =>
                  patch(selectedShape.id, {
                    fillColor:
                      selectedShape.fillColor === null ? '#ffffff' : null,
                  })
                }
              >
                {selectedShape.fillColor === null ? 'No fill' : 'Has fill'}
              </button>
            </div>
            {selectedShape.shape === 'rect' && (
              <NumberField
                label="Corner radius"
                value={selectedShape.cornerRadius ?? 0}
                min={0}
                max={200}
                grow
                onChange={(value) =>
                  patch(selectedShape.id, { cornerRadius: value })
                }
              />
            )}
          </Section>
        )}

        {selectedImage && (
          <Section title="Image">
            <Field label="File name" grow>
              <span
                className="editor-inspector__readonly"
                title={selectedImage.name}
              >
                {selectedImage.name}
              </span>
            </Field>
            <div className="editor-inspector__row">
              <button
                type="button"
                className="editor-inspector__toggle"
                aria-pressed={selectedImage.lockAspect !== false}
                onClick={() =>
                  patch(selectedImage.id, {
                    lockAspect: selectedImage.lockAspect === false,
                  })
                }
              >
                {selectedImage.lockAspect !== false
                  ? 'Aspect ratio locked'
                  : 'Aspect ratio free'}
              </button>
            </div>
          </Section>
        )}

        <ArrangeSection
          elementId={single.id}
          onDuplicate={() => void duplicateElements([single.id])}
          onDelete={() => setConfirmDelete(true)}
        />

        <ConfirmDialog
          open={confirmDelete}
          title="Delete this object?"
          description={`The ${
            single.type === 'text'
              ? 'text'
              : single.type === 'image'
                ? 'image'
                : 'shape'
          } will be removed from the document.`}
          confirmLabel="Delete"
          onConfirm={() => {
            setConfirmDelete(false)
            void deleteElements([single.id])
            clearElementSelection()
          }}
          onClose={() => setConfirmDelete(false)}
        />
      </>
    )
  }

  return (
    <div className="editor-inspector">
      {textFormattingToolbar}
      {body}
    </div>
  )
}
