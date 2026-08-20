export type ToolOptionValue = string | number | boolean

/** Runtime options collected from the tool page fields. */
export interface LocalToolOptions {
  [key: string]: ToolOptionValue | undefined
}

export interface LocalToolContext {
  files: File[]
  options: LocalToolOptions
  onProgress?: (progress: number, label: string) => void
}

export interface LocalToolResult {
  blob: Blob
  filename: string
  mimeType: string
  /** Short description shown in the result card (e.g. "3 pages · 1.2 MB"). */
  summary?: string
  /** Optional details for the result panel. */
  details?: { label: string; value: string }[]
}

export type LocalToolHandler = (
  context: LocalToolContext,
) => Promise<LocalToolResult>

export interface LocalToolDefinition {
  id: string
  handler: LocalToolHandler
}

export class LocalToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LocalToolError'
  }
}

export function localBytes(blob: Blob): Promise<Uint8Array> {
  return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer))
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}