import { findFileType } from '../file-types'
import { validateFile } from '../validation'
import type { LocalDocument, LocalFolder } from '../types'
import { documentBackend } from './db'

export interface IngestedFileResult {
  document: LocalDocument | null
  error: string | null
}

export type DocumentSortField =
  | 'name'
  | 'modified'
  | 'created'
  | 'size'
  | 'type'
  | 'recent'

export type SortDirection = 'asc' | 'desc'

type Listener = () => void

const listeners = new Set<Listener>()
const memoryFiles = new Map<string, Blob>()
let documentsCache: LocalDocument[] = []
let cacheLoaded = false
let foldersCache: LocalFolder[] = []
let foldersLoaded = false

function notifyListeners() {
  for (const listener of listeners) listener()
}

function sortByLastOpened(list: LocalDocument[]): LocalDocument[] {
  return [...list].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
}

/**
 * Fills defaults for fields added after earlier milestones. Documents
 * persisted before favorites/pins/tags/folders/trash existed load without
 * those keys, so every record is normalised to a full shape on read.
 */
function normalizeDocument(record: LocalDocument): LocalDocument {
  return {
    id: record.id,
    name: record.name,
    extension: record.extension,
    mimeType: record.mimeType,
    size: record.size,
    lastModified: record.lastModified,
    kind: record.kind,
    createdAt: record.createdAt,
    lastOpenedAt: record.lastOpenedAt,
    favorite: record.favorite ?? false,
    pin: record.pin ?? false,
    tags: record.tags ?? [],
    folderId: record.folderId ?? null,
    deletedAt: record.deletedAt ?? null,
    updatedAt: record.updatedAt ?? record.lastOpenedAt,
  }
}

async function ensureLoaded() {
  if (cacheLoaded) return
  cacheLoaded = true
  if (!documentBackend.isSupported()) return
  try {
    const documents = await documentBackend.getAllDocuments()
    documentsCache = sortByLastOpened(documents.map(normalizeDocument))
  } catch {
    documentsCache = []
  }
}

async function ensureFoldersLoaded() {
  if (foldersLoaded) return
  foldersLoaded = true
  if (!documentBackend.isSupported()) return
  try {
    foldersCache = await documentBackend.getAllFolders()
  } catch {
    foldersCache = []
  }
}

export function subscribeLocalDocuments(listener: Listener): () => void {
  listeners.add(listener)
  void Promise.all([ensureLoaded(), ensureFoldersLoaded()]).then(notifyListeners)
  return () => listeners.delete(listener)
}

/** Live local documents only — soft-deleted (trashed) documents are excluded. */
export function getLocalDocuments(): LocalDocument[] {
  return documentsCache.filter((document) => document.deletedAt == null)
}

/** Soft-deleted documents that currently live in the trash. */
export function getTrashedDocuments(): LocalDocument[] {
  return documentsCache
    .filter((document) => document.deletedAt != null)
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
}

export function getLocalFolders(): LocalFolder[] {
  return foldersCache
}

export async function getLocalDocument(
  id: string,
): Promise<LocalDocument | undefined> {
  await ensureLoaded()
  const document = documentsCache.find((entry) => entry.id === id)
  return document && document.deletedAt == null ? document : undefined
}

function splitName(name: string): { base: string; extension: string } {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) {
    return { base: name, extension: '' }
  }
  return { base: name.slice(0, dot), extension: name.slice(dot + 1).toLowerCase() }
}

function createLocalDocument(file: File): LocalDocument {
  const type = findFileType(file)
  if (!type) {
    throw new Error(`Unsupported file type for "${file.name}".`)
  }
  const now = Date.now()
  return {
    id: `local-${crypto.randomUUID()}`,
    name: file.name,
    extension: type.extension,
    mimeType: type.mime,
    size: file.size,
    lastModified: file.lastModified,
    kind: type.kind,
    createdAt: now,
    lastOpenedAt: now,
    favorite: false,
    pin: false,
    tags: [],
    folderId: null,
    deletedAt: null,
    updatedAt: now,
  }
}

/**
 * Validates, extracts metadata from and registers each file. Every file is
 * stored via the local document backend (IndexedDB); when the browser
 * refuses storage the document still registers for the current session and
 * the returned error explains why.
 */
export async function ingestFiles(
  files: File[],
): Promise<IngestedFileResult[]> {
  await ensureLoaded()
  const results: IngestedFileResult[] = []

  for (const file of files) {
    const validation = validateFile(file)
    if (!validation.ok) {
      results.push({
        document: null,
        error:
          validation.message ?? 'This file could not be opened in the workspace.',
      })
      continue
    }

    const document = createLocalDocument(file)
    try {
      if (documentBackend.isSupported()) {
        await documentBackend.putFile({ key: document.id, blob: file })
        await documentBackend.putDocument(document)
      } else {
        memoryFiles.set(document.id, file)
      }
      documentsCache = sortByLastOpened([document, ...documentsCache])
      results.push({ document, error: null })
    } catch (error) {
      memoryFiles.set(document.id, file)
      documentsCache = sortByLastOpened([document, ...documentsCache])
      results.push({
        document,
        error:
          error instanceof Error
            ? error.message
            : 'The document could not be persisted to this browser.',
      })
    }
  }

  notifyListeners()
  return results
}

async function updateDocument(
  id: string,
  mutate: (document: LocalDocument) => void,
): Promise<LocalDocument | undefined> {
  await ensureLoaded()
  const index = documentsCache.findIndex((document) => document.id === id)
  if (index === -1) return undefined
  const updated: LocalDocument = {
    ...documentsCache[index],
    updatedAt: Date.now(),
  }
  mutate(updated)
  documentsCache = [...documentsCache]
  documentsCache[index] = updated
  if (documentBackend.isSupported()) {
    try {
      await documentBackend.putDocument(updated)
    } catch {
      // Best effort — the change still applies for this session.
    }
  }
  notifyListeners()
  return updated
}

function persistFolder(folder: LocalFolder): Promise<boolean> {
  if (!documentBackend.isSupported()) return Promise.resolve(true)
  return documentBackend.putFolder(folder).then(
    () => true,
    () => false,
  )
}

/* ------------------------------------------------------------------ *
 * Document lifecycle
 * ------------------------------------------------------------------ */

/** Renames a document. Only the base name changes; the extension is kept. */
export async function renameDocument(
  id: string,
  nextName: string,
): Promise<{ error: string | null }> {
  await ensureLoaded()
  const trimmed = nextName.trim()
  if (trimmed.length === 0) {
    return { error: 'Enter a name for the document.' }
  }
  const index = documentsCache.findIndex((document) => document.id === id)
  if (index === -1) {
    return { error: 'This local document could not be found.' }
  }
  const current = documentsCache[index]
  const extension = current.extension ? `.${current.extension}` : ''
  const candidate = `${trimmed}${extension}`
  const duplicate = documentsCache.some(
    (document) =>
      document.id !== id &&
      document.deletedAt == null &&
      document.name.toLowerCase() === candidate.toLowerCase(),
  )
  if (duplicate) {
    return { error: 'A document with that name already exists.' }
  }
  const updated: LocalDocument = {
    ...current,
    name: candidate,
    updatedAt: Date.now(),
  }
  documentsCache = [...documentsCache]
  documentsCache[index] = updated
  if (documentBackend.isSupported()) {
    try {
      await documentBackend.putDocument(updated)
    } catch {
      // Best effort — the change still applies for this session.
    }
  }
  notifyListeners()
  return { error: null }
}

/** Creates a copy of a stored document under a "… copy" name. */
export async function duplicateDocument(
  id: string,
): Promise<LocalDocument | null> {
  await ensureLoaded()
  const source = documentsCache.find((document) => document.id === id)
  if (!source || source.deletedAt != null) return null
  const blob = await getFileBlob(id)
  if (!blob) return null
  const { base } = splitName(source.name)
  const now = Date.now()
  const copy: LocalDocument = {
    ...source,
    id: `local-${crypto.randomUUID()}`,
    name: `${base} copy${source.extension ? `.${source.extension}` : ''}`,
    createdAt: now,
    lastOpenedAt: now,
    updatedAt: now,
    favorite: false,
    pin: false,
    tags: [],
    deletedAt: null,
  }
  try {
    if (documentBackend.isSupported()) {
      await documentBackend.putFile({ key: copy.id, blob })
      await documentBackend.putDocument(copy)
    } else {
      memoryFiles.set(copy.id, blob)
    }
    documentsCache = sortByLastOpened([copy, ...documentsCache])
  } catch {
    return null
  }
  notifyListeners()
  return copy
}

/** Soft-deletes a document — it moves to the trash and can be restored. */
export async function deleteDocument(id: string): Promise<void> {
  await updateDocument(id, (document) => {
    document.deletedAt = Date.now()
  })
}

/** Restores a soft-deleted document back into the library. */
export async function restoreDocument(id: string): Promise<void> {
  await updateDocument(id, (document) => {
    document.deletedAt = null
  })
}

/** Permanently removes a document and its stored file blob. */
export async function purgeDocument(id: string): Promise<void> {
  await ensureLoaded()
  documentsCache = documentsCache.filter((document) => document.id !== id)
  memoryFiles.delete(id)
  if (documentBackend.isSupported()) {
    try {
      await documentBackend.deleteFile(id)
      await documentBackend.deleteDocument(id)
    } catch {
      // Best effort — the record is already gone from the session view.
    }
  }
  notifyListeners()
}

/** Moves a document into a folder (or back to the root when null). */
export async function moveDocument(
  id: string,
  folderId: string | null,
): Promise<void> {
  await updateDocument(id, (document) => {
    document.folderId = folderId
  })
}

export async function setFavorite(
  id: string,
  favorite: boolean,
): Promise<void> {
  await updateDocument(id, (document) => {
    document.favorite = favorite
  })
}

export async function togglePin(id: string): Promise<void> {
  await updateDocument(id, (document) => {
    document.pin = !document.pin
  })
}

export async function setDocumentTags(
  id: string,
  tags: string[],
): Promise<void> {
  const normalized = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]
  await updateDocument(id, (document) => {
    document.tags = normalized
  })
}

/* ------------------------------------------------------------------ *
 * Folders
 * ------------------------------------------------------------------ */

export async function createFolder(name: string): Promise<LocalFolder | null> {
  await ensureFoldersLoaded()
  const trimmed = name.trim()
  if (!trimmed) return null
  if (
    foldersCache.some(
      (folder) => folder.name.toLowerCase() === trimmed.toLowerCase(),
    )
  ) {
    return null
  }
  const folder: LocalFolder = {
    id: `folder-${crypto.randomUUID()}`,
    name: trimmed,
    createdAt: Date.now(),
  }
  const persisted = await persistFolder(folder)
  if (!persisted) return null
  foldersCache = [...foldersCache, folder]
  notifyListeners()
  return folder
}

export async function renameFolder(
  id: string,
  name: string,
): Promise<{ error: string | null }> {
  await ensureFoldersLoaded()
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Enter a name for the folder.' }
  const folder = foldersCache.find((entry) => entry.id === id)
  if (!folder) return { error: 'This folder could not be found.' }
  const updated: LocalFolder = { ...folder, name: trimmed }
  foldersCache = foldersCache.map((entry) => (entry.id === id ? updated : entry))
  if (documentBackend.isSupported()) {
    try {
      await documentBackend.putFolder(updated)
    } catch {
      return { error: 'The folder could not be renamed on this device.' }
    }
  }
  notifyListeners()
  return { error: null }
}

/** Deletes a folder; its documents move back to the root. */
export async function deleteFolder(id: string): Promise<void> {
  await ensureLoaded()
  await ensureFoldersLoaded()
  foldersCache = foldersCache.filter((folder) => folder.id !== id)
  if (documentBackend.isSupported()) {
    try {
      await documentBackend.deleteFolder(id)
    } catch {
      // Best effort — the folder is already gone from the session view.
    }
  }
  const affected = documentsCache.filter((document) => document.folderId === id)
  for (const document of affected) {
    await updateDocument(document.id, (entry) => {
      entry.folderId = null
    })
  }
  notifyListeners()
}

/* ------------------------------------------------------------------ *
 * Search, sort & filtering
 * ------------------------------------------------------------------ */

/** Searches live documents by name, extension, folder name and tags. */
export function searchLocalDocuments(query: string): LocalDocument[] {
  const trimmed = query.trim().toLowerCase()
  const live = documentsCache.filter((document) => document.deletedAt == null)
  if (!trimmed) return live
  const terms = trimmed.split(/\s+/)
  return live.filter((document) => {
    const folderName =
      foldersCache.find((folder) => folder.id === document.folderId)?.name ?? ''
    const haystack = [
      document.name,
      document.extension,
      document.mimeType,
      folderName,
      ...document.tags,
    ]
      .join(' ')
      .toLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
}

export function sortDocuments(
  list: LocalDocument[],
  field: DocumentSortField,
  direction: SortDirection,
): LocalDocument[] {
  const factor = direction === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    switch (field) {
      case 'name':
        return (
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) *
          factor
        )
      case 'modified':
        return (a.updatedAt - b.updatedAt) * factor
      case 'created':
        return (a.createdAt - b.createdAt) * factor
      case 'size':
        return (a.size - b.size) * factor
      case 'type':
        return (
          a.extension.localeCompare(b.extension) * factor ||
          a.name.localeCompare(b.name) * factor
        )
      case 'recent':
      default:
        return (a.lastOpenedAt - b.lastOpenedAt) * factor
    }
  })
}

/* ------------------------------------------------------------------ *
 * Open, download & export
 * ------------------------------------------------------------------ */

export async function touchDocument(id: string): Promise<void> {
  await ensureLoaded()
  const document = documentsCache.find((entry) => entry.id === id)
  if (!document || document.deletedAt != null) return
  document.lastOpenedAt = Date.now()
  documentsCache = sortByLastOpened(documentsCache)
  if (documentBackend.isSupported()) {
    try {
      await documentBackend.putDocument(document)
    } catch {
      // Best effort.
    }
  }
  notifyListeners()
}

export async function getFileBlob(id: string): Promise<Blob | null> {
  const memoryBlob = memoryFiles.get(id)
  if (memoryBlob) return memoryBlob
  if (!documentBackend.isSupported()) return null
  const record = await documentBackend.getFile(id)
  return record?.blob ?? null
}

/**
 * Persists a new blob for an existing local document, keeping its metadata
 * (name, tags, folder, …). Used by the editor to autosave edits.
 */
export async function saveDocumentFile(
  id: string,
  blob: Blob,
): Promise<{ error: string | null }> {
  await ensureLoaded()
  const document = documentsCache.find((entry) => entry.id === id)
  if (!document || document.deletedAt != null) {
    return { error: 'This local document could not be found.' }
  }
  document.size = blob.size
  document.lastModified = Date.now()
  document.updatedAt = Date.now()
  documentsCache = sortByLastOpened(documentsCache)
  memoryFiles.set(id, blob)
  if (documentBackend.isSupported()) {
    try {
      await documentBackend.putFile({ key: id, blob })
      await documentBackend.putDocument(document)
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : 'The document could not be saved to this device.',
      }
    }
  }
  notifyListeners()
  return { error: null }
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/** Downloads the stored file under its original name. Returns an error message or null. */
export async function downloadDocument(id: string): Promise<string | null> {
  const document = await getLocalDocument(id)
  if (!document) return 'This local document could not be found.'
  const blob = await getFileBlob(id)
  if (!blob) return 'This local document could not be read from storage.'
  downloadBlob(blob, document.name)
  return null
}

/** Downloads a copy of the stored file under a "… copy" name. */
export async function downloadDocumentCopy(
  id: string,
  label = 'copy',
): Promise<string | null> {
  const document = await getLocalDocument(id)
  if (!document) return 'This local document could not be found.'
  const blob = await getFileBlob(id)
  if (!blob) return 'This local document could not be read from storage.'
  const { base } = splitName(document.name)
  downloadBlob(blob, `${base} ${label}.${document.extension}`)
  return null
}

/** Removes every registered local document, folder and stored file blob. */
export async function clearLocalDocuments(): Promise<void> {
  await ensureLoaded()
  await ensureFoldersLoaded()
  const removed = documentsCache
  const removedFolders = foldersCache
  documentsCache = []
  memoryFiles.clear()
  foldersCache = []
  if (documentBackend.isSupported()) {
    try {
      for (const document of removed) {
        await documentBackend.deleteFile(document.id)
        await documentBackend.deleteDocument(document.id)
      }
      for (const folder of removedFolders) {
        await documentBackend.deleteFolder(folder.id)
      }
    } catch {
      // Best effort: the records are already gone from the session view.
    }
  }
  notifyListeners()
}
