import clsx from 'clsx'
import { Info } from 'lucide-react'

/**
 * Shared primitives.
 *
 * Everything here draws from the ADK Dev tokens in index.css - brand violet for
 * anything interactive, gold for emphasis, and the semantic colours strictly for
 * state (healthy / warning / error). No decorative colour.
 */

export function Card({ className, children, ...rest }) {
  return (
    <div
      className={clsx(
        'bg-surface border border-line rounded-[var(--radius)] p-4',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

export function SectionTitle({ icon: Icon, title, description, actions }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="flex items-start gap-2 min-w-0">
        {Icon && <Icon className="w-4 h-4 mt-0.5 shrink-0 text-brand" aria-hidden="true" />}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-content truncate">{title}</h2>
          {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
        </div>
      </div>
      {actions}
    </div>
  )
}

const BADGE_VARIANTS = {
  healthy: 'bg-success-soft text-success border-success/30',
  success: 'bg-success-soft text-success border-success/30',
  warning: 'bg-warning-soft text-warning border-warning/30',
  error: 'bg-danger-soft text-danger border-danger/30',
  info: 'bg-info-soft text-info border-info/30',
  brand: 'bg-brand-soft text-brand border-brand/30',
  offline: 'bg-surface-muted text-muted border-line',
}

export function Badge({ status, label, variant, className, children }) {
  const key = status || variant || 'info'
  return (
    <span
      className={clsx(
        'inline-block px-2 py-0.5 rounded border text-xs font-medium',
        BADGE_VARIANTS[key] || BADGE_VARIANTS.info,
        className
      )}
    >
      {label || children}
    </span>
  )
}

const BUTTON_VARIANTS = {
  primary: 'bg-brand text-on-brand hover:opacity-90',
  secondary: 'bg-surface-muted text-content border border-line hover:border-line-strong',
  // Was missing entirely, so the Pause / Poison / Flood controls in the chaos
  // panel rendered as unstyled transparent buttons.
  warning: 'bg-warning text-on-accent hover:opacity-90',
  danger: 'bg-danger text-white hover:opacity-90',
  success: 'bg-success text-white hover:opacity-90',
  ghost: 'text-muted hover:text-content hover:bg-surface-muted',
}

export function Button({
  onClick,
  disabled,
  variant = 'primary',
  type = 'button',
  className,
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-[var(--radius)]',
        'text-sm font-medium transition-opacity',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary,
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

const DOT_VARIANTS = {
  healthy: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-danger',
  offline: 'bg-idle',
}

export function StatusDot({ status, pulse = true, className }) {
  return (
    <span
      className={clsx(
        'inline-block w-2.5 h-2.5 rounded-full shrink-0',
        DOT_VARIANTS[status] || DOT_VARIANTS.offline,
        pulse && status === 'healthy' && 'animate-pulse',
        className
      )}
    />
  )
}

/**
 * One metric. Deliberately uniform: the previous version gave each of the eight
 * overview tiles its own gradient, which encoded nothing.
 */
export function Stat({ label, value, unit = '', description, emphasis = false, className }) {
  return (
    <div
      className={clsx(
        'relative group rounded-[var(--radius)] border border-line bg-surface p-3',
        emphasis && 'border-brand/40',
        className
      )}
      title={description}
    >
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-muted">{label}</span>
        {description && (
          <Info className="w-3 h-3 text-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
      <div className="flex items-baseline gap-1 mt-1">
        <span
          className={clsx(
            'text-2xl font-semibold tabular-nums',
            emphasis ? 'text-brand' : 'text-content'
          )}
        >
          {value}
        </span>
        {unit && <span className="text-xs text-muted">{unit}</span>}
      </div>
    </div>
  )
}

export function LoadingSpinner({ label = 'Loading' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-muted" role="status">
      <span className="animate-spin h-5 w-5 border-2 border-brand border-t-transparent rounded-full" />
      <span className="text-xs">{label}…</span>
    </div>
  )
}

export function ErrorMessage({ message }) {
  return (
    <div
      className="bg-danger-soft border border-danger/30 rounded-[var(--radius)] p-3"
      role="alert"
    >
      <p className="text-sm text-danger">{message}</p>
    </div>
  )
}

export function EmptyState({ message }) {
  return <p className="text-xs text-muted py-6 text-center">{message}</p>
}

/** Queue names, routing keys and ids - always monospace. */
export function Mono({ children, className }) {
  return <span className={clsx('font-mono text-xs', className)}>{children}</span>
}
