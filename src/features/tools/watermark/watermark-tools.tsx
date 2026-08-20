import type { ComponentType } from 'react'
import WatermarkTool from './WatermarkTool'

export const WATERMARK_TOOLS: Record<string, ComponentType> = {
  'security-watermark': WatermarkTool,
}

export function isWatermarkTool(toolId: string): boolean {
  return toolId in WATERMARK_TOOLS
}

export function getWatermarkTool(toolId: string): ComponentType | null {
  return WATERMARK_TOOLS[toolId] ?? null
}