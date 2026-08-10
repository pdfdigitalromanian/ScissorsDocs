import type { HTMLAttributes } from 'react'
import './display.css'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
  flush?: boolean
}

export function Card({
  interactive = false,
  flush = false,
  className = '',
  ...rest
}: CardProps) {
  const classes = [
    'card',
    interactive ? 'card--interactive' : null,
    flush ? 'card--flush' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return <div className={classes} {...rest} />
}

export function CardHeader({
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`card__header${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}

export function CardTitle({
  className = '',
  ...rest
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={`card__title${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}

export function CardDescription({
  className = '',
  ...rest
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={`card__description${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}

export function CardContent({
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`card__content${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}

export function CardFooter({
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`card__footer${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}
