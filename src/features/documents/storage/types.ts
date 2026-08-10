import type { LocalDocument } from '../types'

/** A file blob stored under a document's local id. */
export interface StoredFile {
  key: string
  blob: Blob
}

/**
 * Local document backend — metadata records plus binary file blobs.
 *
 * This interface is the boundary between the application and local
 * persistence. The IndexedDB implementation in ./db is the current
 * backend; Cloudflare R2 (Phase 8) will provide a remote implementation
 * without the UI or registry changing.
 */
export interface LocalDocumentBackend {
  isSupported(): boolean
  getDocument(id: string): Promise<LocalDocument | undefined>
  getAllDocuments(): Promise<LocalDocument[]>
  putDocument(document: LocalDocument): Promise<void>
  deleteDocument(id: string): Promise<void>
  getFile(key: string): Promise<StoredFile | undefined>
  putFile(record: StoredFile): Promise<void>
  deleteFile(key: string): Promise<void>
}

/**
 * Namespaced key-value backend for workspace state, document sessions and
 * user preferences. Kept separate from the document backend so workspace
 * persistence can be re-routed to a remote store later.
 */
export interface KeyValueBackend {
  isSupported(): boolean
  getValue(key: string): Promise<unknown | undefined>
  putValue(key: string, value: unknown): Promise<void>
  deleteValue(key: string): Promise<void>
  clearValues(): Promise<void>
}
