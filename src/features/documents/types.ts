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
