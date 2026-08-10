import { useEffect, useRef, useState } from 'react'

const OPTIONS = [
  'Blank Document',
  'Meeting Notes',
  'Project Report',
  'Cover Letter',
  'Product Proposal',
]

export default function Dropdown() {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(OPTIONS[0])
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="sg-dropdown" ref={rootRef}>
      <button
        type="button"
        className="sg-dropdown__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{selected}</span>
        <span
          className={`sg-dropdown__caret${open ? ' sg-dropdown__caret--open' : ''}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {open ? (
        <ul
          className="sg-dropdown__menu"
          role="listbox"
          aria-label="Choose a template"
        >
          {OPTIONS.map((option) => (
            <li key={option}>
              <button
                type="button"
                role="option"
                aria-selected={option === selected}
                className={`sg-dropdown__item${option === selected ? ' sg-dropdown__item--selected' : ''}`}
                onClick={() => {
                  setSelected(option)
                  setOpen(false)
                }}
              >
                <span>{option}</span>
                {option === selected ? (
                  <span className="sg-dropdown__check" aria-hidden="true">
                    ✓
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
