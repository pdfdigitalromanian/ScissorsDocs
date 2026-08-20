import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Icon } from './icons/Icon'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Catches render-time errors inside a tool workflow so a single broken tool
 * cannot take down the whole application. The user sees a friendly message
 * with the option to reload instead of a blank or crashed page.
 */
export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="error-boundary" role="alert">
          <span className="error-boundary__icon" aria-hidden="true">
            <Icon name="alert-circle" size="lg" />
          </span>
          <h1>Something went wrong</h1>
          <p>This tool hit an unexpected error and could not continue.</p>
          <pre>{this.state.error.message}</pre>
          <button
            type="button"
            className="error-boundary__button"
            onClick={() => {
              this.setState({ error: null })
              window.location.reload()
            }}
          >
            Reload page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}