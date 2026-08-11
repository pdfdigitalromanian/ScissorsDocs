import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { WorkspaceArea } from '@/features/workspace'

/**
 * WorkspacePage resolves the workspace's deep-linked documents. It accepts
 * a single `?doc=` id (used by the library, recent/favorites cards) and a
 * comma-separated `?docs=` list (used when several files are uploaded at
 * once). The merged, deduplicated id list initializes the workspace
 * sessions.
 */
export default function WorkspacePage() {
  const [searchParams] = useSearchParams()

  const initialDocumentIds = useMemo(() => {
    const ids: string[] = []
    const single = searchParams.get('doc')
    if (single) ids.push(single)
    const many = searchParams.get('docs')
    if (many) {
      for (const id of many.split(',')) {
        const trimmed = id.trim()
        if (trimmed) ids.push(trimmed)
      }
    }
    return [...new Set(ids)]
  }, [searchParams])

  return <WorkspaceArea initialDocumentIds={initialDocumentIds} />
}
