import { workspaceBackend } from '@/features/documents/storage/db'
import type { PdfFitMode, PdfViewMode } from './PdfSessionProvider'

const SESSION_PREFIX = 'pdf-session:'

export interface PdfSessionSnapshot {
  page: number
  zoom: number
  fitMode: PdfFitMode
  mode: PdfViewMode
  /** Page rotation in degrees — one of 0, 90, 180, 270. */
  rotation?: number
}

const ROTATIONS = [0, 90, 180, 270]

function readRotation(value: unknown): number {
  return typeof value === 'number' && ROTATIONS.includes(value) ? value : 0
}

function sessionKey(id: string): string {
  return `${SESSION_PREFIX}${id}`
}

/** Loads the persisted view session for a PDF document id. */
export async function loadPdfSession(
  id: string,
): Promise<PdfSessionSnapshot | null> {
  if (!workspaceBackend.isSupported()) return null
  try {
    const raw = await workspaceBackend.getValue(sessionKey(id))
    if (!raw || typeof raw !== 'object') return null
    const snapshot = raw as Partial<PdfSessionSnapshot>
    if (typeof snapshot.page !== 'number') return null
    return {
      page: snapshot.page,
      zoom:
        typeof snapshot.zoom === 'number' && snapshot.zoom > 0
          ? snapshot.zoom
          : 1,
      fitMode:
        snapshot.fitMode === 'width' ||
        snapshot.fitMode === 'page' ||
        snapshot.fitMode === 'manual'
          ? snapshot.fitMode
          : 'width',
      mode:
        snapshot.mode === 'continuous' || snapshot.mode === 'single'
          ? snapshot.mode
          : 'continuous',
      rotation: readRotation(snapshot.rotation),
    }
  } catch {
    return null
  }
}

/** Persists the current view session for a PDF document id. */
export async function savePdfSession(
  id: string,
  snapshot: PdfSessionSnapshot,
): Promise<void> {
  if (!workspaceBackend.isSupported()) return
  try {
    await workspaceBackend.putValue(sessionKey(id), snapshot)
  } catch {
    // Storage unavailable — the session is not persisted.
  }
}
