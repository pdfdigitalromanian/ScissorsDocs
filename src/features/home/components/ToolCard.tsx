import { Icon } from '@/components/icons/Icon'
import { useToast } from '@/components/ui'
import type { HomeTool } from '../data/home-catalog'

interface ToolCardProps {
  tool: HomeTool
}

/**
 * ToolCard — placeholder card for a future document tool.
 * Presentation only; activating one confirms the upcoming capability.
 */
export default function ToolCard({ tool }: ToolCardProps) {
  const { toast } = useToast()

  function handleActivate() {
    toast({
      title: tool.label,
      description: 'This tool arrives in a later phase.',
      variant: 'info',
    })
  }

  return (
    <button type="button" className="home-tool" onClick={handleActivate}>
      <span className={`home-icon home-icon--sm home-icon--${tool.tone}`} aria-hidden="true">
        <Icon name={tool.icon} size="sm" />
      </span>
      <span className="home-tool__label">{tool.label}</span>
    </button>
  )
}
