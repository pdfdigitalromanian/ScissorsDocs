import { Link } from 'react-router-dom'
import { Icon } from '@/components/icons/Icon'
import { homeToolCategories } from '@/features/home/data/home-catalog'
import '@/features/tools/tools.css'

export default function ToolsPage() {
  return (
    <div className="tools-page page-enter">
      <header className="tools-page__header">
        <h1>Document tools</h1>
        <p>Choose a focused workflow and process your files locally.</p>
      </header>

      <div className="tools-page__categories">
        {homeToolCategories.map((category) => (
          <section
            key={category.id}
            className="tools-category"
            aria-labelledby={`tools-page-${category.id}`}
          >
            <header className="tools-category__header">
              <span
                className={`tools-icon tools-icon--${category.tone}`}
                aria-hidden="true"
              >
                <Icon name={category.icon} size="md" />
              </span>
              <div>
                <h2 id={`tools-page-${category.id}`}>{category.label}</h2>
                <p>{category.description}</p>
              </div>
            </header>
            <div className="tools-category__grid">
              {category.tools.map((tool) => (
                <Link
                  key={tool.id}
                  className="tools-card"
                  to={`/tools/${tool.id}`}
                >
                  <span
                    className={`tools-icon tools-icon--${tool.tone}`}
                    aria-hidden="true"
                  >
                    <Icon name={tool.icon} size="sm" />
                  </span>
                  <span className="tools-card__copy">
                    <strong>{tool.label}</strong>
                    <span>{tool.description}</span>
                  </span>
                  <Icon
                    className="tools-card__arrow"
                    name="chevron-right"
                    size="sm"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
