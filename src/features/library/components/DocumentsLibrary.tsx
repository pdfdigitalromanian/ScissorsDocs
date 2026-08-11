import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '@/components/icons/Icon'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import IconButton from '@/components/ui/IconButton'
import SearchInput from '@/components/ui/SearchInput'
import { useToast } from '@/components/ui'
import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui'
import {
  createFolder,
  deleteDocument,
  deleteFolder,
  downloadDocument,
  downloadDocumentCopy,
  duplicateDocument,
  formatRelativeTime,
  ingestFiles,
  moveDocument,
  purgeDocument,
  renameDocument,
  renameFolder,
  restoreDocument,
  searchLocalDocuments,
  setDocumentTags,
  setFavorite,
  sortDocuments,
  togglePin,
  useLocalDocuments,
  useLocalFolders,
  useTrashedDocuments,
} from '@/features/documents'
import type {
  DocumentSortField,
  LocalDocument,
  LocalFolder,
  SortDirection,
} from '@/features/documents'
import { LibraryCard } from './LibraryCard'
import type { DocumentMenuHandlers } from './DocumentActionsMenu'
import {
  ConfirmModal,
  MoveDocumentModal,
  TagsModal,
  TextPromptModal,
} from './prompts'

export type LibraryVariant = 'recent' | 'favorites'

type LibrarySection = 'all' | 'favorites' | 'trash' | `folder:${string}`

const SORT_OPTIONS: { value: DocumentSortField; label: string }[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'name', label: 'Name' },
  { value: 'modified', label: 'Date modified' },
  { value: 'created', label: 'Date created' },
  { value: 'size', label: 'Size' },
  { value: 'type', label: 'Type' },
]

function sortLabel(field: DocumentSortField): string {
  return (
    SORT_OPTIONS.find((option) => option.value === field)?.label ?? 'Recent'
  )
}

const supportsDirectoryInput =
  typeof document !== 'undefined' &&
  'webkitdirectory' in document.createElement('input')

interface DocumentsLibraryProps {
  variant: LibraryVariant
}

/**
 * DocumentsLibrary — the real local document management surface: search,
 * sorting, local folders, favorites, pinned documents and the trash. Every
 * operation runs against local data and persists through the local backend.
 */
export function DocumentsLibrary({ variant }: DocumentsLibraryProps) {
  const navigate = useNavigate()
  const { toast } = useToast()

  const documents = useLocalDocuments()
  const folders = useLocalFolders()
  const trashed = useTrashedDocuments()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [sortField, setSortField] = useState<DocumentSortField>('recent')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [section, setSection] = useState<LibrarySection>(
    variant === 'favorites' ? 'favorites' : 'all',
  )

  const [renameTarget, setRenameTarget] = useState<LocalDocument | null>(null)
  const [tagsTarget, setTagsTarget] = useState<LocalDocument | null>(null)
  const [moveTarget, setMoveTarget] = useState<LocalDocument | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LocalDocument | null>(null)
  const [purgeTarget, setPurgeTarget] = useState<LocalDocument | null>(null)
  const [folderModal, setFolderModal] = useState<
    { mode: 'create' } | { mode: 'rename'; folder: LocalFolder } | null
  >(null)
  const [deleteFolderTarget, setDeleteFolderTarget] =
    useState<LocalFolder | null>(null)

  const favoriteCount = useMemo(
    () => documents.filter((document) => document.favorite).length,
    [documents],
  )

  const activeFolderId = section.startsWith('folder:')
    ? section.slice('folder:'.length)
    : null

  const visible = useMemo(() => {
    if (section === 'trash') return trashed
    let list = searchLocalDocuments(query)
    if (section === 'favorites') list = list.filter((doc) => doc.favorite)
    if (activeFolderId)
      list = list.filter((doc) => doc.folderId === activeFolderId)
    const sorted = sortDocuments(list, sortField, sortDirection)
    const pinned = sorted.filter((doc) => doc.pin)
    const rest = sorted.filter((doc) => !doc.pin)
    return [...pinned, ...rest]
  }, [section, trashed, query, activeFolderId, sortField, sortDirection])

  const sectionTitle = useMemo(() => {
    if (section === 'trash') return 'Trash'
    if (section === 'favorites') return 'Favorites'
    if (activeFolderId) {
      return (
        folders.find((folder) => folder.id === activeFolderId)?.name ?? 'Folder'
      )
    }
    return variant === 'recent' ? 'All documents' : 'Favorites'
  }, [section, activeFolderId, folders, variant])

  const makeHandlers = useCallback(
    (document: LocalDocument): DocumentMenuHandlers => ({
      onOpen: () =>
        navigate(`/workspace?doc=${encodeURIComponent(document.id)}`),
      onDownload: () => {
        void downloadDocument(document.id).then((error) => {
          if (error)
            toast({
              title: 'Download failed',
              description: error,
              variant: 'error',
            })
        })
      },
      onDownloadCopy: () => {
        void downloadDocumentCopy(document.id).then((error) => {
          if (error)
            toast({
              title: 'Download failed',
              description: error,
              variant: 'error',
            })
        })
      },
      onDuplicate: () => {
        void duplicateDocument(document.id).then((copy) => {
          toast({
            title: copy ? 'Document duplicated' : 'Could not duplicate',
            description: copy
              ? `${copy.name} was added to your library.`
              : 'The stored file could not be copied.',
            variant: copy ? 'success' : 'error',
          })
        })
      },
      onRename: () => setRenameTarget(document),
      onToggleFavorite: () => {
        void setFavorite(document.id, !document.favorite)
      },
      onTogglePin: () => {
        void togglePin(document.id)
      },
      onTags: () => setTagsTarget(document),
      onMove: () => setMoveTarget(document),
      onDelete: () => setDeleteTarget(document),
      onRestore: () => {
        void restoreDocument(document.id).then(() => {
          toast({
            title: 'Document restored',
            description: `${document.name} is back in your library.`,
            variant: 'success',
          })
        })
      },
      onPurge: () => setPurgeTarget(document),
    }),
    [navigate, toast],
  )

  const handleIngest = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      const results = await ingestFiles(files)
      const registered = results.filter(
        (result) => result.document !== null,
      ).length
      const failed = results.filter((result) => result.error !== null)
      if (failed.length > 0) {
        toast({
          title: 'Some files could not be opened',
          description: failed[0].error ?? 'The file could not be read.',
          variant: 'error',
        })
      }
      if (registered > 0) {
        toast({
          title: 'Files added locally',
          description: `${registered} file${registered === 1 ? '' : 's'} added to your library.`,
          variant: 'success',
        })
      }
    },
    [toast],
  )

  function confirmDelete() {
    if (!deleteTarget) return
    void deleteDocument(deleteTarget.id)
    toast({
      title: 'Moved to trash',
      description: `${deleteTarget.name} can be restored from the trash.`,
      variant: 'info',
    })
    setDeleteTarget(null)
  }

  function confirmPurge() {
    if (!purgeTarget) return
    void purgeDocument(purgeTarget.id)
    toast({
      title: 'Document deleted',
      description: `${purgeTarget.name} was removed from this device.`,
      variant: 'info',
    })
    setPurgeTarget(null)
  }

  function confirmDeleteFolder() {
    if (!deleteFolderTarget) return
    void deleteFolder(deleteFolderTarget.id)
    toast({
      title: 'Folder deleted',
      description: `${deleteFolderTarget.name} was removed. Its documents moved back to the root.`,
      variant: 'info',
    })
    if (activeFolderId === deleteFolderTarget.id) setSection('all')
    setDeleteFolderTarget(null)
  }

  const showEmptyState = visible.length === 0

  const allActive = variant === 'recent' && section !== 'trash'
  const favoritesActive = variant === 'favorites' && section !== 'trash'
  const trashActive = section === 'trash'

  return (
    <div className="library page-enter">
      <div className="library__sidebar" aria-label="Library sections">
        <button
          type="button"
          className={`library__section${allActive ? ' library__section--active' : ''}`}
          onClick={() => {
            setSection('all')
            navigate('/recent')
          }}
        >
          <Icon name="file" size="sm" />
          <span>All documents</span>
          <span className="library__count">{documents.length}</span>
        </button>
        <button
          type="button"
          className={`library__section${favoritesActive ? ' library__section--active' : ''}`}
          onClick={() => {
            setSection('favorites')
            navigate('/favorites')
          }}
        >
          <Icon name="favorites" size="sm" />
          <span>Favorites</span>
          <span className="library__count">{favoriteCount}</span>
        </button>
        <button
          type="button"
          className={`library__section${trashActive ? ' library__section--active' : ''}`}
          onClick={() => setSection('trash')}
        >
          <Icon name="trash" size="sm" />
          <span>Trash</span>
          <span className="library__count">{trashed.length}</span>
        </button>

        <div className="library__divider" role="separator" />

        <div className="library__folders-header">
          <span className="library__folders-title">Folders</span>
          <IconButton
            icon="plus"
            label="New folder"
            iconSize="sm"
            onClick={() => setFolderModal({ mode: 'create' })}
          />
        </div>
        <ul className="library__folders">
          {folders.length === 0 ? (
            <li className="library__folders-empty">No folders yet.</li>
          ) : (
            folders.map((folder) => {
              const count = documents.filter(
                (doc) => doc.folderId === folder.id,
              ).length
              return (
                <li key={folder.id} className="library__folder-row">
                  <button
                    type="button"
                    className={`library__section library__folder${section === `folder:${folder.id}` ? ' library__section--active' : ''}`}
                    onClick={() => setSection(`folder:${folder.id}`)}
                  >
                    <Icon name="folder-open" size="sm" />
                    <span>{folder.name}</span>
                    <span className="library__count">{count}</span>
                  </button>
                  <div
                    className="library__folder-actions"
                    onContextMenu={(event) => event.preventDefault()}
                  >
                    <IconButton
                      icon="edit"
                      label={`Rename folder ${folder.name}`}
                      iconSize="xs"
                      onClick={() => setFolderModal({ mode: 'rename', folder })}
                    />
                    <IconButton
                      icon="trash"
                      label={`Delete folder ${folder.name}`}
                      iconSize="xs"
                      className="library__folder-delete"
                      onClick={() => setDeleteFolderTarget(folder)}
                    />
                  </div>
                </li>
              )
            })
          )}
        </ul>
      </div>

      <div className="library__content">
        <div className="library__header">
          <div>
            <h2 className="library__title">{sectionTitle}</h2>
            <p className="library__description">
              {section === 'trash'
                ? 'Trashed documents stay on this device until you delete them forever.'
                : 'Your files live on this device and work fully offline.'}
            </p>
          </div>
          <div className="library__header-actions">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Icon name="upload" size="sm" />
              Open files
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!supportsDirectoryInput}
              title={
                supportsDirectoryInput
                  ? 'Import every supported file from a folder'
                  : 'Your browser does not support folder imports'
              }
              onClick={() => folderInputRef.current?.click()}
            >
              <Icon name="folder-open" size="sm" />
              Open folder
            </Button>
          </div>
        </div>

        <div className="library__toolbar">
          <SearchInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            label="Search documents"
            placeholder="Search names, folders, tags and types"
            className="library__search"
          />
          <div className="library__sort">
            <Dropdown align="end">
              <DropdownTrigger className="library__sort-trigger">
                <Icon name="organize" size="sm" />
                {sortLabel(sortField)}
              </DropdownTrigger>
              <DropdownMenu>
                {SORT_OPTIONS.map((option) => (
                  <DropdownItem
                    key={option.value}
                    icon={sortField === option.value ? 'check' : undefined}
                    onSelect={() => setSortField(option.value)}
                  >
                    {option.label}
                  </DropdownItem>
                ))}
                <DropdownSeparator />
              </DropdownMenu>
            </Dropdown>
            <IconButton
              icon={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'}
              label={
                sortDirection === 'asc' ? 'Sort ascending' : 'Sort descending'
              }
              iconSize="sm"
              onClick={() =>
                setSortDirection((direction) =>
                  direction === 'asc' ? 'desc' : 'asc',
                )
              }
            />
          </div>
        </div>

        <div className="library__grid" aria-live="polite">
          {showEmptyState ? (
            <div className="library__empty">
              <EmptyState
                icon={
                  section === 'trash'
                    ? 'trash'
                    : section === 'favorites'
                      ? 'favorites'
                      : 'file'
                }
                title={
                  section === 'trash'
                    ? 'Trash is empty'
                    : query.trim()
                      ? 'No matches found'
                      : section === 'favorites'
                        ? 'No favorites yet'
                        : activeFolderId
                          ? 'This folder is empty'
                          : 'No documents yet'
                }
                description={
                  section === 'trash'
                    ? 'Documents you move to the trash appear here.'
                    : query.trim()
                      ? 'Try a different name, folder, tag or file type.'
                      : 'Open a file from this device to add it to your library.'
                }
                action={
                  section !== 'trash' ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Open files
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            visible.map((document) => (
              <LibraryCard
                key={document.id}
                document={document}
                folders={folders}
                handlers={makeHandlers(document)}
                metaLabel={
                  section === 'trash'
                    ? `Trashed ${formatRelativeTime(document.deletedAt ?? document.updatedAt)}`
                    : undefined
                }
              />
            ))
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.docx,.xlsx,.pptx"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          void handleIngest(files)
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-expect-error — webkitdirectory is not in the standard type set.
        webkitdirectory="true"
        directory="true"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          void handleIngest(files)
        }}
      />

      {renameTarget ? (
        <TextPromptModal
          open
          title="Rename document"
          label="Document name"
          initialValue={renameTarget.name.replace(/\.\w+$/, '')}
          hint={`The .${renameTarget.extension} extension will be kept.`}
          submitLabel="Rename"
          onSubmit={(value) =>
            renameDocument(renameTarget.id, value).then((result) => ({
              error: result.error,
            }))
          }
          onClose={() => setRenameTarget(null)}
        />
      ) : null}

      {tagsTarget ? (
        <TagsModal
          open
          document={tagsTarget}
          onSave={(tags) => setDocumentTags(tagsTarget.id, tags)}
          onClose={() => setTagsTarget(null)}
        />
      ) : null}

      {moveTarget ? (
        <MoveDocumentModal
          open
          document={moveTarget}
          folders={folders}
          onMove={(folderId) => moveDocument(moveTarget.id, folderId)}
          onClose={() => setMoveTarget(null)}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmModal
          open
          title="Move to trash?"
          message={`${deleteTarget.name} will be moved to the trash. You can restore it later.`}
          confirmLabel="Move to trash"
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      ) : null}

      {purgeTarget ? (
        <ConfirmModal
          open
          title="Delete forever?"
          message={`${purgeTarget.name} will be permanently removed from this device. This cannot be undone.`}
          confirmLabel="Delete forever"
          onConfirm={confirmPurge}
          onClose={() => setPurgeTarget(null)}
        />
      ) : null}

      {folderModal ? (
        <TextPromptModal
          open
          title={folderModal.mode === 'create' ? 'New folder' : 'Rename folder'}
          label="Folder name"
          initialValue={
            folderModal.mode === 'rename' ? folderModal.folder.name : ''
          }
          submitLabel={
            folderModal.mode === 'create' ? 'Create folder' : 'Rename'
          }
          onSubmit={(value) =>
            folderModal.mode === 'create'
              ? createFolder(value).then((folder) => ({
                  error: folder ? null : 'Enter a folder name.',
                }))
              : renameFolder(folderModal.folder.id, value).then((result) => ({
                  error: result.error,
                }))
          }
          onClose={() => setFolderModal(null)}
        />
      ) : null}

      {deleteFolderTarget ? (
        <ConfirmModal
          open
          title="Delete folder?"
          message={`${deleteFolderTarget.name} will be deleted. Its documents move back to the root.`}
          confirmLabel="Delete folder"
          onConfirm={confirmDeleteFolder}
          onClose={() => setDeleteFolderTarget(null)}
        />
      ) : null}
    </div>
  )
}
