import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'

/**
 * Keeps one failing panel from blanking the whole dashboard.
 * Without this, any render error in a panel unmounted the entire SPA.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Panel crashed:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="bg-danger-soft border border-danger/30 rounded-[var(--radius)] p-4">
        <div className="flex items-center gap-2 text-danger">
          <AlertTriangle className="w-4 h-4" />
          <h2 className="text-sm font-semibold">This panel failed to render</h2>
        </div>
        <p className="text-xs text-muted mt-2 font-mono break-words">
          {this.state.error?.message || String(this.state.error)}
        </p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-3 text-xs font-medium text-brand hover:underline"
        >
          Try again
        </button>
      </div>
    )
  }
}
