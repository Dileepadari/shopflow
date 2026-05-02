import clsx from 'clsx'

/**
 * Card — Wrapper component for dashboard panels.
 */
export function Card({ className, children }) {
  return (
    <div className={clsx('bg-gray-900 border border-gray-800 rounded-lg p-4', className)}>
      {children}
    </div>
  )
}

/**
 * Badge — Colored label for status indicators.
 */
export function Badge({ status, label, className }) {
  const statusClasses = {
    healthy: 'bg-green-900 text-green-200 border border-green-700',
    warning: 'bg-yellow-900 text-yellow-200 border border-yellow-700',
    error: 'bg-red-900 text-red-200 border border-red-700',
    info: 'bg-blue-900 text-blue-200 border border-blue-700',
    offline: 'bg-gray-700 text-gray-200 border border-gray-600',
  }
  return (
    <span className={clsx(
      'inline-block px-2 py-1 rounded text-xs font-semibold',
      statusClasses[status] || statusClasses.info,
      className
    )}>
      {label}
    </span>
  )
}

/**
 * Button — Primary action button.
 */
export function Button({ onClick, disabled, variant = 'primary', className, children }) {
  const variantClasses = {
    primary: 'bg-orange-600 hover:bg-orange-700 text-white',
    secondary: 'bg-gray-700 hover:bg-gray-600 text-gray-100',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    success: 'bg-green-600 hover:bg-green-700 text-white',
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'px-3 py-2 rounded text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </button>
  )
}

/**
 * StatusDot — Colored circle indicator for health status.
 */
export function StatusDot({ status, className }) {
  const statusClasses = {
    healthy: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-red-500',
    offline: 'bg-gray-500',
  }
  return (
    <div
      className={clsx('w-3 h-3 rounded-full animate-pulse', statusClasses[status], className)}
    />
  )
}

/**
 * Stat — Display a metric with label and value.
 */
export function Stat({ label, value, unit = '', trend, className }) {
  return (
    <div className={clsx('flex flex-col', className)}>
      <span className="text-xs font-semibold text-gray-400">{label}</span>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-2xl font-bold text-white">{value}</span>
        {unit && <span className="text-xs text-gray-500">{unit}</span>}
      </div>
      {trend && (
        <span className={clsx('text-xs mt-1', trend > 0 ? 'text-red-400' : 'text-green-400')}>
          {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}
        </span>
      )}
    </div>
  )
}

/**
 * LoadingSpinner — Shows loading state.
 */
export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-4">
      <div className="animate-spin h-6 w-6 border-2 border-orange-500 border-t-transparent rounded-full" />
    </div>
  )
}

/**
 * ErrorMessage — Shows error state.
 */
export function ErrorMessage({ message }) {
  return (
    <div className="bg-red-900 border border-red-700 rounded p-3">
      <p className="text-sm text-red-200">Error: {message}</p>
    </div>
  )
}
