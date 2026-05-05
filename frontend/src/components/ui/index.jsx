import clsx from 'clsx'
import { Info } from 'lucide-react'

/**
 * Card — Wrapper component for dashboard panels.
 */
export function Card({ className, children }) {
  return (
    <div className={clsx('bg-slate-900 border border-slate-800 rounded-lg p-4', className)}>
      {children}
    </div>
  )
}

/**
 * Badge — Colored label for status indicators.
 */
export function Badge({ status, label, variant, className, children }) {
  const statusClasses = {
    healthy: 'bg-emerald-900 text-emerald-200 border border-emerald-700',
    warning: 'bg-amber-900 text-amber-200 border border-amber-700',
    error: 'bg-red-900 text-red-200 border border-red-700',
    info: 'bg-indigo-900 text-indigo-200 border border-indigo-700',
    offline: 'bg-slate-700 text-slate-200 border border-slate-600',
    success: 'bg-emerald-700 text-emerald-200 border border-emerald-600',
  }
  
  const displayStatus = status || variant || 'info'
  const displayText = label || children
  
  return (
    <span className={clsx(
      'inline-block px-2 py-1 rounded text-xs font-semibold',
      statusClasses[displayStatus] || statusClasses.info,
      className
    )}>
      {displayText}
    </span>
  )
}

/**
 * Button — Primary action button.
 */
export function Button({ onClick, disabled, variant = 'primary', className, children }) {
  const variantClasses = {
    primary: 'bg-teal-600 hover:bg-teal-700 text-white',
    secondary: 'bg-slate-700 hover:bg-slate-600 text-slate-100',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white',
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
    healthy: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
    offline: 'bg-slate-500',
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
export function Stat({ label, value, unit = '', trend, description, className }) {
  return (
    <div className={clsx('flex flex-col group cursor-help', className)}>
      <div className="flex items-center gap-1">
        <span className="text-xs font-semibold text-gray-400">{label}</span>
        {description && (
          <Info className="w-3 h-3 text-teal-500 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
      {description && (
        <span className="absolute bg-slate-800 text-gray-200 text-xs rounded px-2 py-1 hidden group-hover:block z-10 whitespace-nowrap mt-6 pointer-events-none">
          {description}
        </span>
      )}
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
