import type { ComponentType } from 'react'
import WebToPdfTool from './WebToPdfTool'

const WEB_TOOLS: Record<string, ComponentType> = {
  'web-to-pdf': WebToPdfTool,
}

/** True for the standalone, offline web workflows. */
export function isWebTool(toolId: string): boolean {
  return toolId in WEB_TOOLS
}

/** Returns the dedicated workflow component for a web tool id. */
export function getWebTool(toolId: string): ComponentType | undefined {
  return WEB_TOOLS[toolId]
}