import type { ComponentType } from 'react'
import ProtectTool from './ProtectTool'
import UnlockTool from './UnlockTool'

const SECURITY_TOOLS: Record<string, ComponentType> = {
  'security-protect': ProtectTool,
  'security-unlock': UnlockTool,
}

/** True for the standalone, offline PDF security workflows. */
export function isSecurityTool(toolId: string): boolean {
  return toolId in SECURITY_TOOLS
}

/** Returns the dedicated workflow component for a security tool id. */
export function getSecurityTool(toolId: string): ComponentType | undefined {
  return SECURITY_TOOLS[toolId]
}