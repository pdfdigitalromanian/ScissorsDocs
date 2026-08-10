import type { CSSProperties, HTMLAttributes } from 'react'
import './feedback.css'

type SkeletonVariant = 'rect' | 'circle' | 'text'

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant
  width?: string | number
  height?: string | number
  style?: CSSProperties
}

export default function Skeleton({
  variant = 'rect',
  width,
  height,
  style,
  className = '',
  ...rest
}: SkeletonProps) {
  return (
    <div
      className={`skeleton${variant !== 'rect' ? ` skeleton--${variant}` : ''}${
        className ? ` ${className}` : ''
      }`}
      style={{ width, height, ...style }}
      {...rest}
    />
  )
}
