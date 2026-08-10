import { Icon } from '@/components/icons/Icon'
import HomeSection from './HomeSection'
import ToolCard from './ToolCard'
import { homeToolCategories } from '../data/home-catalog'

/**
 * ToolCategories — grouped catalogue of every document capability,
 * organised around user goals (Edit, Convert, Organize, ...).
 */
export default function ToolCategories() {
  return (
    <HomeSection
      title="Explore the tools"
      description="Browse every document capability, grouped by task."
    >
      <div className="home-categories">
        {homeToolCategories.map((category) => {
          const headingId = `${category.id}-title`

          return (
            <article
              key={category.id}
              className="home-category"
              aria-labelledby={headingId}
            >
              <header className="home-category__header">
                <span
                  className={`home-icon home-icon--${category.tone}`}
                  aria-hidden="true"
                >
                  <Icon name={category.icon} size="lg" />
                </span>
                <div className="home-category__heading">
                  <h3 id={headingId} className="home-category__title">
                    {category.label}
                  </h3>
                  <p className="home-category__description">
                    {category.description}
                  </p>
                </div>
              </header>
              <div className="home-category__tools">
                {category.tools.map((tool) => (
                  <ToolCard key={tool.id} tool={tool} />
                ))}
              </div>
            </article>
          )
        })}
      </div>
    </HomeSection>
  )
}
