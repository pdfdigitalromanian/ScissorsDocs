import { useState } from 'react'
import './display.css'

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl'
type AvatarStatus = 'online' | 'offline' | 'busy' | 'away'

interface AvatarProps {
  name: string
  src?: string
  alt?: string
  size?: AvatarSize
  status?: AvatarStatus
  className?: string
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase()
}

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export default function Avatar({
  name,
  src,
  alt,
  size = 'md',
  status,
  className = '',
}: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const tone = (hashString(name) % 5) + 1
  const showImage = Boolean(src) && !imageFailed
  const statusLabel = status ? `, ${status}` : ''

  return (
    <span
      className={`avatar avatar--${size} avatar--tone-${tone}${
        status ? ` avatar--${status}` : ''
      }${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={alt ?? `${name}${statusLabel}`}
      title={name}
    >
      {showImage ? (
        <img
          className="avatar__image"
          src={src}
          alt=""
          onError={() => setImageFailed(true)}
        />
      ) : (
        getInitials(name)
      )}
      {status && <span className="avatar__status" aria-hidden="true" />}
    </span>
  )
}
