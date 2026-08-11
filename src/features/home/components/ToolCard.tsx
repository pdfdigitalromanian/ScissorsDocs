import { useNavigate } from 'react-router-dom'
import { Icon } from '@/components/icons/Icon'
import { useToast } from '@/components/ui'
import type { HomeTool } from '../data/home-catalog'

interface ToolCardProps {
  tool: HomeTool
}

/**
 * ToolCard routes implemented tools into their workspace and keeps the
 * remaining catalogue entries honest about their availability.
 */
export default function ToolCard({ tool }: ToolCardProps) {
  const navigate = useNavigate()
  const { toast } = useToast()

  function handleActivate() {
    if (tool.id === 'edit-text') {
      navigate('/workspace?tool=edit-text')
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
