/**
 * EditorToolbar — primary tools and document actions for content editing.
 * Rendered by the viewer only while edit mode is active. Contextual style
 * and arrange controls live in the right-side Inspector panel.
 */
import { useState } from 'react'
import IconButton from '@/components/ui/IconButton'
import { Icon } from '@/components/icons/Icon'
import type { IconName } from '@/components/icons/Icon'
import type { EditorTool } from './elements'
import { createTextElement, nextZIndex } from './elements'
import { usePdfEditor } from './PdfEditorProvider'
import { useSettings } from '@/features/settings/SettingsProvider'
import { ConfirmDialog } from './components/ConfirmDialog'
import './editor.css'

const TOOLS: Array<{ tool: EditorTool; icon: IconName; label: string }> = [
  { tool: 'select', icon: 'pointer', label: 'Select' },
  { tool: 'text', icon: 'text', label: 'Add text' },
  { tool: 'rect', icon: 'square', label: 'Rectangle' },
  { tool: 'ellipse', icon: 'circle', label: 'Ellipse' },
  { tool: 'line', icon: 'line', label: 'Line' },
  { tool: 'arrow', icon: 'arrow-right', label: 'Arrow' },
]

const WATERMARK_STAMPS = [
  'APPROVED',
  'DRAFT',
  'CONFIDENTIAL',
  'COPY',
  'REJECTED',
  'REVIEWED',
] as const

interface EditorToolbarProps {
  /** 0-based index of the currently visible page for stamp placement. */
  watermarkPage?: number
}

export function EditorToolbar({ watermarkPage = 0 }: EditorToolbarProps) {
  const {
    tool,
    setTool,
    canUndo,
    canRedo,
    undo,
    redo,
    selectedElementIds,
    deleteElements,
    clearElementSelection,
    pages,
    elements,
    addElement,
    selectElement,
  } = usePdfEditor()
  const { settings } = useSettings()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [watermarkOpen, setWatermarkOpen] = useState(false)

  const hasSelection = selectedElementIds.length > 0

  const requestDelete = () => {
    if (settings.general.deleteConfirmation) {
      setConfirmDelete(true)
      return
    }
    void deleteElements(selectedElementIds)
    clearElementSelection()
  }

  async function placeWatermark(label: string) {
    const page = pages[watermarkPage]
    if (!page) return
    const width = page.width * 0.8
    const height = 96
    const element = createTextElement(
      page.index,
      (page.width - width) / 2,
      (page.height - height) / 2,
      width,
      height,
      nextZIndex(elements),
      label,
    )
    element.rotation = 315
    element.opacity = 0.12
    element.fontSize = 48
    element.bold = true
    element.alignment = 'center'
    element.color = '#b91c1c'
    await addElement(element, true)
    selectElement(element.id)
    setWatermarkOpen(false)
  }

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Edit tools">
      <div className="editor-toolbar__group">
        {TOOLS.map(({ tool: toolId, icon, label }) => (
          <IconButton
            key={toolId}
            icon={icon}
            label={label}
            iconSize="sm"
            aria-pressed={tool === toolId}
            onClick={() => setTool(toolId)}
          />
        ))}
        <IconButton
          icon="image"
          label="Add image — then click where it should go"
          iconSize="sm"
          aria-pressed={tool === 'image'}
          onClick={() => setTool('image')}
        />
        <IconButton
          icon="watermark"
          label="Add a watermark stamp"
          iconSize="sm"
          aria-pressed={watermarkOpen}
          onClick={() => setWatermarkOpen((open) => !open)}
        />
        {watermarkOpen ? (
          <div className="editor-toolbar__popover">
            <p className="editor-toolbar__popover-title">Watermark stamp</p>
            <p className="editor-toolbar__popover-hint">
              Added to the current page as an editable text object.
            </p>
            <div className="editor-toolbar__stamps">
              {WATERMARK_STAMPS.map((stamp) => (
                <button
                  key={stamp}
                  type="button"
                  onClick={() => void placeWatermark(stamp)}
                >
                  {stamp}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="editor-toolbar__group">
        <IconButton
          icon="undo"
          label="Undo"
          iconSize="sm"
          disabled={!canUndo}
          onClick={() => void undo()}
        />
        <IconButton
          icon="redo"
          label="Redo"
          iconSize="sm"
          disabled={!canRedo}
          onClick={() => void redo()}
        />
      </div>

      <div className="editor-toolbar__group">
        <IconButton
          icon="trash"
          label="Delete selected"
          iconSize="sm"
          disabled={!hasSelection}
          onClick={requestDelete}
        />
      </div>

      {hasSelection && (
        <div className="editor-toolbar__note">
          <Icon name="edit" size="sm" />
          {selectedElementIds.length} selected
        </div>
      )}

      {!hasSelection && tool === 'image' && (
        <div className="editor-toolbar__note">
          <Icon name="image" size="sm" />
          Click on a page to place the image
        </div>
      )}

      {!hasSelection && tool !== 'select' && tool !== 'image' && (
        <div className="editor-toolbar__note">
          <Icon name="edit" size="sm" />
          Drag on a page to draw
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete selected objects?"
        description={`${selectedElementIds.length} object${selectedElementIds.length === 1 ? '' : 's'
          } will be removed from the document.`}
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmDelete(false)
          void deleteElements(selectedElementIds)
          clearElementSelection()
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  )
}
