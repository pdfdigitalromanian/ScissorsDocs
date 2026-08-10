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

type DrawerSide = 'left' | 'right' | 'top' | 'bottom'

interface DrawerContextValue {
  titleId: string
  descriptionId: string
  onClose: () => void
}

const DrawerContext = createContext<DrawerContextValue | null>(null)

function useDrawerContext(): DrawerContextValue {
  const context = useContext(DrawerContext)
  if (!context) {
    throw new Error('Drawer components must be rendered inside <Drawer>')
  }
  return context
}

interface DrawerProps {
  open: boolean
  onClose: () => void
  side?: DrawerSide
  closeOnOverlay?: boolean
  children: ReactNode
}

export function Drawer({
  open,
  onClose,
  side = 'right',
  closeOnOverlay = true,
  children,
}: DrawerProps) {
  const { panelRef, titleId, descriptionId } = useOverlayBehavior(open, onClose)

  if (!open) return null

  const handleOverlayPointerDown = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnOverlay && event.target === event.currentTarget) {
      onClose()
    }
  }

  return createPortal(
    <div className="drawer-overlay" onPointerDown={handleOverlayPointerDown}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={`drawer drawer--${side}`}
      >
        <DrawerContext.Provider value={{ titleId, descriptionId, onClose }}>
          {children}
        </DrawerContext.Provider>
      </div>
    </div>,
    document.body,
  )
}

export function DrawerHeader({
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`drawer__header${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}

export function DrawerTitle({
  className = '',
  ...rest
}: HTMLAttributes<HTMLHeadingElement>) {
  const { titleId } = useDrawerContext()
  return (
    <h2
      id={titleId}
      className={`drawer__title${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}

export function DrawerBody({
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`drawer__body${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}

export function DrawerFooter({
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`drawer__footer${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}

export function DrawerClose({
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { onClose } = useDrawerContext()
  return (
    <IconButton
      icon="close"
      label="Close panel"
      className={`drawer__close${className ? ` ${className}` : ''}`}
      {...rest}
      onClick={onClose}
    />
  )
}
