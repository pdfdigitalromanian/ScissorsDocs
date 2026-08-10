import { useId } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import './layout-page.css'

type SectionHeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

interface SectionProps extends HTMLAttributes<HTMLElement> {
  heading?: ReactNode
  headingLevel?: SectionHeadingLevel
  children: ReactNode
}

/**
 * Section is a semantic `<section>` with optional heading. When a
 * heading is provided it is linked to the section via aria-labelledby.
 */
export default function Section({
  heading,
  headingLevel = 'h2',
  children,
  className = '',
  ...rest
}: SectionProps) {
  const titleId = useId()
  const Heading = headingLevel

  return (
    <section
      className={`layout-section${className ? ` ${className}` : ''}`}
      aria-labelledby={heading ? titleId : undefined}
      {...rest}
    >
      {heading && (
        <Heading id={titleId} className="layout-section__title">
          {heading}
        </Heading>
      )}
      {children}
    </section>
  )
}
