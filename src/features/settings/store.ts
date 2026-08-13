/**
 * Application settings — persisted locally in localStorage.
 *
 * Settings here mirror what the UI can actually do today. The `workspace
 * layout` field reserves the Grid page layout from the roadmap without
 * enabling it yet.
 */
import type { FontFamily, TextAlign } from '@/features/editor/elements'
import type { PdfFitMode, PdfViewMode } from '@/features/pdf/PdfSessionProvider'

export type MeasurementUnit = 'pt' | 'in' | 'cm' | 'mm'
export type StartupPage = 'home' | 'workspace'
export type WorkspaceLayout = 'large' | 'grid'

export const MEASUREMENT_UNITS: MeasurementUnit[] = ['pt', 'in', 'cm', 'mm']

export const UNIT_LABELS: Record<MeasurementUnit, string> = {
  pt: 'Points',
  in: 'Inches',
  cm: 'Centimeters',
  mm: 'Millimeters',
}

export const POINTS_PER_UNIT: Record<MeasurementUnit, number> = {
  pt: 1,
  in: 72,
  cm: 28.346456692913385,
  mm: 2.8346456692913385,
}

export interface TextDefaults {
  fontFamily: FontFamily
  fontSize: number
  color: string
  bold: boolean
  italic: boolean
  alignment: TextAlign
}

export interface ShapeDefaults {
  strokeColor: string
  fillColor: string
  strokeWidth: number
}

export interface AppSettings {
  general: {
    autoSave: boolean
    deleteConfirmation: boolean
    startup: StartupPage
  }
  viewer: {
    mode: PdfViewMode
    fitMode: PdfFitMode
    zoom: number
    showPagesPanel: boolean
  }
  editor: {
    units: MeasurementUnit
    text: TextDefaults
    shape: ShapeDefaults
  }
  workspace: {
    layout: WorkspaceLayout
  }
}

/** Default settings — mirrors the current behavior of the app. */
export const DEFAULT_SETTINGS: AppSettings = {
  general: {
    autoSave: true,
    deleteConfirmation: true,
    startup: 'home',
  },
  viewer: {
    mode: 'continuous',
    fitMode: 'width',
    zoom: 1,
    showPagesPanel: true,
  },
  editor: {
    units: 'pt',
    text: {
      fontFamily: 'helvetica',
      fontSize: 16,
      color: '#111111',
      bold: false,
      italic: false,
      alignment: 'left',
    },
    shape: {
      strokeColor: '#1f6feb',
      fillColor: '#1f6feb',
      strokeWidth: 2,
    },
  },
  workspace: {
    layout: 'large',
  },
}

export const SETTINGS_STORAGE_KEY = 'scissordoc-settings'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function number(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function textDefaults(parsed: unknown): TextDefaults {
  const text = isRecord(parsed) ? parsed : {}
  return {
    fontFamily: isOneOf(text.fontFamily, ['helvetica', 'times', 'courier'])
      ? text.fontFamily
      : DEFAULT_SETTINGS.editor.text.fontFamily,
    fontSize:
      typeof text.fontSize === 'number' && text.fontSize > 0
        ? text.fontSize
        : DEFAULT_SETTINGS.editor.text.fontSize,
    color:
      typeof text.color === 'string' && text.color.length > 0
        ? text.color
        : DEFAULT_SETTINGS.editor.text.color,
    bold: bool(text.bold, DEFAULT_SETTINGS.editor.text.bold),
    italic: bool(text.italic, DEFAULT_SETTINGS.editor.text.italic),
    alignment: isOneOf(text.alignment, ['left', 'center', 'right'])
      ? text.alignment
      : DEFAULT_SETTINGS.editor.text.alignment,
  }
}

function shapeDefaults(parsed: unknown): ShapeDefaults {
  const shape = isRecord(parsed) ? parsed : {}
  return {
    strokeColor:
      typeof shape.strokeColor === 'string' && shape.strokeColor.length > 0
        ? shape.strokeColor
        : DEFAULT_SETTINGS.editor.shape.strokeColor,
    fillColor:
      typeof shape.fillColor === 'string' && shape.fillColor.length > 0
        ? shape.fillColor
        : DEFAULT_SETTINGS.editor.shape.fillColor,
    strokeWidth:
      typeof shape.strokeWidth === 'number' && shape.strokeWidth >= 0
        ? shape.strokeWidth
        : DEFAULT_SETTINGS.editor.shape.strokeWidth,
  }
}

/** Merge a parsed (possibly partial or older) blob over the defaults. */
function mergeSettings(parsed: unknown): AppSettings {
  if (!isRecord(parsed)) return DEFAULT_SETTINGS
  const general = isRecord(parsed.general) ? parsed.general : {}
  const viewer = isRecord(parsed.viewer) ? parsed.viewer : {}
  const editor = isRecord(parsed.editor) ? parsed.editor : {}
  const workspace = isRecord(parsed.workspace) ? parsed.workspace : {}

  return {
    general: {
      autoSave: bool(general.autoSave, DEFAULT_SETTINGS.general.autoSave),
      deleteConfirmation: bool(
        general.deleteConfirmation,
        DEFAULT_SETTINGS.general.deleteConfirmation,
      ),
      startup: isOneOf(general.startup, ['home', 'workspace'])
        ? general.startup
        : DEFAULT_SETTINGS.general.startup,
    },
    viewer: {
      mode: isOneOf(viewer.mode, ['continuous', 'single'])
        ? viewer.mode
        : DEFAULT_SETTINGS.viewer.mode,
      fitMode: isOneOf(viewer.fitMode, ['width', 'page', 'manual'])
        ? viewer.fitMode
        : DEFAULT_SETTINGS.viewer.fitMode,
      zoom: number(viewer.zoom, DEFAULT_SETTINGS.viewer.zoom),
      showPagesPanel: bool(viewer.showPagesPanel, DEFAULT_SETTINGS.viewer.showPagesPanel),
    },
    editor: {
      units: isOneOf(editor.units, MEASUREMENT_UNITS)
        ? editor.units
        : DEFAULT_SETTINGS.editor.units,
      text: textDefaults(editor.text),
      shape: shapeDefaults(editor.shape),
    },
    workspace: {
      layout: isOneOf(workspace.layout, ['large', 'grid'])
        ? workspace.layout
        : DEFAULT_SETTINGS.workspace.layout,
    },
  }
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return mergeSettings(JSON.parse(raw))
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Storage may be unavailable (private mode) — settings stay in memory.
  }
}

export function convertPtToUnit(points: number, unit: MeasurementUnit): number {
  return points / POINTS_PER_UNIT[unit]
}

export function convertUnitToPt(value: number, unit: MeasurementUnit): number {
  return value * POINTS_PER_UNIT[unit]
}
