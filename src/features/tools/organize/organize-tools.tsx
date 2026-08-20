import type { ComponentType } from 'react'
import MergeTool from './tools/MergeTool'
import SplitTool from './tools/SplitTool'
import ExtractTool from './tools/ExtractTool'
import DeleteTool from './tools/DeleteTool'
import RotateTool from './tools/RotateTool'
import RearrangeTool from './tools/RearrangeTool'

const ORGANIZE_TOOLS: Record<string, ComponentType> = {
  'organize-merge': MergeTool,
  'organize-split': SplitTool,
  'organize-extract': ExtractTool,
  'organize-delete': DeleteTool,
  'organize-rotate': RotateTool,
  'organize-rearrange': RearrangeTool,
}

/** True for the standalone, offline organize workflows. */
export function isOrganizeTool(toolId: string): boolean {
  return toolId in ORGANIZE_TOOLS
}

/** Returns the dedicated workflow component for an organize tool id. */
export function getOrganizeTool(toolId: string): ComponentType | undefined {
  return ORGANIZE_TOOLS[toolId]
}