import type { ComponentType } from 'react'
import RedactTool from './RedactTool'

const REDACT_TOOLS: Record<string, ComponentType> = {
  'redact-pdf': RedactTool,
}

/** True for the standalone, offline PDF redaction workflow. */
export function isRedactTool(toolId: string): boolean {
  return toolId in REDACT_TOOLS
}

/** Returns the dedicated workflow component for a redaction tool id. */
export function getRedactTool(toolId: string): ComponentType | undefined {
  return REDACT_TOOLS[toolId]
}
