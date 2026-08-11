import type { IconName } from '@/components/icons/Icon'

/** Broad capability bucket used to pick a workspace preview. */
export type DocumentKind = 'pdf' | 'image' | 'text' | 'office' | 'unknown'

export type DocumentTone = 'primary' | 'success' | 'warning' | 'info' | 'secondary'

/** Registered local document metadata. The binary file lives in IndexedDB. */
export interface LocalDocument {
  /** Stable local identifier, also used as the file store key. */
  id: string
  name: string
  extension: string
  mimeType: string
  size: number
  lastModified: number
  kind: DocumentKind
  createdAt: number
  /** Most recent time the document was opened in the workspace. */
  lastOpenedAt: number
  /** Marked as a favorite by the user. */
  favorite: boolean
  /** Pinned documents sort ahead of unpinned ones. */
  pin: boolean
  /** Free-form tags attached to the document. */
  tags: string[]
  /** Owning local folder id; null means the root (no folder). */
  folderId: string | null
  /** Soft-delete timestamp. Documents with a value live in the trash. */
  deletedAt: number | null
  /** Most recent time the metadata changed (rename, tags, move, …). */
  updatedAt: number
}

/** A user-created local folder used to organise documents. */
export interface LocalFolder {
  id: string
  name: string
  createdAt: number
}

/** Static description of a supported file type. */
export interface DocumentFileType {
  extension: string
  mime: string
  label: string
  kind: DocumentKind
  tone: DocumentTone
  icon: IconName
}
