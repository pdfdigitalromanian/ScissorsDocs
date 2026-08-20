import { useMemo, useState } from 'react'
import { Icon } from '@/components/icons/Icon'
import Button from '@/components/ui/Button'
import { parsePageRanges } from '../../local/lib/image'
import type { PdfPreview } from '../lib'

interface PagePickerProps {
  preview: PdfPreview
  selected: Set<number>
  onSelectedChange: (next: Set<number>) => void
  /** Message shown when fewer pages than this are selected. */
  minSelected?: number
}

/**
 * PagePicker renders a multi-select thumbnail grid of a PDF's pages with
 * select-all / clear actions and a page-range text input ("1-3,5").
 */
export default function PagePicker({
  preview,
  selected,
  onSelectedChange,
  minSelected = 1,
}: PagePickerProps) {
  const [rangeText, setRangeText] = useState('')
  const [rangeError, setRangeError] = useState('')

  const allSelected = selected.size === preview.pageCount

  const toggle = (index: number) => {
    const next = new Set(selected)
    if (next.has(index)) {
      next.delete(index)
    } else {
      next.add(index)
    }
    onSelectedChange(next)
  }

  const selectAll = () => {
    onSelectedChange(
      new Set(Array.from({ length: preview.pageCount }, (_, i) => i)),
    )
  }

  const clear = () => onSelectedChange(new Set())

  const applyRange = () => {
    const pages = parsePageRanges(rangeText, preview.pageCount)
    if (pages.length === 0) {
      setRangeError('No valid pages matched. Try something like 1-3, 5.')
      return
    }
    setRangeText('')
    setRangeError('')
    const next = new Set(selected)
    for (const page of pages) next.add(page - 1)
    onSelectedChange(next)
  }

  const items = useMemo(
    () =>
      Array.from({ length: preview.pageCount }, (_, index) => (
        <button
          key={index}
          type="button"
          className={`organize-page${
            selected.has(index) ? ' organize-page--selected' : ''
          }`}
          aria-pressed={selected.has(index)}
          aria-label={`Page ${index + 1}${selected.has(index) ? ', selected' : ''}`}
          onClick={() => toggle(index)}
        >
          <img src={preview.urls[index]} alt={`Preview of page ${index + 1}`} />
          <span className="organize-page__badge">{index + 1}</span>
          {selected.has(index) ? (
            <span className="organize-page__check" aria-hidden="true">
              <Icon name="check-circle" size="sm" />
            </span>
          ) : null}
        </button>
      )),
    [preview, selected],
  )

  const hint =
    selected.size === 0
      ? `Select at least ${minSelected} page${minSelected === 1 ? '' : 's'}`
      : `${selected.size} page${selected.size === 1 ? '' : 's'} selected`

  return (
    <div className="organize-picker">
      <div className="organize-picker__toolbar">
        <div className="organize-picker__range">
          <label className="field__label" htmlFor="organize-range">
            Select pages
          </label>
          <div className="organize-picker__range-row">
            <input
              id="organize-range"
              className="input"
              placeholder="1-3, 5"
              value={rangeText}
              onChange={(event) => {
                setRangeText(event.target.value)
                setRangeError('')
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  applyRange()
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={applyRange}
            >
              Add
            </Button>
          </div>
          {rangeError ? (
            <span className="field__error" role="alert">
              {rangeError}
            </span>
          ) : null}
        </div>
        <div className="organize-picker__actions">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={allSelected}
            onClick={selectAll}
          >
            Select all
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={selected.size === 0}
            onClick={clear}
          >
            Clear
          </Button>
          <span className="organize-picker__count" role="status">
            {hint}
          </span>
        </div>
      </div>
      <div className="organize-picker__grid">{items}</div>
    </div>
  )
}
