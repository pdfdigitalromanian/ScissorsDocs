import type { ComponentType } from 'react'
import ShapesTool from './ShapesTool'
import ImagesTool from './ImagesTool'

export const ANNOTATE_TOOLS: Record<string, ComponentType> = {
  'edit-shapes': ShapesTool,
  'edit-images': ImagesTool,
}

export function isAnnotateTool(toolId: string): boolean {
  return toolId in ANNOTATE_TOOLS
}

export function getAnnotateTool(toolId: string): ComponentType | null {
  return ANNOTATE_TOOLS[toolId] ?? null
}