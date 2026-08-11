import { useEffect, useState } from 'react'
import type { LocalDocument, LocalFolder } from './types'
import {
  getFileBlob,
  getLocalDocuments,
  getLocalFolders,
  getTrashedDocuments,
  subscribeLocalDocuments,
} from './storage/registry'

/** Reactive view of the local document registry. Re-renders whenever a
 * document is registered, renamed, touched, trashed or removed. */
export function useLocalDocuments(): LocalDocument[] {
  const [documents, setDocuments] = useState<LocalDocument[]>(
    getLocalDocuments,
  )

  useEffect(() => {
    const update = () => setDocuments(getLocalDocuments())
    const unsubscribe = subscribeLocalDocuments(update)
    return unsubscribe
  }, [])

  return documents
}

/** Reactive view of the local folder set. */
export function useLocalFolders(): LocalFolder[] {
  const [folders, setFolders] = useState<LocalFolder[]>(getLocalFolders)

  useEffect(() => {
    const update = () => setFolders(getLocalFolders())
    const unsubscribe = subscribeLocalDocuments(update)
    return unsubscribe
  }, [])

  return folders
}

/** Reactive view of the trash (soft-deleted documents). */
export function useTrashedDocuments(): LocalDocument[] {
  const [documents, setDocuments] = useState<LocalDocument[]>(
    getTrashedDocuments,
  )

  useEffect(() => {
    const update = () => setDocuments(getTrashedDocuments())
    const unsubscribe = subscribeLocalDocuments(update)
    return unsubscribe
  }, [])

  return documents
}

export type LocalFileLoadState = 'idle' | 'loading' | 'ready' | 'error'

export interface LocalFileLoadResult {
  state: LocalFileLoadState
  blob: Blob | null
  error: string | null
}

/** Loads the stored file blob for a registered local document. */
export function useLocalDocumentBlob(id?: string): LocalFileLoadResult {
  const [state, setState] = useState<LocalFileLoadState>(id ? 'loading' : 'idle')
  const [blob, setBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resolvedId, setResolvedId] = useState(id)

  if (resolvedId !== id) {
    setResolvedId(id)
    setBlob(null)
    setError(null)
    setState(id ? 'loading' : 'idle')
  }

  useEffect(() => {
    if (!id) return

    let cancelled = false

    getFileBlob(id)
      .then((loaded) => {
        if (cancelled) return
        if (!loaded) {
          setState('error')
          setError('This local document could not be read from storage.')
          return
        }
        setBlob(loaded)
        setState('ready')
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setState('error')
        setError(
          reason instanceof Error
            ? reason.message
            : 'This local document could not be read.',
        )
      })

    return () => {
      cancelled = true
    }
  }, [id])

  return { state, blob, error }
}
