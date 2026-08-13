/**
 * EditorToolbar — primary tools and document actions for content editing.
 * Rendered by the viewer only while edit mode is active. Contextual style
 * and arrange controls live in the right-side Inspector panel.
 */
import IconButton from '@/components/ui/IconButton'
import { Icon } from '@/components/icons/Icon'
import type { IconName } from '@/components/icons/Icon'
import type { EditorTool } from './elements'
import { usePdfEditor } from './PdfEditorProvider'
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

  const hasSelection = selectedElementIds.length > 0

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
          onClick={() => {
            void deleteElements(selectedElementIds)
            clearElementSelection()
          }}
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
    </div>
  )
}
