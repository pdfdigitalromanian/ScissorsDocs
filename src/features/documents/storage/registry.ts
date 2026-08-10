import { findFileType } from '../file-types'
import { validateFile } from '../validation'
import type { LocalDocument } from '../types'
import { documentBackend } from './db'

export interface IngestedFileResult {
  document: LocalDocument | null
  error: string | null
}

type Listener = () => void

const listeners = new Set<Listener>()
const memoryFiles = new Map<string, Blob>()
let documentsCache: LocalDocument[] = []
let cacheLoaded = false

function notifyListeners() {
  for (const listener of listeners) listener()
}

function sortByLastOpened(list: LocalDocument[]): LocalDocument[] {
  return [...list].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
}

async function ensureLoaded() {
  if (cacheLoaded) return
  cacheLoaded = true
  if (!documentBackend.isSupported()) return
  try {
    documentsCache = sortByLastOpened(await documentBackend.getAllDocuments())
  } catch {
    documentsCache = []
  }
}

export function subscribeLocalDocuments(listener: Listener): () => void {
  listeners.add(listener)
  void ensureLoaded().then(notifyListeners)
  return () => listeners.delete(listener)
}

export function getLocalDocuments(): LocalDocument[] {
  return documentsCache
}

export async function getLocalDocument(
  id: string,
): Promise<LocalDocument | undefined> {
  await ensureLoaded()
  return documentsCache.find((document) => document.id === id)
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

export async function removeDocument(id: string): Promise<void> {
  await ensureLoaded()
  documentsCache = documentsCache.filter((document) => document.id !== id)
  memoryFiles.delete(id)
  if (documentBackend.isSupported()) {
    try {
      await documentBackend.deleteFile(id)
      await documentBackend.deleteDocument(id)
    } catch {
      // Best effort: the record is already gone from the session view.
    }
  }
  notifyListeners()
}

/** Removes every registered local document and its stored file blob. */
export async function clearLocalDocuments(): Promise<void> {
  await ensureLoaded()
  const removed = documentsCache
  documentsCache = []
  memoryFiles.clear()
  if (documentBackend.isSupported()) {
    try {
      for (const document of removed) {
        await documentBackend.deleteFile(document.id)
        await documentBackend.deleteDocument(document.id)
      }
    } catch {
      // Best effort: the records are already gone from the session view.
    }
  }
  notifyListeners()
}

export async function touchDocument(id: string): Promise<void> {
  await ensureLoaded()
  const document = documentsCache.find((entry) => entry.id === id)
  if (!document) return
  document.lastOpenedAt = Date.now()
  documentsCache = sortByLastOpened(documentsCache)
  if (documentBackend.isSupported()) {
    await documentBackend.putDocument(document)
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
