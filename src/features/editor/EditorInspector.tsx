/**
 * EditorInspector — contextual properties for the selected object, shown in
 * the right-side Inspector panel while editing. Replaces the style and
 * arrange controls that previously crowded the top toolbar.
 */
import type { ReactNode } from 'react'
import IconButton from '@/components/ui/IconButton'
import { Icon } from '@/components/icons/Icon'
import type { IconName } from '@/components/icons/Icon'
import { FONT_FAMILIES } from './elements'
import type { FontFamily, PdfElement, TextAlign } from './elements'
import { usePdfEditor } from './PdfEditorProvider'
import './editor.css'

const ALIGNMENTS: Array<{ value: TextAlign; icon: IconName; label: string }> = [
  { value: 'left', icon: 'align-left', label: 'Align left' },
  { value: 'center', icon: 'align-center', label: 'Align center' },
  { value: 'right', icon: 'align-right', label: 'Align right' },
]

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
}: {
  icon: IconName
  title: string
  hint: string
}) {
  return (
    <div className="editor-inspector__empty">
      <Icon name={icon} size="lg" />
      <p className="editor-inspector__empty-title">{title}</p>
      <p className="editor-inspector__empty-hint">{hint}</p>
    </div>
  )
}

export function EditorInspector() {
  const {
    editMode,
    elements,
    selectedElementIds,
    updateElement,
    moveElementToLayer,
  } = usePdfEditor()

  const selectedElements = elements.filter((element) =>
    selectedElementIds.includes(element.id),
  )
  const single = selectedElements.length === 1 ? selectedElements[0] : null
  const selectedText = single?.type === 'text' ? single : null
  const selectedShape = single?.type === 'shape' ? single : null
  const selectedImage = single?.type === 'image' ? single : null

  function patch(id: string, patch: Partial<PdfElement>) {
    void updateElement(id, patch)
  }

  if (!editMode) {
    return (
      <div className="editor-inspector">
        <InspectorEmpty
          icon="edit"
          title="Not editing"
          hint="Turn on Edit content to select and modify objects on the page."
        />
      </div>
    )
  }

  if (!single) {
    return (
      <div className="editor-inspector">
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
              : 'Select an object on the page to edit its properties here.'
          }
        />
      </div>
    )
  }

  return (
    <div className="editor-inspector">
      <p className="editor-inspector__summary">
        {single.type === 'text'
          ? 'Text'
          : single.type === 'image'
            ? 'Image'
            : 'Shape'}
        {' · '}
        {Math.round(single.x)}×{Math.round(single.y)} ·{' '}
        {Math.round(single.width)}×{Math.round(single.height)}pt
      </p>

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
          <Field label="Size">
            <input
              type="number"
              min={6}
              max={240}
              className="editor-inspector__input editor-inspector__input--number"
              value={selectedText.fontSize}
              onChange={(event) => {
                const size = Number(event.target.value)
                if (Number.isFinite(size) && size >= 1) {
                  patch(selectedText.id, { fontSize: Math.min(size, 240) })
                }
              }}
            />
          </Field>
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
            <Field label="Width">
              <input
                type="number"
                min={0}
                max={24}
                className="editor-inspector__input editor-inspector__input--number"
                value={selectedShape.strokeWidth}
                onChange={(event) => {
                  const width = Number(event.target.value)
                  if (Number.isFinite(width) && width >= 0) {
                    patch(selectedShape.id, {
                      strokeWidth: Math.min(width, 24),
                    })
                  }
                }}
              />
            </Field>
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
        </Section>
      )}

      <Section title="Arrange">
        <div className="editor-inspector__row">
          <button
            type="button"
            className="editor-inspector__button"
            onClick={() => void moveElementToLayer(single.id, 'forward')}
          >
            Forward
          </button>
          <button
            type="button"
            className="editor-inspector__button"
            onClick={() => void moveElementToLayer(single.id, 'backward')}
          >
            Backward
          </button>
        </div>
      </Section>
    </div>
  )
}
