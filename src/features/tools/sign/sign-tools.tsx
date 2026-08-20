import type { ComponentType } from 'react'
import SignTool from './SignTool'

const SIGN_TOOLS: Record<string, ComponentType> = {
  'sign-pdf': SignTool,
}

/** True for the standalone, offline PDF signing workflow. */
export function isSignTool(toolId: string): boolean {
  return toolId in SIGN_TOOLS
}

/** Returns the dedicated workflow component for a signing tool id. */
export function getSignTool(toolId: string): ComponentType | undefined {
  return SIGN_TOOLS[toolId]
}
