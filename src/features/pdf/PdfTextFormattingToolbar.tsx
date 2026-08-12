import type { FocusEvent } from 'react'
import { PDF_EDITOR_FONTS, hexToPdfColor, pdfColorToHex } from './text-format'
import type {
  PdfEditorFontFamily,
  PdfEditorFontWeight,
  PdfTextFormat,
  PdfTextSelectionController,
} from './text-format'

interface PdfTextFormattingToolbarProps {
  selection: PdfTextSelectionController | null
  onChange: (changes: Partial<PdfTextFormat>) => void
  onReset: () => void
  onCommit: () => void
}

function numericValue(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function PdfTextFormattingToolbar({
  selection,
  onChange,
  onReset,
  onCommit,
}: PdfTextFormattingToolbarProps) {
  const format = selection?.format
  const disabled = !selection

  function handleToolbarBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget
    if (
      next instanceof HTMLElement &&
      next.closest('[data-pdf-text-format-toolbar], [data-text-item-index]')
    ) {
      return
    }
    onCommit()
  }

  return (
    <div
      className="pdf-format-toolbar"
      role="toolbar"
      aria-label="Text formatting"
      data-pdf-text-format-toolbar
      onBlurCapture={handleToolbarBlur}
    >
      <span className="pdf-format-toolbar__status" aria-live="polite">
        {selection ? selection.originalFontName : 'Select text to format'}
      </span>

      <label className="pdf-format-toolbar__field pdf-format-toolbar__field--font">
        <span className="visually-hidden">Font family</span>
        <select
          aria-label="Font family"
          value={format?.fontFamily ?? 'original'}
          disabled={disabled}
          onChange={(event) =>
            onChange({ fontFamily: event.target.value as PdfEditorFontFamily })
          }
        >
          <option value="original">Original PDF font</option>
          {PDF_EDITOR_FONTS.map((font) => (
            <option key={font.id} value={font.id}>
              {font.label}
            </option>
          ))}
        </select>
      </label>

      <label className="pdf-format-toolbar__field pdf-format-toolbar__field--number">
        <span className="pdf-format-toolbar__field-label">Size</span>
        <input
          type="number"
          min="4"
          max="144"
          step="0.5"
          inputMode="decimal"
          aria-label="Font size in points"
          value={format?.fontSize ?? ''}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              fontSize: Math.min(
                Math.max(
                  numericValue(event.target.value, format?.fontSize ?? 12),
                  4,
                ),
                144,
              ),
            })
          }
        />
        <span aria-hidden="true">pt</span>
      </label>

      <label className="pdf-format-toolbar__field pdf-format-toolbar__field--weight">
        <span className="visually-hidden">Font weight</span>
        <select
          aria-label="Font weight"
          value={format?.fontWeight ?? 400}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              fontWeight: Number(event.target.value) as PdfEditorFontWeight,
            })
          }
        >
          <option value="400">Regular</option>
          <option value="700">Bold</option>
        </select>
      </label>

      <button
        type="button"
        className="pdf-format-toolbar__toggle pdf-format-toolbar__toggle--italic"
        aria-label="Italic"
        title="Italic"
        aria-pressed={format?.italic ?? false}
        disabled={disabled}
        onClick={() => onChange({ italic: !format?.italic })}
      >
        I
      </button>
      <button
        type="button"
        className="pdf-format-toolbar__toggle pdf-format-toolbar__toggle--underline"
        aria-label="Underline"
        title="Underline"
        aria-pressed={format?.underline ?? false}
        disabled={disabled}
        onClick={() => onChange({ underline: !format?.underline })}
      >
        U
      </button>

      <label className="pdf-format-toolbar__field pdf-format-toolbar__field--number">
        <span className="pdf-format-toolbar__field-label">Spacing</span>
        <input
          type="number"
          min="-10"
          max="40"
          step="0.1"
          inputMode="decimal"
          aria-label="Letter spacing in points"
          value={format?.letterSpacing ?? ''}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              letterSpacing: Math.min(
                Math.max(
                  numericValue(event.target.value, format?.letterSpacing ?? 0),
                  -10,
                ),
                40,
              ),
            })
          }
        />
        <span aria-hidden="true">pt</span>
      </label>

      <label className="pdf-format-toolbar__color" title="Text color">
        <span className="visually-hidden">Text color</span>
        <input
          type="color"
          aria-label="Text color"
          value={format ? pdfColorToHex(format.color) : '#000000'}
          disabled={disabled}
          onChange={(event) =>
            onChange({ color: hexToPdfColor(event.target.value) })
          }
        />
      </label>

      <button
        type="button"
        className="pdf-format-toolbar__reset"
        disabled={disabled}
        onClick={onReset}
      >
        Reset format
      </button>
    </div>
  )
}
