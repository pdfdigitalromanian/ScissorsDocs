import type { ReactNode } from 'react'
import { ScrollArea } from '@/components/layout'

interface WorkspaceCanvasProps {
  children: ReactNode
}

/**
 * WorkspaceCanvas is the scrollable document surface. It is announced as
 * a labelled region and focusable for assistive users, and centers the
 * active document container within it.
 */
export function WorkspaceCanvas({ children }: WorkspaceCanvasProps) {
  return (
    <ScrollArea ariaLabel="Document canvas" className="workspace-canvas">
      {children}
    </ScrollArea>
  )
}
