import { useSettings } from '@/features/settings/SettingsProvider'
import type { SettingsPatch } from '@/features/settings/SettingsProvider'
import {
  MEASUREMENT_UNITS,
  UNIT_LABELS,
} from '@/features/settings/store'
import type {
  AppSettings,
  MeasurementUnit,
  StartupPage,
} from '@/features/settings/store'
import { FONT_FAMILIES, TEXT_ALIGNMENTS } from '@/features/editor/elements'
import type { FontFamily } from '@/features/editor/elements'
import { useTheme } from '@/hooks/useTheme'
import type { ThemePreference } from '@/hooks/useTheme'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui'
import Switch from '@/components/ui/Switch'
import Radio from '@/components/ui/Radio'
import Input from '@/components/ui/Input'
import './settings.css'

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

const STARTUP_OPTIONS: Array<{ value: StartupPage; label: string; hint: string }> = [
  { value: 'home', label: 'Home', hint: 'Land on the entry page.' },
  {
    value: 'workspace',
    label: 'Workspace',
    hint: 'Open the workspace directly when supported.',
  },
]

function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card className="settings-card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="settings-card__content">{children}</CardContent>
    </Card>
  )
}

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="settings-row">
      <div className="settings-row__text">
        <span className="settings-row__label">{label}</span>
        {hint && <span className="settings-row__hint">{hint}</span>}
      </div>
      <div className="settings-row__control">{children}</div>
    </div>
  )
}

function RadioGroup<T extends string>({
  name,
  value,
  options,
  onChange,
  disabled,
}: {
  name: string
  value: T
  options: Array<{ value: T; label: string; hint?: string }>
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return (
    <div className="settings-options" role="radiogroup" aria-label={name}>
      {options.map((option) => (
        <Radio
          key={option.value}
          name={name}
          label={option.hint ? `${option.label} — ${option.hint}` : option.label}
          checked={value === option.value}
          disabled={disabled}
          onChange={() => onChange(option.value)}
        />
      ))}
    </div>
  )
}

export default function SettingsPage() {
  const { settings, updateSettings } = useSettings()
  const { preference, setPreference } = useTheme()

  const setGeneral = (patch: Partial<AppSettings['general']>) =>
    updateSettings({ general: patch })

  const setViewer = (patch: Partial<AppSettings['viewer']>) =>
    updateSettings({ viewer: patch })

  const setEditor = (patch: SettingsPatch['editor']) =>
    updateSettings({ editor: patch })

  const setText = (patch: Partial<AppSettings['editor']['text']>) =>
    setEditor({ text: patch })

  const setShape = (patch: Partial<AppSettings['editor']['shape']>) =>
    setEditor({ shape: patch })

  const setUnits = (units: MeasurementUnit) => setEditor({ units })

  return (
    <div className="settings-page page-enter">
      <header className="settings-page__header">
        <h1 className="settings-page__title">Settings</h1>
        <p className="settings-page__description">
          Preferences are stored on this device and apply to the document
          workspace.
        </p>
      </header>

      <div className="settings-page__grid">
        <SectionCard
          title="General"
          description="App-wide behavior and appearance."
        >
          <SettingRow label="Theme">
            <RadioGroup
              name="settings-theme"
              value={preference}
              options={THEME_OPTIONS}
              onChange={setPreference}
            />
          </SettingRow>

          <SettingRow
            label="Auto-save"
            hint="Save changes to the document automatically."
          >
            <Switch
              checked={settings.general.autoSave}
              onChange={(event) =>
                setGeneral({ autoSave: event.target.checked })
              }
            />
          </SettingRow>

          <SettingRow
            label="Delete confirmation"
            hint="Ask before deleting pages and objects."
          >
            <Switch
              checked={settings.general.deleteConfirmation}
              onChange={(event) =>
                setGeneral({ deleteConfirmation: event.target.checked })
              }
            />
          </SettingRow>

          <SettingRow label="Startup behavior">
            <RadioGroup
              name="settings-startup"
              value={settings.general.startup}
              options={STARTUP_OPTIONS}
              onChange={(startup) => setGeneral({ startup })}
            />
          </SettingRow>
        </SectionCard>

        <SectionCard
          title="PDF Viewer"
          description="Defaults applied when a document is opened."
        >
          <SettingRow label="Default mode">
            <RadioGroup
              name="settings-viewer-mode"
              value={settings.viewer.mode}
              options={[
                { value: 'continuous', label: 'Continuous', hint: 'All pages in a scrollable column' },
                { value: 'single', label: 'Single page', hint: 'One page at a time' },
              ]}
              onChange={(mode) => setViewer({ mode })}
            />
          </SettingRow>

          <SettingRow label="Default fit">
            <RadioGroup
              name="settings-viewer-fit"
              value={settings.viewer.fitMode}
              options={[
                { value: 'width', label: 'Fit to width' },
                { value: 'page', label: 'Fit to page' },
                { value: 'manual', label: 'Manual zoom' },
              ]}
              onChange={(fitMode) => setViewer({ fitMode })}
            />
          </SettingRow>

          <SettingRow
            label="Default zoom"
            hint="Used when the fit is set to manual."
          >
            <Input
              type="number"
              min={0.25}
              max={4}
              step={0.1}
              value={settings.viewer.zoom}
              disabled={settings.viewer.fitMode !== 'manual'}
              className="settings-number"
              onChange={(event) => {
                const zoom = Number(event.target.value)
                if (Number.isFinite(zoom) && zoom > 0) {
                  setViewer({ zoom: Math.min(Math.max(zoom, 0.25), 4) })
                }
              }}
            />
          </SettingRow>

          <SettingRow
            label="Show pages panel"
            hint="Keep the thumbnail panel open by default."
          >
            <Switch
              checked={settings.viewer.showPagesPanel}
              onChange={(event) =>
                setViewer({ showPagesPanel: event.target.checked })
              }
            />
          </SettingRow>
        </SectionCard>

        <SectionCard
          title="Editor"
          description="Defaults for new text and shapes, and display units."
        >
          <SettingRow
            label="Units"
            hint="Used for position, size and page dimensions."
          >
            <RadioGroup
              name="settings-editor-units"
              value={settings.editor.units}
              options={MEASUREMENT_UNITS.map((unit) => ({
                value: unit,
                label: UNIT_LABELS[unit],
              }))}
              onChange={setUnits}
            />
          </SettingRow>

          <div className="settings-subsection">
            <h3 className="settings-subsection__title">Default text</h3>
            <SettingRow label="Font family">
              <select
                className="settings-select"
                value={settings.editor.text.fontFamily}
                onChange={(event) =>
                  setText({
                    fontFamily: event.target.value as FontFamily,
                  })
                }
              >
                {FONT_FAMILIES.map((family) => (
                  <option key={family} value={family}>
                    {family}
                  </option>
                ))}
              </select>
            </SettingRow>
            <div className="settings-row settings-row--inline">
              <SettingRow label="Font size">
                <Input
                  type="number"
                  min={6}
                  max={240}
                  value={settings.editor.text.fontSize}
                  className="settings-number"
                  onChange={(event) => {
                    const size = Number(event.target.value)
                    if (Number.isFinite(size) && size >= 1) {
                      setText({ fontSize: Math.min(size, 240) })
                    }
                  }}
                />
              </SettingRow>
              <SettingRow label="Text color">
                <Input
                  type="color"
                  value={settings.editor.text.color}
                  className="settings-color"
                  onChange={(event) => setText({ color: event.target.value })}
                />
              </SettingRow>
            </div>
            <SettingRow label="Style">
              <div className="settings-options settings-options--switches">
                <Switch
                  label="Bold"
                  checked={settings.editor.text.bold}
                  onChange={(event) => setText({ bold: event.target.checked })}
                />
                <Switch
                  label="Italic"
                  checked={settings.editor.text.italic}
                  onChange={(event) => setText({ italic: event.target.checked })}
                />
              </div>
            </SettingRow>
            <SettingRow label="Alignment">
              <RadioGroup
                name="settings-editor-text-align"
                value={settings.editor.text.alignment}
                options={TEXT_ALIGNMENTS.map((alignment) => ({
                  value: alignment,
                  label: alignment,
                }))}
                onChange={(alignment) => setText({ alignment })}
              />
            </SettingRow>
          </div>

          <div className="settings-subsection">
            <h3 className="settings-subsection__title">Default shapes</h3>
            <div className="settings-row settings-row--inline">
              <SettingRow label="Stroke color">
                <Input
                  type="color"
                  value={settings.editor.shape.strokeColor}
                  className="settings-color"
                  onChange={(event) =>
                    setShape({ strokeColor: event.target.value })
                  }
                />
              </SettingRow>
              <SettingRow label="Fill color">
                <Input
                  type="color"
                  value={settings.editor.shape.fillColor}
                  className="settings-color"
                  onChange={(event) =>
                    setShape({ fillColor: event.target.value })
                  }
                />
              </SettingRow>
              <SettingRow label="Stroke width">
                <Input
                  type="number"
                  min={0}
                  max={24}
                  value={settings.editor.shape.strokeWidth}
                  className="settings-number"
                  onChange={(event) => {
                    const width = Number(event.target.value)
                    if (Number.isFinite(width) && width >= 0) {
                      setShape({ strokeWidth: Math.min(width, 24) })
                    }
                  }}
                />
              </SettingRow>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Workspace"
          description="The layout used by the document workspace."
        >
          <SettingRow label="Layout">
            <div className="settings-options" role="radiogroup" aria-label="Workspace layout">
              <Radio
                name="settings-workspace-layout"
                label="Large — current workspace"
                checked={settings.workspace.layout === 'large'}
                onChange={() => updateSettings({ workspace: { layout: 'large' } })}
              />
              <Radio
                name="settings-workspace-layout"
                label="Grid — coming soon"
                disabled
              />
            </div>
          </SettingRow>
        </SectionCard>
      </div>
    </div>
  )
}
