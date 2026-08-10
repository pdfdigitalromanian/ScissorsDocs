import { useId } from 'react'
import type { ReactNode } from 'react'

interface HomeSectionProps {
  id?: string
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}

/**
 * HomeSection — semantic landing-page section with a linked heading and
 * an optional trailing action (e.g. a "View all" link).
 */
export default function HomeSection({
  id,
  title,
  description,
  action,
  children,
}: HomeSectionProps) {
  const titleId = useId()

  return (
    <section
      className="home-section"
      id={id}
      aria-labelledby={titleId}
    >
      <header className="home-section__header">
        <div className="home-section__heading">
          <h2 id={titleId} className="home-section__title">
            {title}
          </h2>
          {description && (
            <p className="home-section__description">{description}</p>
          )}
        </div>
        {action && <div className="home-section__action">{action}</div>}
      </header>
      {children}
    </section>
  )
}
