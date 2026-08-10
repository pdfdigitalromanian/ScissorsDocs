import type { LocalDocument } from '@/features/documents'
import { findFileType, formatBytes } from '@/features/documents'
import type { DocumentTab } from '../types'

/** Maps a registered local document into a workspace tab (session entry). */
export function toLocalDocumentTab(local: LocalDocument): DocumentTab {
  const fileType = findFileType({ name: local.name, type: local.mimeType })
  return {
    id: local.id,
    title: local.name,
    subtitle: `${local.extension.toUpperCase()} · ${formatBytes(local.size)}`,
    extension: local.extension.toUpperCase(),
    size: formatBytes(local.size),
    status: 'ready',
    icon: fileType?.icon,
    localDocument: local,
  }
}
