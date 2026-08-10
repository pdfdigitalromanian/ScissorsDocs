import type { ReactNode } from 'react'

interface SectionProps {
  id: string
  title: string
  description?: string
  children: ReactNode
}

export default function Section({
  id,
  title,
  description,
  children,
}: SectionProps) {
  return (
    <section id={id} className="sg-section">
      <header className="sg-section__header">
        <h2 className="sg-section__title">{title}</h2>
        {description ? (
          <p className="sg-section__description">{description}</p>
        ) : null}
      </header>
      <div className="sg-section__body">{children}</div>
    </section>
  )
}
