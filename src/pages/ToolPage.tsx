import { Link, Navigate, useParams } from 'react-router-dom'
import { Icon } from '@/components/icons/Icon'
import EmptyState from '@/components/ui/EmptyState'
import ToolRunner from '@/features/tools/components/ToolRunner'
import { getToolDefinition } from '@/features/tools/tool-definitions'
import '@/features/tools/tools.css'

export default function ToolPage() {
  const { toolId = '' } = useParams()
  const tool = getToolDefinition(toolId)

  if (toolId === 'edit-text') {
    return <Navigate to="/workspace?tool=edit-text" replace />
  }

  if (!tool) {
    return (
      <div className="tool-page tool-page--missing">
        <EmptyState
          headingLevel="h1"
          icon="tools"
          title="Tool not found"
          description="This tool module is not registered."
          action={<Link to="/tools">Browse document tools</Link>}
        />
      </div>
    )
  }

  return (
    <div className="tool-page page-enter">
      <nav className="tool-page__breadcrumb" aria-label="Breadcrumb">
        <Link to="/tools">Tools</Link>
        <Icon name="chevron-right" size="xs" aria-hidden="true" />
        <span aria-current="page">{tool.label}</span>
      </nav>

      <header className="tool-page__header">
        <span
          className={`tools-icon tools-icon--lg tools-icon--${tool.tone}`}
          aria-hidden="true"
        >
          <Icon name={tool.icon} size="lg" />
        </span>
        <div>
          <p className="tool-page__category">{tool.category}</p>
          <h1>{tool.label}</h1>
          <p>{tool.description}</p>
        </div>
      </header>

      <ToolRunner key={tool.id} tool={tool} />
    </div>
  )
}
