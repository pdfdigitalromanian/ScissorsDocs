import type { LocalDocument } from '../types'
import type { KeyValueBackend, LocalDocumentBackend, StoredFile } from './types'

const DB_NAME = 'scissorsdoc'
const DB_VERSION = 2
const DOCUMENT_STORE = 'documents'
const FILE_STORE = 'files'
const WORKSPACE_STORE = 'workspace'

export type { StoredFile }

export function isStorageSupported(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      reject(
        new Error(
          'The browser could not complete a local storage operation. This data could not be persisted.',
        ),
      )
    }
  })
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => {
      reject(
        new Error(
          'The browser could not complete a local storage operation. This data could not be persisted.',
        ),
      )
    }
    transaction.onabort = () => {
      reject(
        new Error(
          'Local storage was unavailable. Changes are available for this session only.',
        ),
      )
    }
  })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DOCUMENT_STORE)) {
        db.createObjectStore(DOCUMENT_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(WORKSPACE_STORE)) {
        db.createObjectStore(WORKSPACE_STORE, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      reject(
        new Error(
          'The browser blocked local storage. Data cannot be persisted on this device.',
        ),
      )
    }
  })
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase()
  try {
    const transaction = db.transaction(storeName, mode)
    return await requestToPromise(operation(transaction.objectStore(storeName)))
  } finally {
    db.close()
  }
}

async function withTransaction(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  operation: (stores: Record<string, IDBObjectStore>) => void,
): Promise<void> {
  const db = await openDatabase()
  try {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames]
    const transaction = db.transaction(names, mode)
    const stores: Record<string, IDBObjectStore> = {}
    for (const name of names) {
      stores[name] = transaction.objectStore(name)
    }
    operation(stores)
    await transactionToPromise(transaction)
  } finally {
    db.close()
  }
}

/* ------------------------------------------------------------------ *
 * Document backend — IndexedDB implementation of LocalDocumentBackend
 * ------------------------------------------------------------------ */

export const documentBackend: LocalDocumentBackend = {
  isSupported: isStorageSupported,

  getDocument(id: string): Promise<LocalDocument | undefined> {
    return withStore(DOCUMENT_STORE, 'readonly', (store) =>
      store.get(id),
    ) as Promise<LocalDocument | undefined>
  },

  getAllDocuments(): Promise<LocalDocument[]> {
    return withStore(DOCUMENT_STORE, 'readonly', (store) => store.getAll())
  },

  putDocument(document: LocalDocument): Promise<void> {
    return withTransaction(DOCUMENT_STORE, 'readwrite', (stores) => {
      stores[DOCUMENT_STORE].put(document)
    })
  },

  deleteDocument(id: string): Promise<void> {
    return withTransaction(DOCUMENT_STORE, 'readwrite', (stores) => {
      stores[DOCUMENT_STORE].delete(id)
    })
  },

  getFile(key: string): Promise<StoredFile | undefined> {
    return withStore(FILE_STORE, 'readonly', (store) =>
      store.get(key),
    ) as Promise<StoredFile | undefined>
  },

  putFile(record: StoredFile): Promise<void> {
    return withTransaction(FILE_STORE, 'readwrite', (stores) => {
      stores[FILE_STORE].put(record)
    })
  },

  deleteFile(key: string): Promise<void> {
    return withTransaction(FILE_STORE, 'readwrite', (stores) => {
      stores[FILE_STORE].delete(key)
    })
  },
}

/* ------------------------------------------------------------------ *
 * Workspace key-value backend — IndexedDB implementation
 * ------------------------------------------------------------------ */

export const workspaceBackend: KeyValueBackend = {
  isSupported: isStorageSupported,

  getValue(key: string): Promise<unknown | undefined> {
    return withStore(WORKSPACE_STORE, 'readonly', (store) =>
      store.get(key),
    ).then((record) => (record as { value?: unknown } | undefined)?.value)
  },

  putValue(key: string, value: unknown): Promise<void> {
    return withTransaction(WORKSPACE_STORE, 'readwrite', (stores) => {
      stores[WORKSPACE_STORE].put({ key, value })
    })
  },

  deleteValue(key: string): Promise<void> {
    return withTransaction(WORKSPACE_STORE, 'readwrite', (stores) => {
      stores[WORKSPACE_STORE].delete(key)
    })
  },

  clearValues(): Promise<void> {
    return withTransaction(WORKSPACE_STORE, 'readwrite', (stores) => {
      stores[WORKSPACE_STORE].clear()
    })
  },
}
