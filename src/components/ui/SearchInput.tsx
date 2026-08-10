import { useRef, useState } from 'react'
import type { InputHTMLAttributes } from 'react'
import { Icon } from '@/components/icons/Icon'
import Input from './Input'
import IconButton from './IconButton'
import Spinner from './Spinner'
import './inputs.css'

interface SearchInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size'
> {
  label?: string
  loading?: boolean
  clearable?: boolean
}

export default function SearchInput({
  label = 'Search',
  loading = false,
  clearable = true,
  value,
  defaultValue,
  onChange,
  className = '',
  ...rest
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [internalValue, setInternalValue] = useState(defaultValue ?? '')
  const isControlled = value !== undefined
  const currentValue = isControlled ? value : internalValue
  const canClear =
    clearable && !loading && String(currentValue ?? '').length > 0

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!isControlled) setInternalValue(event.target.value)
    onChange?.(event)
  }

  const handleClear = () => {
    if (inputRef.current) {
      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      valueSetter?.call(inputRef.current, '')
      inputRef.current.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }

  return (
    <div className={`search-input${className ? ` ${className}` : ''}`}>
      <span className="search-input__icon" aria-hidden="true">
        <Icon name="search" size="sm" />
      </span>
      <Input
        inputRef={inputRef}
        type="search"
        aria-label={label}
        value={currentValue}
        onChange={handleChange}
        {...rest}
      />
      {loading ? (
        <span className="search-input__clear" aria-hidden="true">
          <Spinner size="sm" label="" />
        </span>
      ) : canClear ? (
        <IconButton
          icon="close"
          label="Clear search"
          iconSize="sm"
          className="search-input__clear"
          onClick={handleClear}
        />
      ) : null}
    </div>
  )
}
