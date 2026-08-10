import type { HTMLAttributes } from 'react'
import './layout-workspace.css'

export function Panel({
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`panel${className ? ` ${className}` : ''}`} {...rest} />
  )
}

export function PanelHeader({
  className = '',
  ...rest
}: HTMLAttributes<HTMLElement>) {
  return (
    <header
      className={`panel__header${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}

export function PanelTitle({
  className = '',
  ...rest
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={`panel__title${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}

export function PanelContent({
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`panel__content${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}

export function PanelFooter({
  className = '',
  ...rest
}: HTMLAttributes<HTMLElement>) {
  return (
    <footer
      className={`panel__footer${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}
