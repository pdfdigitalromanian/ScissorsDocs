import type { IconName } from '@/components/icons/Icon'
import type { HomeTone } from '@/features/home/data/home-catalog'
import { homeToolCategories } from '@/features/home/data/home-catalog'

export type ToolFieldType =
  'text' | 'textarea' | 'number' | 'password' | 'checkbox' | 'select'

export interface ToolSelectOption {
  label: string
  value: string
}

export interface ToolOptionField {
  name: string
  label: string
  type: ToolFieldType
  required?: boolean
  defaultValue?: string | boolean
  placeholder?: string
  hint?: string
  min?: number
  max?: number
  options?: ToolSelectOption[]
}

interface ToolInputConfig {
  accept: string
  label: string
  multiple?: boolean
  minFiles?: number
  hint?: string
}

interface ToolRuntimeConfig {
  input: ToolInputConfig
  fields: ToolOptionField[]
}

export interface ToolDefinition extends ToolRuntimeConfig {
  id: string
  label: string
  description: string
  category: string
  icon: IconName
  tone: HomeTone
}

const PDF_INPUT: ToolInputConfig = {
  accept: '.pdf,application/pdf',
  label: 'PDF file',
  minFiles: 1,
}

const TEXT_DOCUMENT_INPUT: ToolInputConfig = {
  accept: '.pdf,.docx,.txt,.html,.htm',
  label: 'Document',
  minFiles: 0,
  hint: 'Upload a document or enter text below.',
}

const PAGE_FIELD: ToolOptionField = {
  name: 'page',
  label: 'Page',
  type: 'number',
  defaultValue: '1',
  min: 1,
}

const RECT_FIELD: ToolOptionField = {
  name: 'rect',
  label: 'Position and size',
  type: 'text',
  defaultValue: '72,72,360,144',
  hint: 'PDF points: x0,y0,x1,y1.',
}

const COLOR_FIELD: ToolOptionField = {
  name: 'color',
  label: 'Color',
  type: 'text',
  defaultValue: '#2563ff',
  placeholder: '#2563ff',
}

const PAGE_RANGE_FIELD: ToolOptionField = {
  name: 'pages',
  label: 'Pages',
  type: 'text',
  required: true,
  placeholder: '1-3,5',
  hint: 'Use page numbers and ranges separated by commas.',
}

const toolRuntime: Record<string, ToolRuntimeConfig> = {
  'edit-text': {
    input: PDF_INPUT,
    fields: [
      PAGE_FIELD,
      RECT_FIELD,
      {
        name: 'text',
        label: 'Replacement text',
        type: 'textarea',
        required: true,
      },
      {
        name: 'font_size',
        label: 'Font size',
        type: 'number',
        defaultValue: '12',
        min: 4,
        max: 72,
      },
      COLOR_FIELD,
    ],
  },
  'edit-images': {
    input: {
      accept: '.pdf,.png,.jpg,.jpeg,.webp',
      label: 'PDF and image',
      multiple: true,
      minFiles: 2,
      hint: 'Choose one PDF and one image.',
    },
    fields: [
      PAGE_FIELD,
      RECT_FIELD,
      {
        name: 'keep_proportion',
        label: 'Keep image proportions',
        type: 'checkbox',
        defaultValue: true,
      },
    ],
  },
  'edit-shapes': {
    input: PDF_INPUT,
    fields: [
      PAGE_FIELD,
      RECT_FIELD,
      {
        name: 'shape',
        label: 'Shape',
        type: 'select',
        defaultValue: 'rectangle',
        options: [
          { label: 'Rectangle', value: 'rectangle' },
          { label: 'Ellipse', value: 'ellipse' },
          { label: 'Line', value: 'line' },
        ],
      },
      COLOR_FIELD,
      {
        name: 'width',
        label: 'Stroke width',
        type: 'number',
        defaultValue: '2',
        min: 0.25,
        max: 20,
      },
      {
        name: 'filled',
        label: 'Fill shape',
        type: 'checkbox',
      },
      {
        name: 'fill',
        label: 'Fill color',
        type: 'text',
        defaultValue: '#ffffff',
      },
    ],
  },
  'edit-draw': {
    input: PDF_INPUT,
    fields: [
      PAGE_FIELD,
      {
        name: 'points',
        label: 'Drawing points',
        type: 'textarea',
        required: true,
        defaultValue: '72:72,120:120,180:90',
        hint: 'Comma-separated x:y points.',
      },
      COLOR_FIELD,
      {
        name: 'width',
        label: 'Line width',
        type: 'number',
        defaultValue: '2',
      },
    ],
  },
  'edit-highlight': {
    input: PDF_INPUT,
    fields: [
      PAGE_FIELD,
      {
        name: 'search',
        label: 'Text to highlight',
        type: 'text',
        placeholder: 'Search text',
        hint: 'Leave empty to highlight the rectangle below.',
      },
      RECT_FIELD,
      { ...COLOR_FIELD, defaultValue: '#fbbf24' },
    ],
  },
  'edit-annotate': {
    input: PDF_INPUT,
    fields: [
      PAGE_FIELD,
      RECT_FIELD,
      {
        name: 'text',
        label: 'Note',
        type: 'textarea',
        required: true,
      },
      {
        name: 'author',
        label: 'Author',
        type: 'text',
        defaultValue: 'ScissorsDoc',
      },
    ],
  },
  'edit-signature': {
    input: {
      accept: '.pdf,.png,.jpg,.jpeg',
      label: 'PDF and signature image',
      multiple: true,
      minFiles: 2,
    },
    fields: [PAGE_FIELD, RECT_FIELD],
  },
  'edit-forms': {
    input: PDF_INPUT,
    fields: [
      PAGE_FIELD,
      RECT_FIELD,
      {
        name: 'name',
        label: 'Field name',
        type: 'text',
        required: true,
        defaultValue: 'field',
      },
      { name: 'label', label: 'Accessible label', type: 'text' },
      { name: 'value', label: 'Default value', type: 'text' },
      {
        name: 'font_size',
        label: 'Font size',
        type: 'number',
        defaultValue: '11',
      },
    ],
  },
  'convert-images-to-pdf': {
    input: {
      accept: '.png,.jpg,.jpeg,.webp,.tif,.tiff',
      label: 'Images',
      multiple: true,
      minFiles: 1,
    },
    fields: [
      {
        name: 'page_size',
        label: 'Page size',
        type: 'select',
        defaultValue: 'auto',
        options: [
          { label: 'Fit to image', value: 'auto' },
          { label: 'A4', value: 'a4' },
          { label: 'Letter', value: 'letter' },
        ],
      },
      {
        name: 'orientation',
        label: 'Orientation',
        type: 'select',
        defaultValue: 'auto',
        options: [
          { label: 'Auto', value: 'auto' },
          { label: 'Portrait', value: 'portrait' },
          { label: 'Landscape', value: 'landscape' },
        ],
      },
      {
        name: 'dpi',
        label: 'Resolution (DPI)',
        type: 'number',
        defaultValue: '150',
        min: 72,
        max: 600,
      },
    ],
  },
  'convert-pdf-to-images': {
    input: PDF_INPUT,
    fields: [
      {
        name: 'dpi',
        label: 'Resolution (DPI)',
        type: 'number',
        defaultValue: '150',
        min: 72,
        max: 600,
      },
      {
        name: 'format',
        label: 'Format',
        type: 'select',
        defaultValue: 'png',
        options: [
          { label: 'PNG', value: 'png' },
          { label: 'JPEG', value: 'jpg' },
        ],
      },
      {
        name: 'quality',
        label: 'JPEG quality',
        type: 'number',
        defaultValue: '85',
        min: 20,
        max: 100,
      },
      {
        name: 'pages',
        label: 'Pages',
        type: 'text',
        placeholder: 'all',
        hint: 'Page numbers or ranges (e.g. 1-3,5). Leave empty for all pages.',
      },
    ],
  },
  'convert-pdf-to-text': {
    input: PDF_INPUT,
    fields: [
      {
        name: 'pages',
        label: 'Pages',
        type: 'text',
        placeholder: 'all',
        hint: 'Page numbers or ranges (e.g. 1-3,5). Leave empty for all pages.',
      },
    ],
  },
  'convert-text-to-pdf': {
    input: {
      accept: '.txt,.text',
      label: 'Text file',
      minFiles: 0,
      hint: 'Upload a text file or paste text below.',
    },
    fields: [
      { name: 'text', label: 'Text', type: 'textarea' },
      {
        name: 'page_size',
        label: 'Page size',
        type: 'select',
        defaultValue: 'a4',
        options: [
          { label: 'A4', value: 'a4' },
          { label: 'Letter', value: 'letter' },
        ],
      },
      {
        name: 'orientation',
        label: 'Orientation',
        type: 'select',
        defaultValue: 'portrait',
        options: [
          { label: 'Portrait', value: 'portrait' },
          { label: 'Landscape', value: 'landscape' },
        ],
      },
      {
        name: 'margin',
        label: 'Margin (pt)',
        type: 'number',
        defaultValue: '48',
        min: 12,
        max: 144,
      },
      {
        name: 'font_size',
        label: 'Font size',
        type: 'number',
        defaultValue: '12',
        min: 8,
        max: 24,
      },
    ],
  },
  'convert-word-to-pdf': {
    input: {
      accept: '.docx',
      label: 'Word document',
      minFiles: 1,
    },
    fields: [
      {
        name: 'page_size',
        label: 'Page size',
        type: 'select',
        defaultValue: 'a4',
        options: [
          { label: 'A4', value: 'a4' },
          { label: 'Letter', value: 'letter' },
        ],
      },
    ],
  },
  'convert-pdf-to-word': { input: PDF_INPUT, fields: [] },
  'convert-pptx-to-pdf': {
    input: {
      accept: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation',
      label: 'PowerPoint document',
      minFiles: 1,
    },
    fields: [],
  },
  'convert-pdf-to-pptx': { input: PDF_INPUT, fields: [] },
  'convert-xlsx-to-pdf': {
    input: {
      accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      label: 'Excel document',
      minFiles: 1,
    },
    fields: [],
  },
  'convert-pdf-to-xlsx': { input: PDF_INPUT, fields: [] },
  'web-to-pdf': {
    input: {
      accept: '',
      label: '',
      minFiles: 0,
      hint: 'Enter a web address in the dedicated workflow.',
    },
    fields: [
      {
        name: 'url',
        label: 'Page URL',
        type: 'text',
        required: true,
        placeholder: 'https://example.com',
      },
    ],
  },
  'convert-html-to-pdf': {
    input: {
      accept: '.html,.htm',
      label: 'HTML file',
      minFiles: 0,
      hint: 'Upload HTML or paste it below.',
    },
    fields: [
      { name: 'html', label: 'HTML', type: 'textarea' },
      {
        name: 'page_size',
        label: 'Page size',
        type: 'select',
        defaultValue: 'a4',
        options: [
          { label: 'A4', value: 'a4' },
          { label: 'Letter', value: 'letter' },
        ],
      },
      {
        name: 'orientation',
        label: 'Orientation',
        type: 'select',
        defaultValue: 'portrait',
        options: [
          { label: 'Portrait', value: 'portrait' },
          { label: 'Landscape', value: 'landscape' },
        ],
      },
    ],
  },
  'organize-merge': {
    input: {
      ...PDF_INPUT,
      label: 'PDF files',
      multiple: true,
      minFiles: 2,
    },
    fields: [],
  },
  'organize-split': { input: PDF_INPUT, fields: [] },
  'organize-rotate': {
    input: PDF_INPUT,
    fields: [
      {
        ...PAGE_RANGE_FIELD,
        required: false,
        hint: 'Leave empty for all pages.',
      },
      {
        name: 'angle',
        label: 'Clockwise rotation',
        type: 'select',
        defaultValue: '90',
        options: [
          { label: '90°', value: '90' },
          { label: '180°', value: '180' },
          { label: '270°', value: '270' },
        ],
      },
    ],
  },
  'organize-extract': { input: PDF_INPUT, fields: [PAGE_RANGE_FIELD] },
  'organize-delete': { input: PDF_INPUT, fields: [PAGE_RANGE_FIELD] },
  'organize-rearrange': {
    input: PDF_INPUT,
    fields: [
      {
        name: 'order',
        label: 'New page order',
        type: 'text',
        required: true,
        placeholder: '3,1,2',
        hint: 'Include every page exactly once.',
      },
    ],
  },
  'optimize-compress': {
    input: PDF_INPUT,
    fields: [
      {
        name: 'level',
        label: 'Compression level',
        type: 'select',
        defaultValue: 'recommended',
        options: [
          { label: 'Low — highest quality', value: 'low' },
          { label: 'Recommended', value: 'recommended' },
          { label: 'Strong — smallest file', value: 'strong' },
        ],
      },
    ],
  },
  'optimize-ocr': {
    input: PDF_INPUT,
    fields: [
      {
        name: 'dpi',
        label: 'Scan resolution',
        type: 'number',
        defaultValue: '200',
        min: 100,
        max: 400,
      },
      {
        name: 'language',
        label: 'Tesseract language',
        type: 'text',
        defaultValue: 'eng',
      },
    ],
  },
  'optimize-images': {
    input: PDF_INPUT,
    fields: [
      {
        name: 'dpi',
        label: 'Image resolution',
        type: 'number',
        defaultValue: '130',
        min: 72,
        max: 300,
      },
      {
        name: 'quality',
        label: 'JPEG quality',
        type: 'number',
        defaultValue: '72',
        min: 20,
        max: 95,
      },
    ],
  },
  'security-protect': {
    input: PDF_INPUT,
    fields: [
      {
        name: 'password',
        label: 'Open password',
        type: 'password',
        required: true,
      },
      {
        name: 'owner_password',
        label: 'Owner password',
        type: 'password',
        hint: 'Defaults to the open password.',
      },
    ],
  },
  'security-unlock': {
    input: PDF_INPUT,
    fields: [
      {
        name: 'password',
        label: 'PDF password',
        type: 'password',
        required: true,
      },
    ],
  },
  'security-watermark': {
    input: PDF_INPUT,
    fields: [
      {
        name: 'text',
        label: 'Watermark text',
        type: 'text',
        required: true,
        defaultValue: 'ScissorsDoc',
      },
      {
        name: 'font_size',
        label: 'Font size',
        type: 'number',
        defaultValue: '42',
      },
      { ...COLOR_FIELD, defaultValue: '#94a3b8' },
      {
        name: 'rotation',
        label: 'Rotation',
        type: 'select',
        defaultValue: '0',
        options: [
          { label: '0°', value: '0' },
          { label: '90°', value: '90' },
          { label: '180°', value: '180' },
          { label: '270°', value: '270' },
        ],
      },
    ],
  },
  'security-sign': {
    input: {
      accept: '.pdf,.p12,.pfx',
      label: 'PDF and PKCS#12 certificate',
      multiple: true,
      minFiles: 2,
    },
    fields: [
      {
        name: 'certificate_password',
        label: 'Certificate password',
        type: 'password',
      },
      { name: 'reason', label: 'Signing reason', type: 'text' },
      { name: 'location', label: 'Signing location', type: 'text' },
      {
        name: 'field_name',
        label: 'Signature field',
        type: 'text',
        defaultValue: 'Signature1',
      },
    ],
  },
  'sign-pdf': { input: PDF_INPUT, fields: [] },
  'redact-pdf': { input: PDF_INPUT, fields: [] },
  'ai-summarize': {
    input: TEXT_DOCUMENT_INPUT,
    fields: [
      { name: 'text', label: 'Text', type: 'textarea' },
      {
        name: 'sentences',
        label: 'Summary sentences',
        type: 'number',
        defaultValue: '5',
        min: 1,
        max: 20,
      },
    ],
  },
  'ai-translate': {
    input: TEXT_DOCUMENT_INPUT,
    fields: [
      { name: 'text', label: 'Text', type: 'textarea' },
      {
        name: 'source',
        label: 'Source language code',
        type: 'text',
        defaultValue: 'auto',
      },
      {
        name: 'target',
        label: 'Target language code',
        type: 'text',
        required: true,
        placeholder: 'ro',
      },
    ],
  },
  'ai-rewrite': {
    input: TEXT_DOCUMENT_INPUT,
    fields: [
      { name: 'text', label: 'Text', type: 'textarea' },
      {
        name: 'mode',
        label: 'Rewrite style',
        type: 'select',
        defaultValue: 'concise',
        options: [
          { label: 'Concise', value: 'concise' },
          { label: 'Formal', value: 'formal' },
          { label: 'Plain language', value: 'plain' },
        ],
      },
    ],
  },
  'ai-assistant': {
    input: TEXT_DOCUMENT_INPUT,
    fields: [
      { name: 'text', label: 'Document text', type: 'textarea' },
      {
        name: 'question',
        label: 'Question',
        type: 'textarea',
        required: true,
      },
    ],
  },
  'ai-extract-tables': { input: PDF_INPUT, fields: [] },
  'compare-pdf': {
    input: {
      accept: '.pdf,application/pdf',
      label: 'Two PDF files',
      minFiles: 2,
      hint: 'The first file is treated as Version A and the second as Version B.',
    },
    fields: [],
  },
}

const definitions: ToolDefinition[] = homeToolCategories.flatMap((category) =>
  category.tools.map((tool) => ({
    ...tool,
    category: category.label,
    ...(toolRuntime[tool.id] ?? { input: PDF_INPUT, fields: [] }),
  })),
)

export function getToolDefinition(toolId: string): ToolDefinition | undefined {
  return definitions.find((tool) => tool.id === toolId)
}

export function getToolDefinitions(): ToolDefinition[] {
  return definitions
}
