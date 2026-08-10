import type { ReactNode } from 'react'
import Spinner from '@/components/ui/Spinner'
import './layout-states.css'

interface LoadingStateProps {
  label?: string
  children?: ReactNode
  className?: string
}

/**
 * LoadingState is a centered placeholder used while content is being
 * fetched or processed. It pairs a spinner with an optional label.
 */
export default function LoadingState({
  label = 'Loading…',
  children,
  className = '',
}: LoadingStateProps) {
  return (
    <div
      className={`loading-state${className ? ` ${className}` : ''}`}
      role="status"
      aria-live="polite"
    >
      <Spinner size="md" />
      {label && <p className="loading-state__label">{label}</p>}
      {children}
    </div>
  )
}
