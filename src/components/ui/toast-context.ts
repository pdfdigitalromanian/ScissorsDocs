import { createContext, useContext } from 'react'

export type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info'

export interface ToastData {
  id: string
  title: string
  description?: string
  variant: ToastVariant
  duration: number
}

export interface ToastOptions {
  title: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

export interface ToastContextValue {
  toasts: ToastData[]
  toast: (options: ToastOptions) => string
  dismiss: (id: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a <ToastProvider>')
  }
  return context
}
