import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { Icon } from '@/components/icons/Icon'
import ContextMenu from '@/components/layout/ContextMenu'
import type { ContextMenuItem } from '@/components/layout/ContextMenu'
import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui'
import type { LocalDocument } from '@/features/documents'
import { buildDocumentMenuItems } from './document-menu'
import type { DocumentMenuHandlers } from './document-menu'

export type { DocumentMenuHandlers } from './document-menu'

interface DocumentActionsMenuProps {
  document: LocalDocument
  handlers: DocumentMenuHandlers
  children: ReactNode
  ariaLabel?: string
}

/**
 * DocumentActionsMenu provides every lifecycle action for a local document
 * through right-click (context menu) and a visible "more" menu.
 */
export function DocumentActionsMenu({
  document,
  handlers,
  children,
  ariaLabel,
}: DocumentActionsMenuProps) {
  const items = useMemo(
    () => buildDocumentMenuItems(document, handlers),
    [document, handlers],
  )

  const contextItems: ContextMenuItem[] = items
    .filter((entry) => entry.kind === 'item')
    .map((entry) => ({
      label: entry.label ?? '',
      icon: entry.icon,
      disabled: entry.disabled,
      destructive: entry.destructive,
      onSelect: entry.onSelect,
    }))

  return (
    <span className="document-menu">
      <ContextMenu
        items={contextItems}
        ariaLabel={ariaLabel ?? `Actions for ${document.name}`}
        className="document-menu__trigger"
      >
        {children}
      </ContextMenu>
      <Dropdown>
        <DropdownTrigger
          className="document-menu__more icon-button"
          aria-label={`More actions for ${document.name}`}
        >
          <Icon name="menu" size="sm" />
        </DropdownTrigger>
        <DropdownMenu>
          {items.map((entry, index) =>
            entry.kind === 'separator' ? (
              <DropdownSeparator key={`sep-${index}`} />
            ) : (
              <DropdownItem
                key={entry.label ?? `item-${index}`}
                icon={entry.icon}
                danger={entry.destructive}
                disabled={entry.disabled}
                onSelect={entry.onSelect}
              >
                {entry.label}
              </DropdownItem>
            ),
          )}
        </DropdownMenu>
      </Dropdown>
    </span>
  )
}
