import type { ComponentType } from 'react'
import CompareTool from './CompareTool'

export const COMPARE_TOOLS: Record<string, ComponentType> = {
  'compare-pdf': CompareTool,
}

export function isCompareTool(toolId: string): boolean {
  return toolId in COMPARE_TOOLS
}

export function getCompareTool(toolId: string): ComponentType | null {
  return COMPARE_TOOLS[toolId] ?? null
}