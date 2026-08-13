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
  Tab,
  TabPanel,
  Tabs,
  TabsList,
} from '@/components/ui'
import type { IconName } from '@/components/icons/Icon'
import { Icon } from '@/components/icons/Icon'
import Switch from '@/components/ui/Switch'
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
  icon,
  title,
  description,
  children,
}: {
  icon: IconName
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card className="settings-card">
      <div className="settings-card__header">
        <span className="settings-card__icon" aria-hidden="true">
          <Icon name={icon} size="md" />
        </span>
        <div className="settings-card__heading">
          <h2 className="settings-card__title">{title}</h2>
          <p className="settings-card__description">{description}</p>
        </div>
      </div>
      <CardContent className="settings-card__content">{children}</CardContent>
    </Card>
  )
}

function SettingRow({
  label,
  hint,
  children,
  hintId,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  hintId?: string
}) {
  return (
    <div className="settings-row">
      <div className="settings-row__text">
        <span className="settings-row__label" id={hintId}>
          {label}
        </span>
        {hint && <span className="settings-row__hint">{hint}</span>}
      </div>
      <div className="settings-row__control">{children}</div>
    </div>
  )
}

function SegmentGroup<T extends string>({
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
    <div className="settings-segments" role="radiogroup" aria-label={name}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={disabled}
          title={option.hint}
          className={`settings-segment${
            value === option.value ? ' settings-segment--active' : ''
          }`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <SettingRow label={label} hint={hint}>
      <Switch
        id={id}
        checked={checked}
        onChange={onChange}
      />
    </SettingRow>
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
        <span className="settings-page__icon" aria-hidden="true">
          <Icon name="settings" size="lg" />
        </span>
        <div className="settings-page__heading">
          <h1 className="settings-page__title">Settings</h1>
          <p className="settings-page__description">
            Preferences are stored on this device and apply to the document
            workspace.
          </p>
        </div>
      </header>

      <div className="settings-page__content">
        <Tabs defaultValue="general" className="settings-tabs">
          <TabsList aria-label="Settings categories">
            <Tab value="general">
              <Icon name="tools" size="sm" />
              General
            </Tab>
            <Tab value="viewer">
              <Icon name="file-text" size="sm" />
              PDF Viewer
            </Tab>
            <Tab value="editor">
              <Icon name="edit" size="sm" />
              Editor
            </Tab>
            <Tab value="workspace">
              <Icon name="workspace" size="sm" />
              Workspace
            </Tab>
          </TabsList>

          <TabPanel value="general">
            <SectionCard
              icon="tools"
              title="General"
              description="App-wide behavior and appearance."
            >
              <SettingRow label="Theme">
                <SegmentGroup
                  name="settings-theme"
                  value={preference}
                  options={THEME_OPTIONS}
                  onChange={setPreference}
                />
              </SettingRow>

              <ToggleRow
                id="settings-autosave"
                label="Auto-save"
                hint="Save changes to the document automatically."
                checked={settings.general.autoSave}
                onChange={(checked) => setGeneral({ autoSave: checked })}
              />

              <ToggleRow
                id="settings-delete-confirmation"
                label="Delete confirmation"
                hint="Ask before deleting pages and objects."
                checked={settings.general.deleteConfirmation}
                onChange={(checked) =>
                  setGeneral({ deleteConfirmation: checked })
                }
              />

              <SettingRow label="Startup behavior">
                <SegmentGroup
                  name="settings-startup"
                  value={settings.general.startup}
                  options={STARTUP_OPTIONS}
                  onChange={(startup) => setGeneral({ startup })}
                />
              </SettingRow>
            </SectionCard>
          </TabPanel>

          <TabPanel value="viewer">
            <SectionCard
              icon="file-text"
              title="PDF Viewer"
              description="Defaults applied when a document is opened."
            >
              <SettingRow label="Default mode">
                <SegmentGroup
                  name="settings-viewer-mode"
                  value={settings.viewer.mode}
                  options={[
                    {
                      value: 'continuous',
                      label: 'Continuous',
                      hint: 'All pages in a scrollable column',
                    },
                    {
                      value: 'single',
                      label: 'Single page',
                      hint: 'One page at a time',
                    },
                  ]}
                  onChange={(mode) => setViewer({ mode })}
                />
              </SettingRow>

              <SettingRow label="Default fit">
                <SegmentGroup
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

              <ToggleRow
                id="settings-show-pages-panel"
                label="Show pages panel"
                hint="Keep the thumbnail panel open by default."
                checked={settings.viewer.showPagesPanel}
                onChange={(checked) => setViewer({ showPagesPanel: checked })}
              />
            </SectionCard>
          </TabPanel>

          <TabPanel value="editor">
            <SectionCard
              icon="edit"
              title="Editor"
              description="Defaults for new text and shapes, and display units."
            >
              <SettingRow
                label="Units"
                hint="Used for position, size and page dimensions."
              >
                <SegmentGroup
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
                      setText({ fontFamily: event.target.value as FontFamily })
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
                      onChange={(event) =>
                        setText({ color: event.target.value })
                      }
                    />
                  </SettingRow>
                </div>
                <SettingRow label="Style">
                  <div className="settings-options settings-options--switches">
                    <Switch
                      label="Bold"
                      checked={settings.editor.text.bold}
                      onChange={(checked) => setText({ bold: checked })}
                    />
                    <Switch
                      label="Italic"
                      checked={settings.editor.text.italic}
                      onChange={(checked) => setText({ italic: checked })}
                    />
                  </div>
                </SettingRow>
                <SettingRow label="Alignment">
                  <SegmentGroup
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
          </TabPanel>

          <TabPanel value="workspace">
            <SectionCard
              icon="workspace"
              title="Workspace"
              description="The layout used by the document workspace."
            >
              <SettingRow label="Layout">
                <SegmentGroup
                  name="settings-workspace-layout"
                  value={settings.workspace.layout}
                  options={[{ value: 'large', label: 'Large' }]}
                  onChange={(layout) =>
                    updateSettings({ workspace: { layout } })
                  }
                />
              </SettingRow>
            </SectionCard>
          </TabPanel>
        </Tabs>
      </div>
    </div>
  )
}
