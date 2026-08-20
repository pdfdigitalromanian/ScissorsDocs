import type { ComponentType } from 'react'
import ConvertTool from './ConvertTool'
import { CONVERSION_CONFIGS, type ConversionConfig } from './convert-config'

function makeConversionWorkflow(config: ConversionConfig) {
  function ConversionWorkflow() {
    return <ConvertTool config={config} />
  }
  return ConversionWorkflow
}

export const CONVERT_TOOLS: Record<string, ComponentType> = Object.fromEntries(
  CONVERSION_CONFIGS.map((config) => [config.toolId, makeConversionWorkflow(config)]),
)

export function isConvertTool(toolId: string): boolean {
  return toolId in CONVERT_TOOLS
}

export function getConvertTool(toolId: string): ComponentType | null {
  return CONVERT_TOOLS[toolId] ?? null
}