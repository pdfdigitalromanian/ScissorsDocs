import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@/components/icons/Icon'
import type { IconName } from '@/components/icons/Icon'
import IconButton from './IconButton'
import { ToastContext, useToast } from './toast-context'
import type {
  ToastContextValue,
  ToastData,
  ToastOptions,
  ToastVariant,
} from './toast-context'
import './toast.css'

const DEFAULT_DURATION_MS = 5000

const TOAST_ICONS: Record<ToastVariant, IconName> = {
  default: 'info',
  success: 'check-circle',
  error: 'alert-circle',
  warning: 'alert-triangle',
  info: 'info',
}

let toastCounter = 0

function createToastId(): string {
  toastCounter += 1
  return `toast-${Date.now()}-${toastCounter}`
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([])
  const timers = useRef(new Map<string, number>())

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    const timer = timers.current.get(id)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const toast = useCallback((options: ToastOptions): string => {
    const id = createToastId()
    const data: ToastData = {
      id,
      title: options.title,
      description: options.description,
      variant: options.variant ?? 'default',
      duration: options.duration ?? DEFAULT_DURATION_MS,
    }

    setToasts((current) => [...current, data])

    const timer = window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
      timers.current.delete(id)
    }, data.duration)
    timers.current.set(id, timer)

    return id
  }, [])

  useEffect(() => {
    const activeTimers = timers.current
    return () => {
      activeTimers.forEach((timer) => window.clearTimeout(timer))
      activeTimers.clear()
    }
  }, [])

  const value: ToastContextValue = { toasts, toast, dismiss }

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

interface ToastViewportProps {
  className?: string
}

export function ToastViewport({ className = '' }: ToastViewportProps) {
  const { toasts, dismiss } = useToast()

  return createPortal(
    <div
      className={`toast-viewport${className ? ` ${className}` : ''}`}
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((toastData) => (
        <ToastCard key={toastData.id} toast={toastData} onDismiss={dismiss} />
      ))}
    </div>,
    document.body,
  )
}

interface ToastCardProps {
  toast: ToastData
  onDismiss: (id: string) => void
}

function ToastCard({ toast, onDismiss }: ToastCardProps) {
  const isError = toast.variant === 'error'

  return (
    <div
      className={`toast toast--${toast.variant}`}
      role={isError ? 'alert' : 'status'}
    >
      <span className="toast__icon" aria-hidden="true">
        <Icon name={TOAST_ICONS[toast.variant]} size="sm" />
      </span>
      <div className="toast__content">
        <p className="toast__title">{toast.title}</p>
        {toast.description && (
          <p className="toast__description">{toast.description}</p>
        )}
      </div>
      <IconButton
        icon="close"
        label="Dismiss notification"
        iconSize="sm"
        className="toast__close"
        onClick={() => onDismiss(toast.id)}
      />
    </div>
  )
}
