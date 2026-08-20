import type { IconName } from '@/components/icons/Icon'

/**
 * Home catalogue — static, presentation-only data for the landing page.
 * Quick actions and tool categories are UI-only in this milestone; the
 * tool registry will become the source of truth when Quick Tools (Phase 4)
 * and the Workspace tools are implemented.
 */

export type HomeTone = 'primary' | 'success' | 'warning' | 'info' | 'secondary'

export interface HomeQuickAction {
  id: string
  label: string
  description: string
  icon: IconName
  tone: HomeTone
  hint: string
  /** Navigation target when the action routes to a real tool page. */
  to?: string
}

/** Shortcuts shown alongside the upload zone on the home entry area. */
export interface DocumentEntryShortcut {
  id: string
  label: string
  icon: IconName
  /** Navigation target when the shortcut is a route link. */
  to?: string
  /** Toast copy shown when the shortcut is UI-only in this milestone. */
  hint?: string
}

/** Supported document types rendered as a display-only list. */
export interface SupportedFileType {
  id: string
  extension: string
  label: string
  tone: HomeTone
}

/** Quick Start card — fast entry into a common workflow or workspace. */
export interface HomeQuickStart {
  id: string
  label: string
  description: string
  icon: IconName
  tone: HomeTone
  to?: string
  hint?: string
}

export interface HomeTool {
  id: string
  label: string
  description: string
  icon: IconName
  tone: HomeTone
}

export interface HomeToolCategory {
  id: string
  label: string
  description: string
  icon: IconName
  tone: HomeTone
  tools: HomeTool[]
}

export const homeQuickActions: HomeQuickAction[] = [
  {
    id: 'open-file',
    label: 'Open File',
    description: 'Open a document from your device',
    icon: 'folder-open',
    tone: 'primary',
    hint: 'Use the upload zone above to open a document from your device.',
  },
  {
    id: 'upload-document',
    label: 'Upload Document',
    description: 'Add a document to the workspace',
    icon: 'upload',
    tone: 'info',
    hint: 'Use the upload zone above to add a document to the workspace.',
  },
  {
    id: 'merge-pdfs',
    label: 'Merge PDFs',
    description: 'Combine several PDFs into one',
    icon: 'merge',
    tone: 'success',
    hint: 'Combine several PDFs into one file.',
    to: '/tools/organize-merge',
  },
  {
    id: 'split-pdf',
    label: 'Split PDF',
    description: 'Separate pages into new documents',
    icon: 'split',
    tone: 'warning',
    hint: 'Separate pages into new documents.',
    to: '/tools/organize-split',
  },
  {
    id: 'compress-pdf',
    label: 'Compress PDF',
    description: 'Reduce file size without losing quality',
    icon: 'compress',
    tone: 'secondary',
    hint: 'The compress tool arrives with Quick Tools.',
    to: '/tools/optimize-compress',
  },
  {
    id: 'protect-pdf',
    label: 'Protect PDF',
    description: 'Encrypt a PDF with a password',
    icon: 'lock',
    tone: 'warning',
    hint: 'Encrypt a PDF with an open password and restrictions.',
    to: '/tools/security-protect',
  },
  {
    id: 'sign-pdf',
    label: 'Sign PDF',
    description: 'Sign a document quickly',
    icon: 'sign',
    tone: 'primary',
    hint: 'Draw, type, or upload a signature and place it on the document.',
    to: '/tools/sign-pdf',
  },
  {
    id: 'redact-pdf',
    label: 'Redact PDF',
    description: 'Remove sensitive content',
    icon: 'scissors',
    tone: 'warning',
    hint: 'Permanently remove sensitive text and images from a PDF.',
    to: '/tools/redact-pdf',
  },
  {
    id: 'convert-files',
    label: 'Convert Files',
    description: 'Change documents between formats',
    icon: 'convert',
    tone: 'info',
    hint: 'Format conversion arrives with Quick Tools.',
    to: '/tools',
  },
  {
    id: 'ai-assistant',
    label: 'AI Assistant',
    description: 'Ask questions about your documents',
    icon: 'ai',
    tone: 'primary',
    hint: 'The AI assistant arrives with the AI workspace.',
  },
]

export const documentEntryShortcuts: DocumentEntryShortcut[] = [
  {
    id: 'recent-documents',
    label: 'Recent documents',
    icon: 'recent',
    to: '/recent',
  },
  {
    id: 'templates',
    label: 'Templates',
    icon: 'file-text',
    hint: 'Templates arrive in a later phase.',
  },
  {
    id: 'blank-workspace',
    label: 'Blank workspace',
    icon: 'workspace',
    to: '/workspace',
  },
]

export const supportedFileTypes: SupportedFileType[] = [
  { id: 'pdf', extension: 'PDF', label: 'PDF', tone: 'primary' },
  { id: 'docx', extension: 'DOCX', label: 'Word', tone: 'info' },
  // { id: 'xlsx', extension: 'XLSX', label: 'Excel', tone: 'success' },
  // { id: 'pptx', extension: 'PPTX', label: 'PowerPoint', tone: 'warning' },
  { id: 'jpg', extension: 'JPG', label: 'Image', tone: 'secondary' },
  { id: 'png', extension: 'PNG', label: 'Image', tone: 'secondary' },
  { id: 'webp', extension: 'WEBP', label: 'Image', tone: 'secondary' },
  { id: 'txt', extension: 'TXT', label: 'Text', tone: 'secondary' },
]

export const homeQuickStart: HomeQuickStart[] = [
  {
    id: 'quick-merge',
    label: 'Merge PDF',
    description: 'Combine multiple PDFs into one file',
    icon: 'merge',
    tone: 'success',
    hint: 'Combine multiple PDFs into one file.',
    to: '/tools/organize-merge',
  },
  {
    id: 'quick-split',
    label: 'Split PDF',
    description: 'Divide a document into separate files',
    icon: 'split',
    tone: 'warning',
    hint: 'Divide a document into separate files.',
    to: '/tools/organize-split',
  },
  {
    id: 'quick-compress',
    label: 'Compress PDF',
    description: 'Reduce file size without losing quality',
    icon: 'compress',
    tone: 'info',
    hint: 'The compress tool arrives with Quick Tools.',
    to: '/tools/optimize-compress',
  },
  {
    id: 'quick-convert',
    label: 'Convert Files',
    description: 'Change documents between formats',
    icon: 'convert',
    tone: 'primary',
    hint: 'Format conversion arrives with Quick Tools.',
    to: '/tools',
  },
  {
    id: 'quick-ai-workspace',
    label: 'AI Workspace',
    description: 'Chat with your documents',
    icon: 'ai',
    tone: 'secondary',
    to: '/ai',
  },
  {
    id: 'quick-blank-workspace',
    label: 'Blank Workspace',
    description: 'Start with a clean workspace',
    icon: 'workspace',
    tone: 'primary',
    to: '/workspace',
  },
]

export const homeToolCategories: HomeToolCategory[] = [
  {
    id: 'edit',
    label: 'Edit',
    description: 'Modify text, images and content inside your documents.',
    icon: 'edit',
    tone: 'primary',
    tools: [
      {
        id: 'edit-text',
        label: 'Edit Text',
        description: 'Change text directly in the document',
        icon: 'file-text',
        tone: 'primary',
      },
      {
        id: 'edit-images',
        label: 'Images',
        description: 'Insert and adjust images',
        icon: 'image',
        tone: 'info',
      },
      {
        id: 'edit-shapes',
        label: 'Shapes',
        description: 'Add lines, boxes and shapes',
        icon: 'shapes',
        tone: 'success',
      },
      {
        id: 'edit-draw',
        label: 'Draw',
        description: 'Freehand drawing with a pen',
        icon: 'edit',
        tone: 'warning',
      },
      {
        id: 'edit-highlight',
        label: 'Highlight',
        description: 'Mark important content',
        icon: 'highlight',
        tone: 'warning',
      },
      {
        id: 'edit-annotate',
        label: 'Annotate',
        description: 'Add notes and comments',
        icon: 'annotation',
        tone: 'info',
      },
      // {
      //   id: 'edit-signature',
      //   label: 'Signature',
      //   description: 'Sign documents digitally',
      //   icon: 'sign',
      //   tone: 'secondary',
      // },
      {
        id: 'sign-pdf',
        label: 'Signature',
        description: 'Sign documents',
        icon: 'sign',
        tone: 'secondary',
      },
      {
        id: 'edit-forms',
        label: 'Forms',
        description: 'Fill out and design forms',
        icon: 'form',
        tone: 'success',
      },
    ],
  },
  {
    id: 'convert',
    label: 'Convert',
    description: 'Change documents from one format to another.',
    icon: 'convert',
    tone: 'info',
    tools: [
      {
        id: 'convert-images-to-pdf',
        label: 'Images to PDF',
        description: 'Turn images into a PDF',
        icon: 'image',
        tone: 'info',
      },
      {
        id: 'convert-pdf-to-images',
        label: 'PDF to Images',
        description: 'Export pages as images',
        icon: 'file',
        tone: 'success',
      },
      {
        id: 'convert-pdf-to-text',
        label: 'PDF to Text',
        description: 'Extract text to a .txt file',
        icon: 'file-text',
        tone: 'info',
      },
      {
        id: 'convert-text-to-pdf',
        label: 'Text to PDF',
        description: 'Turn text into a PDF',
        icon: 'file-text',
        tone: 'secondary',
      },
      {
        id: 'convert-word-to-pdf',
        label: 'Word to PDF',
        description: 'Convert Word documents',
        icon: 'file-text',
        tone: 'primary',
      },
      {
        id: 'convert-pdf-to-word',
        label: 'PDF to Word',
        description: 'Make documents editable',
        icon: 'file',
        tone: 'warning',
      },
      // {
      //   id: 'convert-pptx-to-pdf',
      //   label: 'PowerPoint to PDF',
      //   description: 'Convert presentations',
      //   icon: 'file-text',
      //   tone: 'primary',
      // },
      // {
      //   id: 'convert-pdf-to-pptx',
      //   label: 'PDF to PowerPoint',
      //   description: 'Make slides editable',
      //   icon: 'file',
      //   tone: 'warning',
      // },
      // {
      //   id: 'convert-xlsx-to-pdf',
      //   label: 'Excel to PDF',
      //   description: 'Convert spreadsheets',
      //   icon: 'form',
      //   tone: 'success',
      // },
      // {
      //   id: 'convert-pdf-to-xlsx',
      //   label: 'PDF to Excel',
      //   description: 'Make tables editable',
      //   icon: 'form',
      //   tone: 'info',
      // },
      {
        id: 'convert-html-to-pdf',
        label: 'HTML to PDF',
        description: 'Save web pages as PDF',
        icon: 'globe',
        tone: 'secondary',
      },
      {
        id: 'web-to-pdf',
        label: 'Web Page to PDF',
        description: 'Download any site as PDF',
        icon: 'globe',
        tone: 'warning',
      },
    ],
  },
  {
    id: 'organize',
    label: 'Organize',
    description: 'Arrange and restructure document pages.',
    icon: 'organize',
    tone: 'success',
    tools: [
      {
        id: 'organize-merge',
        label: 'Merge PDFs',
        description: 'Combine documents into one',
        icon: 'merge',
        tone: 'success',
      },
      {
        id: 'organize-split',
        label: 'Split PDF',
        description: 'Divide pages into files',
        icon: 'split',
        tone: 'warning',
      },
      {
        id: 'organize-rotate',
        label: 'Rotate Pages',
        description: 'Change page orientation',
        icon: 'rotate',
        tone: 'info',
      },
      {
        id: 'organize-extract',
        label: 'Extract Pages',
        description: 'Pull out selected pages',
        icon: 'scissors',
        tone: 'primary',
      },
      {
        id: 'organize-delete',
        label: 'Delete Pages',
        description: 'Remove unwanted pages',
        icon: 'trash',
        tone: 'secondary',
      },
      {
        id: 'organize-rearrange',
        label: 'Rearrange Pages',
        description: 'Reorder pages freely',
        icon: 'reorder',
        tone: 'info',
      },
    ],
  },
  {
    id: 'optimize',
    label: 'Optimize',
    description: 'Make documents smaller and more efficient.',
    icon: 'optimize',
    tone: 'warning',
    tools: [
      {
        id: 'optimize-compress',
        label: 'Compress PDF',
        description: 'Reduce file size',
        icon: 'compress',
        tone: 'warning',
      },
      {
        id: 'optimize-ocr',
        label: 'OCR Scans',
        description: 'Make scanned text searchable',
        icon: 'scan',
        tone: 'primary',
      },
      {
        id: 'optimize-images',
        label: 'Optimize Images',
        description: 'Compress embedded images',
        icon: 'image',
        tone: 'info',
      },
    ],
  },
  {
    id: 'compare',
    label: 'Compare',
    description: 'Spot the difference between two versions of a document.',
    icon: 'diff',
    tone: 'primary',
    tools: [
      {
        id: 'compare-pdf',
        label: 'Compare PDF',
        description: 'Find changes between two PDFs',
        icon: 'diff',
        tone: 'primary',
      },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    description: 'Protect and control access to your documents.',
    icon: 'security',
    tone: 'secondary',
    tools: [
      {
        id: 'security-protect',
        label: 'Protect PDF',
        description: 'Encrypt with a password',
        icon: 'lock',
        tone: 'secondary',
      },
      {
        id: 'security-unlock',
        label: 'Unlock PDF',
        description: 'Remove a password',
        icon: 'unlock',
        tone: 'success',
      },
      {
        id: 'security-watermark',
        label: 'Watermark',
        description: 'Stamp text or images',
        icon: 'watermark',
        tone: 'info',
      },
      {
        id: 'security-sign',
        label: 'Digitally Sign',
        description: 'Certify documents',
        icon: 'sign',
        tone: 'primary',
      },
      // {
      //   id: 'sign-pdf',
      //   label: 'Sign PDF',
      //   description: 'Sign with a drawn, typed, or uploaded signature',
      //   icon: 'sign',
      //   tone: 'info',
      // },
      {
        id: 'redact-pdf',
        label: 'Redact PDF',
        description: 'Remove sensitive content securely',
        icon: 'scissors',
        tone: 'warning',
      },
    ],
  },
  {
    id: 'ai',
    label: 'AI',
    description: 'Understand and improve documents with AI.',
    icon: 'ai',
    tone: 'primary',
    tools: [
      {
        id: 'ai-summarize',
        label: 'Summarize',
        description: 'Get a quick overview',
        icon: 'sparkles',
        tone: 'primary',
      },
      {
        id: 'ai-translate',
        label: 'Translate',
        description: 'Translate document text',
        icon: 'globe',
        tone: 'info',
      },
      {
        id: 'ai-rewrite',
        label: 'Rewrite',
        description: 'Improve wording and tone',
        icon: 'edit',
        tone: 'success',
      },
      {
        id: 'ai-assistant',
        label: 'Ask the Assistant',
        description: 'Chat about your document',
        icon: 'annotation',
        tone: 'warning',
      },
      {
        id: 'ai-extract-tables',
        label: 'Extract Tables',
        description: 'Pull data into a table',
        icon: 'form',
        tone: 'secondary',
      },
    ],
  },
]
