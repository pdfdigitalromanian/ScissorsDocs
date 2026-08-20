import type { ComponentType } from 'react'
import OcrTool from './OcrTool'

export const OCR_TOOLS: Record<string, ComponentType> = {
  'optimize-ocr': OcrTool,
}

export function isOcrTool(toolId: string): boolean {
  return toolId in OCR_TOOLS
}

export function getOcrTool(toolId: string): ComponentType | null {
  return OCR_TOOLS[toolId] ?? null
}