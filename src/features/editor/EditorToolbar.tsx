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

export function EditorToolbar() {
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
  } = usePdfEditor()
  const { settings } = useSettings()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const hasSelection = selectedElementIds.length > 0

  const requestDelete = () => {
    if (settings.general.deleteConfirmation) {
      setConfirmDelete(true)
      return
    }
    void deleteElements(selectedElementIds)
    clearElementSelection()
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
