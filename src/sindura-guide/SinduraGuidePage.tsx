import { APP_NAME, LOGO_URL } from '@/config/app'
import { Link } from 'react-router-dom'
import { Icon } from '@/components/icons/Icon'
import { ThemeMenu } from '@/components/ui/ThemeMenu'
import Button from './components/Button'
import ColorSwatch from './components/ColorSwatch'
import Dropdown from './components/Dropdown'
import Section from './components/Section'
import { useCssVar } from './components/useCssVar'
import './sindura-guide.css'

const NAV_SECTIONS = [
  { id: 'colors', label: 'Colors' },
  { id: 'typography', label: 'Typography' },
  { id: 'spacing', label: 'Spacing' },
  { id: 'radius', label: 'Radius' },
  { id: 'shadows', label: 'Shadows' },
  { id: 'components', label: 'Components' },
  { id: 'notes', label: 'Notes' },
]

const BASE_COLORS = [
  ['primary-raw', 'Primary Raw'],
  ['secondary-raw', 'Secondary Raw'],
  ['surface-raw', 'Surface Raw'],
  ['success-raw', 'Success Raw'],
  ['warning-raw', 'Warning Raw'],
  ['error-raw', 'Error Raw'],
  ['info-raw', 'Info Raw'],
] as const

const SEMANTIC_COLORS = [
  ['background', 'Background'],
  ['surface', 'Surface'],
  ['surface-secondary', 'Surface Secondary'],
  ['card', 'Card'],
  ['border', 'Border'],
  ['border-light', 'Border Light'],
  ['border-strong', 'Border Strong'],
  ['text', 'Text'],
  ['text-secondary', 'Text Secondary'],
  ['text-muted', 'Text Muted'],
  ['heading', 'Heading'],
  ['link', 'Link'],
  ['primary', 'Primary'],
  ['primary-hover', 'Primary Hover'],
  ['primary-active', 'Primary Active'],
  ['success', 'Success'],
  ['warning', 'Warning'],
  ['error', 'Error'],
  ['info', 'Info'],
] as const

const PALETTES = [
  ['primary', 'Primary'],
  ['secondary', 'Secondary'],
  ['neutral', 'Neutral'],
  ['success', 'Success'],
  ['warning', 'Warning'],
  ['error', 'Error'],
  ['info', 'Info'],
] as const

const SHADES = [
  '50',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  '950',
]

const TYPE_SCALE = [
  { token: 'display-xl', label: 'Display XL', sample: APP_NAME },
  { token: 'display-l', label: 'Display L', sample: 'Design with clarity' },
  { token: 'display-m', label: 'Display M', sample: 'A space for your words' },
  { token: 'heading-1', label: 'Heading 1', sample: 'Document heading' },
  { token: 'heading-2', label: 'Heading 2', sample: 'Section title' },
  { token: 'heading-3', label: 'Heading 3', sample: 'Subsection title' },
  { token: 'heading-4', label: 'Heading 4', sample: 'Group heading' },
  { token: 'heading-5', label: 'Heading 5', sample: 'Item heading' },
  { token: 'heading-6', label: 'Heading 6', sample: 'Small heading' },
  {
    token: 'body-xl',
    label: 'Body XL',
    sample:
      'Body text used for longer reading passages and supporting copy across the interface.',
  },
  {
    token: 'body-l',
    label: 'Body L',
    sample:
      'Default body text for most content — clear, comfortable and easy to read.',
  },
  {
    token: 'body-m',
    label: 'Body M',
    sample:
      'Compact body text for dense areas, tables and secondary interface copy.',
  },
  {
    token: 'body-s',
    label: 'Body S',
    sample:
      'Small body text for tight spaces, metadata and supporting annotations.',
  },
  {
    token: 'caption',
    label: 'Caption',
    sample: 'Captions for hints, fine print and image credits.',
  },
  {
    token: 'label',
    label: 'Label',
    sample: 'Labels for form fields, navigation items and badges.',
  },
  { token: 'button', label: 'Button', sample: 'Button label' },
]

const FONT_WEIGHTS = [
  { token: 'regular', label: 'Regular', sample: 'Aa 400' },
  { token: 'medium', label: 'Medium', sample: 'Aa 500' },
  { token: 'semibold', label: 'Semibold', sample: 'Aa 600' },
  { token: 'bold', label: 'Bold', sample: 'Aa 700' },
  { token: 'extrabold', label: 'Extrabold', sample: 'Aa 800' },
]

const SPACES = Array.from({ length: 19 }, (_, index) => `space-${index}`)

const RADII = [
  'none',
  'xs',
  'sm',
  'md',
  'lg',
  'xl',
  '2xl',
  '3xl',
  'pill',
  'circle',
]

const SHADOWS = [
  'xs',
  'sm',
  'md',
  'lg',
  'xl',
  '2xl',
  'inner',
  'panel',
  'dropdown',
  'card',
  'modal',
]

const ELEVATIONS = ['0', '1', '2', '3', '4', '5']

const NOTES = [
  {
    tone: 'primary',
    title: 'Token-first styling',
    body: 'Every color, size, shadow and space you see on this page is a CSS variable from src/styles/tokens.css. The page itself only composes tokens — it hardcodes nothing.',
  },
  {
    tone: 'info',
    title: 'Rendered live from the source',
    body: 'The values shown here (hex, sizes, weights, shadows) are read directly from the live computed tokens. Edit a token in tokens.css and this page updates to match.',
  },
  {
    tone: 'success',
    title: 'Self-contained and deletable',
    body: 'Everything on this page lives in src/sindura-guide/. Delete that folder and remove the /sindura route from src/App.tsx — nothing else is affected.',
  },
  {
    tone: 'warning',
    title: 'Never invent values',
    body: 'When building real features, reference tokens with var(--token). If the right token does not exist, add it to DESIGN_TOKENS.md and tokens.css together — never hardcode a value.',
  },
]

function Hero() {
  return (
    <section id="top" className="sg-hero">
      <div className="sg-hero__content">
        <h1 className="sg-hero__title">{APP_NAME}</h1>
        <p className="sg-hero__subtitle">
          The {APP_NAME} visual language — colors, type, space, radius, shadow
          and components, all rendered live from the design tokens.
        </p>
        <div className="sg-hero__actions">
          <a className="sg-btn sg-btn--primary sg-btn--lg" href="#colors">
            Explore the tokens
          </a>
          <a className="sg-btn sg-btn--outline sg-btn--lg" href="#components">
            View components
          </a>
        </div>
      </div>
      <div className="sg-hero__hanging">
        <span className="sg-hero__nail" aria-hidden="true" />
        <svg
          className="sg-hero__wire"
          viewBox="0 0 100 60"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            className="sg-hero__wire-line"
            d="M50 0 L18 60"
            pathLength="1"
          />
          <path
            className="sg-hero__wire-line"
            d="M50 0 L82 60"
            pathLength="1"
          />
        </svg>
        <div className="sg-hero__frame">
          <span className="sg-hero__logo-badge">
            <img
              className="sg-hero__logo"
              src={LOGO_URL}
              alt={`${APP_NAME} logo`}
            />
          </span>
        </div>
        <p className="sg-hero__plaque">{APP_NAME}</p>
      </div>
    </section>
  )
}

function TypeSpecimen({
  token,
  label,
  sample,
}: {
  token: string
  label: string
  sample: string
}) {
  const size = useCssVar(`--text-${token}-size`)
  const lineHeight = useCssVar(`--text-${token}-line-height`)
  const weight = useCssVar(`--text-${token}-weight`)
  const letterSpacing = useCssVar(`--text-${token}-letter-spacing`)

  return (
    <div className="sg-type">
      <p
        className="sg-type__sample"
        style={{
          fontSize: `var(--text-${token}-size)`,
          lineHeight: `var(--text-${token}-line-height)`,
          fontWeight: `var(--text-${token}-weight)`,
          letterSpacing: `var(--text-${token}-letter-spacing)`,
        }}
      >
        {sample}
      </p>
      <dl className="sg-type__meta">
        <div>
          <dt>Style</dt>
          <dd>{label}</dd>
        </div>
        <div>
          <dt>Token</dt>
          <dd>--text-{token}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{size || '—'}</dd>
        </div>
        <div>
          <dt>Line</dt>
          <dd>{lineHeight || '—'}</dd>
        </div>
        <div>
          <dt>Weight</dt>
          <dd>{weight || '—'}</dd>
        </div>
        <div>
          <dt>Tracking</dt>
          <dd>{letterSpacing || '—'}</dd>
        </div>
      </dl>
    </div>
  )
}

function WeightCard({
  token,
  label,
  sample,
}: {
  token: string
  label: string
  sample: string
}) {
  const value = useCssVar(`--font-weight-${token}`)
  return (
    <div className="sg-weight">
      <p
        className="sg-weight__sample"
        style={{ fontWeight: `var(--font-weight-${token})` }}
      >
        {sample}
      </p>
      <p className="sg-weight__meta">
        {label} · --font-weight-{token}
        {value ? ` (${value})` : ''}
      </p>
    </div>
  )
}

function SpaceRow({ token }: { token: string }) {
  const value = useCssVar(`--${token}`)
  const isZero = token === 'space-0'
  return (
    <div className="sg-space">
      <span className="sg-space__label">--{token}</span>
      <div
        className={`sg-space__bar${isZero ? ' sg-space__bar--zero' : ''}`}
        style={{ width: `var(--${token})` }}
      />
      <span className="sg-space__value">{value || '—'}</span>
    </div>
  )
}

function RadiusRow({ token }: { token: string }) {
  const value = useCssVar(`--radius-${token}`)
  return (
    <div className="sg-radius">
      <div
        className="sg-radius__box"
        style={{ borderRadius: `var(--radius-${token})` }}
      />
      <div className="sg-radius__meta">
        <p className="sg-radius__name">--radius-{token}</p>
        <p className="sg-radius__value">{value || '—'}</p>
      </div>
    </div>
  )
}

function ShadowCard({ token }: { token: string }) {
  const value = useCssVar(`--shadow-${token}`)
  return (
    <div className="sg-shadow" style={{ boxShadow: `var(--shadow-${token})` }}>
      <p className="sg-shadow__label">--shadow-{token}</p>
      <p className="sg-shadow__value">{value || '—'}</p>
    </div>
  )
}

function ElevationCard({ token }: { token: string }) {
  const value = useCssVar(`--elevation-${token}`)
  return (
    <div
      className="sg-elevation"
      style={{ boxShadow: `var(--elevation-${token})` }}
    >
      <p className="sg-elevation__label">--elevation-{token}</p>
      <p className="sg-elevation__value">{value || '—'}</p>
    </div>
  )
}

function ColorsSection() {
  return (
    <Section
      id="colors"
      title="Colors"
      description="Base colors, theme-aware semantic colors and the full 50–950 palettes."
    >
      <div className="sg-block">
        <p className="sg-block__label">Base colors</p>
        <div className="sg-grid sg-grid--base">
          {BASE_COLORS.map(([token, label]) => (
            <ColorSwatch key={token} token={`--color-${token}`} label={label} />
          ))}
        </div>
      </div>

      <div className="sg-block">
        <p className="sg-block__label">Semantic colors · current theme</p>
        <div className="sg-grid sg-grid--semantic">
          {SEMANTIC_COLORS.map(([token, label]) => (
            <ColorSwatch key={token} token={`--color-${token}`} label={label} />
          ))}
        </div>
      </div>

      {PALETTES.map(([base, name]) => (
        <div key={base} className="sg-block">
          <p className="sg-block__label">
            {name} palette · --color-{base}-*
          </p>
          <div className="sg-grid sg-grid--palette">
            {SHADES.map((shade) => (
              <ColorSwatch
                key={shade}
                token={`--color-${base}-${shade}`}
                label={shade}
                compact
              />
            ))}
          </div>
        </div>
      ))}
    </Section>
  )
}

function TypographySection() {
  return (
    <Section
      id="typography"
      title="Typography"
      description="The full type scale, font weights and the Inter variable font."
    >
      <div className="sg-block">
        <p className="sg-block__label">Type scale</p>
        <div className="sg-stack">
          {TYPE_SCALE.map((entry) => (
            <TypeSpecimen key={entry.token} {...entry} />
          ))}
        </div>
      </div>

      <div className="sg-block">
        <p className="sg-block__label">Font weights</p>
        <div className="sg-grid sg-grid--weights">
          {FONT_WEIGHTS.map((entry) => (
            <WeightCard key={entry.token} {...entry} />
          ))}
        </div>
      </div>

      <div className="sg-block">
        <p className="sg-block__label">Font families</p>
        <div className="sg-grid sg-grid--families">
          <div className="sg-family">
            <p className="sg-family__sample">
              The quick brown fox jumps over the lazy dog
            </p>
            <p className="sg-family__meta">
              --font-family · Inter + system stack
            </p>
          </div>
          <div className="sg-family">
            <p className="sg-family__sample sg-family__sample--mono">
              const token = 'var(--space-5)'
            </p>
            <p className="sg-family__meta">
              --font-family-mono · ui-monospace stack
            </p>
          </div>
        </div>
      </div>
    </Section>
  )
}

function SpacingSection() {
  return (
    <Section
      id="spacing"
      title="Spacing"
      description="The 8-point spacing system, --space-0 through --space-18."
    >
      <div className="sg-stack">
        {SPACES.map((token) => (
          <SpaceRow key={token} token={token} />
        ))}
      </div>
    </Section>
  )
}

function RadiusSection() {
  return (
    <Section
      id="radius"
      title="Border radius"
      description="Radii from sharp to fully round, applied to a fixed 56px square."
    >
      <div className="sg-stack">
        {RADII.map((token) => (
          <RadiusRow key={token} token={token} />
        ))}
      </div>
    </Section>
  )
}

function ShadowsSection() {
  return (
    <Section
      id="shadows"
      title="Shadows & elevation"
      description="Every shadow token, plus the five elevation layers built from them."
    >
      <div className="sg-block">
        <p className="sg-block__label">Shadows</p>
        <div className="sg-grid sg-grid--shadows">
          {SHADOWS.map((token) => (
            <ShadowCard key={token} token={token} />
          ))}
        </div>
      </div>

      <div className="sg-block">
        <p className="sg-block__label">Elevation layers</p>
        <div className="sg-grid sg-grid--elevations">
          {ELEVATIONS.map((token) => (
            <ElevationCard key={token} token={token} />
          ))}
        </div>
      </div>
    </Section>
  )
}

function ComponentsSection() {
  return (
    <Section
      id="components"
      title="Components"
      description="Buttons, inputs, a dropdown, badges, a toggle, skeleton loaders and cards — all styled with tokens only."
    >
      <div className="sg-block">
        <p className="sg-block__label">Buttons · variants</p>
        <div className="sg-row">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="success">Success</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
        </div>
      </div>

      <div className="sg-block">
        <p className="sg-block__label">Buttons · sizes</p>
        <div className="sg-row">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
      </div>

      <div className="sg-block">
        <p className="sg-block__label">Inputs</p>
        <div className="sg-stack">
          <input
            className="sg-input"
            type="text"
            placeholder="Type something…"
          />
          <textarea
            className="sg-input"
            rows={3}
            placeholder="A longer note, styled with tokens…"
          />
        </div>
      </div>

      <div className="sg-block">
        <p className="sg-block__label">Dropdown</p>
        <Dropdown />
      </div>

      <div className="sg-block">
        <p className="sg-block__label">Badges</p>
        <div className="sg-row">
          <span className="sg-badge sg-badge--primary">Primary</span>
          <span className="sg-badge sg-badge--success">Success</span>
          <span className="sg-badge sg-badge--warning">Warning</span>
          <span className="sg-badge sg-badge--error">Error</span>
          <span className="sg-badge sg-badge--info">Info</span>
          <span className="sg-badge sg-badge--neutral">Neutral</span>
        </div>
      </div>

      <div className="sg-block">
        <p className="sg-block__label">Toggle</p>
        <label className="sg-toggle">
          <input type="checkbox" defaultChecked />
          <span className="sg-toggle__track">
            <span className="sg-toggle__thumb" />
          </span>
          Toggle me
        </label>
      </div>

      <div className="sg-block">
        <p className="sg-block__label">Skeleton loaders</p>
        <div className="sg-skeleton-demo">
          <div className="skeleton sg-skeleton-demo__title" />
          <div className="skeleton sg-skeleton-demo__line" />
          <div className="skeleton sg-skeleton-demo__line sg-skeleton-demo__line--short" />
        </div>
      </div>

      <div className="sg-block">
        <p className="sg-block__label">
          Active highlights · sidebar link & empty-state icon
        </p>
        <div className="sg-highlight-grid">
          <div className="sg-highlight">
            <p className="sg-highlight__caption">
              sidebar__link--active · current
            </p>
            <div className="sg-highlight__stage">
              <a className="sg-sidebar-link" href="#top">
                <Icon name="home" />
                <span className="sg-sidebar-link__label">Home</span>
              </a>
              <a
                className="sg-sidebar-link sg-sidebar-link--active"
                href="#top"
              >
                <Icon name="workspace" />
                <span className="sg-sidebar-link__label">Workspace</span>
              </a>
            </div>
          </div>
          <div className="sg-highlight">
            <p className="sg-highlight__caption">
              sidebar__link--active · variant
            </p>
            <div className="sg-highlight__stage">
              <a className="sg-sidebar-link" href="#top">
                <Icon name="home" />
                <span className="sg-sidebar-link__label">Home</span>
              </a>
              <a
                className="sg-sidebar-link sg-sidebar-link--active sg-sidebar-link--active-deep"
                href="#top"
              >
                <Icon name="workspace" />
                <span className="sg-sidebar-link__label">Workspace</span>
              </a>
            </div>
          </div>
          <div className="sg-highlight">
            <p className="sg-highlight__caption">
              sidebar__link--active · variant 2
            </p>
            <div className="sg-highlight__stage">
              <a className="sg-sidebar-link" href="#top">
                <Icon name="home" />
                <span className="sg-sidebar-link__label">Home</span>
              </a>
              <a
                className="sg-sidebar-link sg-sidebar-link--active sg-sidebar-link--active-400"
                href="#top"
              >
                <Icon name="workspace" />
                <span className="sg-sidebar-link__label">Workspace</span>
              </a>
            </div>
          </div>
          <div className="sg-highlight">
            <p className="sg-highlight__caption">empty-state__icon · current</p>
            <div className="sg-highlight__stage">
              <div className="sg-state-icon">
                <Icon name="file-text" size="xl" />
              </div>
            </div>
          </div>
          <div className="sg-highlight">
            <p className="sg-highlight__caption">empty-state__icon · variant</p>
            <div className="sg-highlight__stage">
              <div className="sg-state-icon sg-state-icon--deep">
                <Icon name="file-text" size="xl" />
              </div>
            </div>
          </div>
          <div className="sg-highlight">
            <p className="sg-highlight__caption">
              empty-state__icon · variant 2
            </p>
            <div className="sg-highlight__stage">
              <div className="sg-state-icon sg-state-icon--deep sg-state-icon--400">
                <Icon name="file-text" size="xl" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="sg-block">
        <p className="sg-block__label">Cards · elevation demo</p>
        <div className="sg-grid sg-grid--cards">
          {ELEVATIONS.map((level) => (
            <div
              key={level}
              className="sg-demo-card"
              style={{ boxShadow: `var(--elevation-${level})` }}
            >
              <p className="sg-demo-card__title">Elevation {level}</p>
              <p className="sg-demo-card__body">
                Cards sit on the surface and lift with elevation — from flat
                panels to focused modals.
              </p>
              <div className="sg-demo-card__footer">
                <Button size="sm">Action</Button>
                <Button size="sm" variant="ghost">
                  Dismiss
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

function NotesSection() {
  return (
    <Section
      id="notes"
      title="Notes"
      description="A few notes on how the style system works."
    >
      <div className="sg-stack">
        {NOTES.map(({ tone, title, body }) => (
          <div key={title} className={`sg-note sg-note--${tone}`}>
            <span className="sg-note__dot" aria-hidden="true" />
            <div className="sg-note__content">
              <p className="sg-note__title">{title}</p>
              <p className="sg-note__body">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

export default function SinduraGuidePage() {
  return (
    <div className="sg">
      <header className="sg-header">
        <a className="sg-brand" href="#top">
          <span className="sg-brand__logo-badge">
            <img
              className="sg-brand__logo"
              src={LOGO_URL}
              alt={`${APP_NAME} logo`}
            />
          </span>
          <span className="sg-brand__name">{APP_NAME}</span>
        </a>
        <nav className="sg-nav" aria-label="Style guide sections">
          {NAV_SECTIONS.map(({ id, label }) => (
            <a key={id} className="sg-nav__link" href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
        <ThemeMenu className="sg-theme-menu" />
        <Link className="sg-header__back" to="/" title="Back to ScissorsDoc">
          <Icon name="home" size="sm" />
          <span className="sg-header__back-label">Back to app</span>
        </Link>
      </header>

      <main className="sg-main">
        <Hero />
        <ColorsSection />
        <TypographySection />
        <SpacingSection />
        <RadiusSection />
        <ShadowsSection />
        <ComponentsSection />
        <NotesSection />

        <footer className="sg-footer">
          <p>
            Built entirely from the {APP_NAME} design tokens ·{' '}
            <code className="sg-footer__code">src/sindura-guide/</code>
          </p>
          <a className="sg-footer__top" href="#top">
            Back to top ↑
          </a>
        </footer>
      </main>
    </div>
  )
}
