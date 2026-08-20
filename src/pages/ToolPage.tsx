import { Link, Navigate, useParams } from 'react-router-dom'
import { Icon } from '@/components/icons/Icon'
import EmptyState from '@/components/ui/EmptyState'
import ToolRunner from '@/features/tools/components/ToolRunner'
import {
  getOrganizeTool,
  isOrganizeTool,
} from '@/features/tools/organize/organize-tools'
import {
  getSecurityTool,
  isSecurityTool,
} from '@/features/tools/security/security-tools'
import { getSignTool, isSignTool } from '@/features/tools/sign/sign-tools'
import { getRedactTool, isRedactTool } from '@/features/tools/redact/redact-tools'
import { getWebTool, isWebTool } from '@/features/tools/web/web-tools'
import {
  getAnnotateTool,
  isAnnotateTool,
} from '@/features/tools/annotate/annotate-tools'
import { getOcrTool, isOcrTool } from '@/features/tools/ocr/ocr-tools'
import {
  getCompareTool,
  isCompareTool,
} from '@/features/tools/compare/compare-tools'
import {
  getConvertTool,
  isConvertTool,
} from '@/features/tools/convert/convert-tools'
import {
  getWatermarkTool,
  isWatermarkTool,
} from '@/features/tools/watermark/watermark-tools'
import { getToolDefinition } from '@/features/tools/tool-definitions'
import ErrorBoundary from '@/components/ErrorBoundary'
import '@/features/tools/tools.css'
import '@/features/tools/organize/organize.css'
import '@/features/tools/security/security.css'
import '@/features/tools/web/web.css'
import '@/features/tools/sign/sign.css'
import '@/features/tools/redact/redact.css'
import '@/features/tools/annotate/annotate.css'
import '@/features/tools/ocr/ocr.css'
import '@/features/tools/compare/compare.css'
import '@/features/tools/convert/convert.css'
import '@/features/tools/watermark/watermark.css'
import '@/features/tools/stage/stage.css'

export default function ToolPage() {
  const { toolId = '' } = useParams()
  const tool = getToolDefinition(toolId)
  const OrganizeTool = getOrganizeTool(toolId)
  const SecurityTool = getSecurityTool(toolId)
  const WebTool = getWebTool(toolId)
  const SignTool = getSignTool(toolId)
  const RedactTool = getRedactTool(toolId)
  const AnnotateTool = getAnnotateTool(toolId)
  const OcrTool = getOcrTool(toolId)
  const CompareTool = getCompareTool(toolId)
  const ConvertTool = getConvertTool(toolId)
  const WatermarkTool = getWatermarkTool(toolId)

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

      {OrganizeTool && isOrganizeTool(toolId) ? (
        <ErrorBoundary>
          <OrganizeTool key={tool.id} />
        </ErrorBoundary>
      ) : SecurityTool && isSecurityTool(toolId) ? (
        <ErrorBoundary>
          <SecurityTool key={tool.id} />
        </ErrorBoundary>
      ) : SignTool && isSignTool(toolId) ? (
        <ErrorBoundary>
          <SignTool key={tool.id} />
        </ErrorBoundary>
      ) : RedactTool && isRedactTool(toolId) ? (
        <ErrorBoundary>
          <RedactTool key={tool.id} />
        </ErrorBoundary>
      ) : AnnotateTool && isAnnotateTool(toolId) ? (
        <ErrorBoundary>
          <AnnotateTool key={tool.id} />
        </ErrorBoundary>
      ) : OcrTool && isOcrTool(toolId) ? (
        <ErrorBoundary>
          <OcrTool key={tool.id} />
        </ErrorBoundary>
      ) : CompareTool && isCompareTool(toolId) ? (
        <ErrorBoundary>
          <CompareTool key={tool.id} />
        </ErrorBoundary>
      ) : ConvertTool && isConvertTool(toolId) ? (
        <ErrorBoundary>
          <ConvertTool key={tool.id} />
        </ErrorBoundary>
      ) : WatermarkTool && isWatermarkTool(toolId) ? (
        <ErrorBoundary>
          <WatermarkTool key={tool.id} />
        </ErrorBoundary>
      ) : WebTool && isWebTool(toolId) ? (
        <ErrorBoundary>
          <WebTool key={tool.id} />
        </ErrorBoundary>
      ) : (
        <ErrorBoundary>
          <ToolRunner key={tool.id} tool={tool} />
        </ErrorBoundary>
      )}
    </div>
  )
}
