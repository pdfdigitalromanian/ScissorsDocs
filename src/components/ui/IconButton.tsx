import type { ButtonHTMLAttributes, Ref } from 'react'
import { Icon } from '@/components/icons/Icon'
import type { IconName, IconSize } from '@/components/icons/Icon'
import './ui.css'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  label: string
  iconSize?: IconSize
  buttonRef?: Ref<HTMLButtonElement>
}

export default function IconButton({
  icon,
  label,
  iconSize = 'md',
  className = '',
  buttonRef,
  ...rest
}: IconButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`icon-button${className ? ` ${className}` : ''}`}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} size={iconSize} />
    </button>
  )
}
