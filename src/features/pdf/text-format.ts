export type PdfEditorFontFamily =
  | 'original'
  | 'lato'
  | 'lora'
  | 'fira-sans'
  | 'roboto'
  | 'open-sans'
  | 'montserrat'
  | 'poppins'
  | 'raleway'
  | 'nunito'
  | 'barlow'
  | 'playfair-display'
  | 'rubik'
  | 'pt-sans'
  | 'noto-sans'
  | 'noto-serif'
  | 'source-sans-3'
  | 'source-serif-4'
  | 'libre-baskerville'
  | 'alegreya'
  | 'crimson-pro'
  | 'cabin'
  | 'karla'
  | 'mulish'
export type PdfEditorFontWeight = 400 | 700

export interface PdfTextFormat {
  fontFamily: PdfEditorFontFamily
  fontSize: number
  fontWeight: PdfEditorFontWeight
  italic: boolean
  underline: boolean
  letterSpacing: number
  color: [number, number, number]
}

export interface PdfTextSelectionController {
  id: string
  originalFontName: string
  format: PdfTextFormat
  applyFormat: (changes: Partial<PdfTextFormat>) => PdfTextFormat
  resetFormat: () => PdfTextFormat
  commit: () => void
  cancel: () => void
}

export interface PdfEditorFontDefinition {
  id: Exclude<PdfEditorFontFamily, 'original'>
  label: string
  cssFamily: string
  directory: string
}

export const PDF_EDITOR_FONTS: readonly PdfEditorFontDefinition[] = [
  {
    id: 'lato',
    label: 'Lato',
    cssFamily: 'Scissors Editor Lato',
    directory: 'lato',
  },
  {
    id: 'lora',
    label: 'Lora',
    cssFamily: 'Scissors Editor Lora',
    directory: 'lora',
  },
  {
    id: 'fira-sans',
    label: 'Fira Sans',
    cssFamily: 'Scissors Editor Fira Sans',
    directory: 'fira-sans',
  },
  {
    id: 'roboto',
    label: 'Roboto',
    cssFamily: 'Scissors Editor Roboto',
    directory: 'roboto',
  },
  {
    id: 'open-sans',
    label: 'Open Sans',
    cssFamily: 'Scissors Editor Open Sans',
    directory: 'open-sans',
  },
  {
    id: 'montserrat',
    label: 'Montserrat',
    cssFamily: 'Scissors Editor Montserrat',
    directory: 'montserrat',
  },
  {
    id: 'poppins',
    label: 'Poppins',
    cssFamily: 'Scissors Editor Poppins',
    directory: 'poppins',
  },
  {
    id: 'raleway',
    label: 'Raleway',
    cssFamily: 'Scissors Editor Raleway',
    directory: 'raleway',
  },
  {
    id: 'nunito',
    label: 'Nunito',
    cssFamily: 'Scissors Editor Nunito',
    directory: 'nunito',
  },
  {
    id: 'barlow',
    label: 'Barlow',
    cssFamily: 'Scissors Editor Barlow',
    directory: 'barlow',
  },
  {
    id: 'playfair-display',
    label: 'Playfair Display',
    cssFamily: 'Scissors Editor Playfair Display',
    directory: 'playfair-display',
  },
  {
    id: 'rubik',
    label: 'Rubik',
    cssFamily: 'Scissors Editor Rubik',
    directory: 'rubik',
  },
  {
    id: 'pt-sans',
    label: 'PT Sans',
    cssFamily: 'Scissors Editor PT Sans',
    directory: 'pt-sans',
  },
  {
    id: 'noto-sans',
    label: 'Noto Sans',
    cssFamily: 'Scissors Editor Noto Sans',
    directory: 'noto-sans',
  },
  {
    id: 'noto-serif',
    label: 'Noto Serif',
    cssFamily: 'Scissors Editor Noto Serif',
    directory: 'noto-serif',
  },
  {
    id: 'source-sans-3',
    label: 'Source Sans 3',
    cssFamily: 'Scissors Editor Source Sans 3',
    directory: 'source-sans-3',
  },
  {
    id: 'source-serif-4',
    label: 'Source Serif 4',
    cssFamily: 'Scissors Editor Source Serif 4',
    directory: 'source-serif-4',
  },
  {
    id: 'libre-baskerville',
    label: 'Libre Baskerville',
    cssFamily: 'Scissors Editor Libre Baskerville',
    directory: 'libre-baskerville',
  },
  {
    id: 'alegreya',
    label: 'Alegreya',
    cssFamily: 'Scissors Editor Alegreya',
    directory: 'alegreya',
  },
  {
    id: 'crimson-pro',
    label: 'Crimson Pro',
    cssFamily: 'Scissors Editor Crimson Pro',
    directory: 'crimson-pro',
  },
  {
    id: 'cabin',
    label: 'Cabin',
    cssFamily: 'Scissors Editor Cabin',
    directory: 'cabin',
  },
  {
    id: 'karla',
    label: 'Karla',
    cssFamily: 'Scissors Editor Karla',
    directory: 'karla',
  },
  {
    id: 'mulish',
    label: 'Mulish',
    cssFamily: 'Scissors Editor Mulish',
    directory: 'mulish',
  },
] as const

let editorFontFacesRegistered = false

export function registerBundledEditorFontFaces(): void {
  if (
    editorFontFacesRegistered ||
    typeof document === 'undefined' ||
    typeof FontFace === 'undefined'
  ) {
    return
  }

  for (const definition of PDF_EDITOR_FONTS) {
    for (const weight of [400, 700] as const) {
      for (const italic of [false, true]) {
        const face = new FontFace(
          definition.cssFamily,
          `url("${editorFontFaceFile(definition.id, weight, italic)}") format("truetype")`,
          {
            style: italic ? 'italic' : 'normal',
            weight: String(weight),
          },
        )
        document.fonts.add(face)
      }
    }
  }
  editorFontFacesRegistered = true
}

export function bundledEditorFont(
  family: Exclude<PdfEditorFontFamily, 'original'>,
): PdfEditorFontDefinition {
  const definition = PDF_EDITOR_FONTS.find((font) => font.id === family)
  if (!definition) throw new Error(`Unknown editor font family: ${family}`)
  return definition
}

export function editorFontFaceFile(
  family: Exclude<PdfEditorFontFamily, 'original'>,
  weight: PdfEditorFontWeight,
  italic: boolean,
): string {
  const definition = bundledEditorFont(family)
  const face =
    weight === 700
      ? italic
        ? 'bold-italic'
        : 'bold'
      : italic
        ? 'italic'
        : 'regular'
  return `/fonts/editor/${definition.directory}/${face}.ttf`
}

export function pdfColorToHex(color: [number, number, number]): string {
  return `#${color
    .map((channel) =>
      Math.round(Math.min(Math.max(channel, 0), 1) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

export function hexToPdfColor(value: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(value)
  if (!match) return [0, 0, 0]
  return [0, 2, 4].map(
    (offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16) / 255,
  ) as [number, number, number]
}

export function sameTextFormat(
  left: PdfTextFormat,
  right: PdfTextFormat,
): boolean {
  return (
    left.fontFamily === right.fontFamily &&
    left.fontSize === right.fontSize &&
    left.fontWeight === right.fontWeight &&
    left.italic === right.italic &&
    left.underline === right.underline &&
    left.letterSpacing === right.letterSpacing &&
    left.color.every((channel, index) => channel === right.color[index])
  )
}
