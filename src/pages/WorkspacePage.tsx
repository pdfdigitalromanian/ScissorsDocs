import { useSearchParams } from 'react-router-dom'
import { WorkspaceArea } from '@/features/workspace'

export default function WorkspacePage() {
  const [searchParams] = useSearchParams()
  const initialDocumentId = searchParams.get('doc') ?? undefined

  return <WorkspaceArea initialDocumentId={initialDocumentId} />
}
