import type { IconName } from '@/components/icons/Icon'
import type { LocalDocument } from '@/features/documents'

export interface DocumentMenuHandlers {
  onOpen: () => void
  onDownload: () => void
  onDownloadCopy: () => void
  onDuplicate: () => void
  onRename: () => void
  onToggleFavorite: () => void
  onTogglePin: () => void
  onTags: () => void
  onMove: () => void
  onDelete: () => void
  onRestore?: () => void
  onPurge?: () => void
}

export interface DocumentMenuItem {
  kind: 'item' | 'separator'
  label?: string
  icon?: IconName
  disabled?: boolean
  destructive?: boolean
  onSelect?: () => void
}

function item(
  label: string,
  icon: IconName,
  onSelect: () => void,
): DocumentMenuItem {
  return { kind: 'item', label, icon, onSelect }
}

function separator(): DocumentMenuItem {
  return { kind: 'separator' }
}

/** Builds the ordered lifecycle actions for a local document. */
export function buildDocumentMenuItems(
  document: LocalDocument,
  handlers: DocumentMenuHandlers,
): DocumentMenuItem[] {
  const items: DocumentMenuItem[] = [
    item('Open', 'file', handlers.onOpen),
    item('Download', 'download', handlers.onDownload),
    item('Save a copy', 'upload', handlers.onDownloadCopy),
  ]

  items.push(separator())
  items.push(
    item('Duplicate', 'copy', handlers.onDuplicate),
    item('Rename', 'edit', handlers.onRename),
  )

  items.push(separator())
  items.push(
    item(
      document.favorite ? 'Remove from favorites' : 'Add to favorites',
      'favorites',
      handlers.onToggleFavorite,
    ),
    item(document.pin ? 'Unpin' : 'Pin', 'pin', handlers.onTogglePin),
    item('Tags…', 'sign', handlers.onTags),
    item('Move to folder…', 'folder-open', handlers.onMove),
  )

  items.push(separator())
  if (document.deletedAt != null) {
    items.push(
      item('Restore', 'undo', handlers.onRestore ?? (() => undefined)),
      {
        kind: 'item',
        label: 'Delete forever',
        icon: 'trash',
        destructive: true,
        onSelect: handlers.onPurge,
      },
    )
  } else {
    items.push({
      kind: 'item',
      label: 'Move to trash',
      icon: 'trash',
      destructive: true,
      onSelect: handlers.onDelete,
    })
  }

  return items
}
