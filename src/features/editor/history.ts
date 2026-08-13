/**
 * ByteHistory — a reusable undo/redo stack for the PDF editor.
 *
 * The editor treats the serialized PDF bytes as its authoritative state.
 * Every committed operation produces a new byte array, and the history
 * keeps the states that preceded the current one so undo/redo simply
 * swap the active bytes. The stack is bounded to keep memory predictable
 * on large documents.
 *
 * Because the history is state-based rather than command-based, any future
 * editing operation (annotation, text, images, …) integrates with undo/redo
 * automatically as long as it commits new bytes.
 */
export class ByteHistory {
  private readonly capacity: number
  private past: Uint8Array[] = []
  private future: Uint8Array[] = []

  constructor(capacity = 20) {
    this.capacity = capacity
  }

  /**
   * Records `current` as the state before the next edit. When `coalesce` is
   * true the previous entry is kept instead of pushing a new one, so a burst
   * of related commits (for example the create-then-edit of a text element)
   * undoes as a single logical step back to the state that predates the
   * burst.
   */
  commit(current: Uint8Array, coalesce = false): void {
    if (!coalesce) {
      this.past.push(current)
      if (this.past.length > this.capacity) {
        this.past.shift()
      }
    }
    this.future.length = 0
  }

  canUndo(): boolean {
    return this.past.length > 0
  }

  canRedo(): boolean {
    return this.future.length > 0
  }

  /** Moves back to the previous state, returning it (or null). */
  undo(current: Uint8Array): Uint8Array | null {
    const previous = this.past.pop()
    if (!previous) return null
    this.future.push(current)
    return previous
  }

  /** Moves forward to the next state, returning it (or null). */
  redo(current: Uint8Array): Uint8Array | null {
    const next = this.future.pop()
    if (!next) return null
    this.past.push(current)
    return next
  }

  clear(): void {
    this.past.length = 0
    this.future.length = 0
  }
}
