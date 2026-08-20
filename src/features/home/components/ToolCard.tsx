import { useNavigate } from 'react-router-dom'
import { Icon } from '@/components/icons/Icon'
import { useToast } from '@/components/ui'
import type { HomeTool } from '../data/home-catalog'

interface ToolCardProps {
  tool: HomeTool
}

const IMPLEMENTED_TOOLS = new Set([
  'edit-text',
  'edit-shapes',
  'edit-images',
  'convert-images-to-pdf',
  'convert-pdf-to-images',
  'convert-pdf-to-text',
  'convert-text-to-pdf',
  'convert-html-to-pdf',
  'convert-word-to-pdf',
  'convert-pdf-to-word',
  'convert-pptx-to-pdf',
  'convert-pdf-to-pptx',
  'convert-xlsx-to-pdf',
  'convert-pdf-to-xlsx',
  'web-to-pdf',
  'organize-merge',
  'organize-split',
  'organize-rotate',
  'organize-extract',
  'organize-delete',
  'organize-rearrange',
  'optimize-compress',
  'optimize-ocr',
  'compare-pdf',
  'security-protect',
  'security-unlock',
  'security-watermark',
])

/**
 * ToolCard routes implemented tools into their workspace/tool page and keeps
 * the remaining catalogue entries honest about their availability.
 */
export default function ToolCard({ tool }: ToolCardProps) {
  const navigate = useNavigate()
  const { toast } = useToast()

  function handleActivate() {
    if (tool.id === 'edit-text') {
      navigate('/workspace?tool=edit-text')
      return
    }
    if (IMPLEMENTED_TOOLS.has(tool.id)) {
      navigate(`/tools/${tool.id}`)
      return
    }
    toast({
      title: tool.label,
      description: 'This tool arrives in a later phase.',
      variant: 'info',
    })
  }

  return (
    <button type="button" className="home-tool" onClick={handleActivate}>
      <span
        className={`home-icon home-icon--sm home-icon--${tool.tone}`}
        aria-hidden="true"
      >
        <Icon name={tool.icon} size="sm" />
      </span>
      <span className="home-tool__label">{tool.label}</span>
    </button>
  )
}