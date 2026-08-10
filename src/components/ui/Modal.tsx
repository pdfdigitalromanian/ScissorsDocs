import { createContext, useContext } from 'react'
import { createPortal } from 'react-dom'
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  MouseEvent,
  ReactNode,
} from 'react'
import IconButton from './IconButton'
import { useOverlayBehavior } from './overlay'
import './overlays.css'

interface ModalContextValue {
  titleId: string
  descriptionId: string
  onClose: () => void
}

const ModalContext = createContext<ModalContextValue | null>(null)

function useModalContext(): ModalContextValue {
  const context = useContext(ModalContext)
  if (!context) {
    throw new Error('Modal components must be rendered inside <Modal>')
  }
  return context
}

interface ModalProps {
  open: boolean
  onClose: () => void
  size?: 'sm' | 'md' | 'lg' | 'xl'
  closeOnOverlay?: boolean
  children: ReactNode
}

export function Modal({
  open,
  onClose,
  size = 'md',
  closeOnOverlay = true,
  children,
}: ModalProps) {
  const { panelRef, titleId, descriptionId } = useOverlayBehavior(open, onClose)

  if (!open) return null

  const handleOverlayPointerDown = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnOverlay && event.target === event.currentTarget) {
      onClose()
    }
  }

  return createPortal(
    <div className="modal-overlay" onPointerDown={handleOverlayPointerDown}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={`modal modal--${size}`}
      >
        <ModalContext.Provider value={{ titleId, descriptionId, onClose }}>
          {children}
        </ModalContext.Provider>
      </div>
    </div>,
    document.body,
  )
}

export function ModalHeader({
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`modal__header${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}

export function ModalTitle({
  className = '',
  ...rest
}: HTMLAttributes<HTMLHeadingElement>) {
  const { titleId } = useModalContext()
  return (
    <h2
      id={titleId}
      className={`modal__title${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}

export function ModalBody({
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`modal__body${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}

export function ModalFooter({
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`modal__footer${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}

export function ModalClose({
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { onClose } = useModalContext()
  return (
    <IconButton
      icon="close"
      label="Close dialog"
      className={`modal__close${className ? ` ${className}` : ''}`}
      {...rest}
      onClick={onClose}
    />
  )
}
