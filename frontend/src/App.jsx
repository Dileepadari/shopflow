/**
 * App.jsx - ShopFlow dashboard root.
 * Real-time monitoring and chaos control for the RabbitMQ messaging system.
 */
import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'

import { ErrorBoundary } from './components/ErrorBoundary'
import { ChaosControlPanel } from './components/chaos/index'
import {
  ClusterHealthPanel,
  ConsumerStatusPanel,
  ExchangeMapPanel,
  QueueMonitorPanel,
} from './components/panels/index'
import {
  ConnectionMapPanel,
  DLXAuditLogPanel,
  MessagePublisherPanel,
  OrderSenderPanel,
  OverviewPanel,
} from './components/panels/advanced'
import { StatusDot } from './components/ui/index'
import { useDashboardData } from './hooks/useDashboardData'
import { useTheme } from './hooks/useTheme'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'queues', label: 'Queues' },
  { id: 'exchanges', label: 'Exchanges' },
  { id: 'consumers', label: 'Consumers' },
  { id: 'connections', label: 'Connections' },
  { id: 'dlx', label: 'DLX Audit' },
  { id: 'orders', label: 'Orders' },
  { id: 'publisher', label: 'Publisher' },
  { id: 'chaos', label: 'Chaos' },
]

export default function App() {
  const [active, setActive] = useState('overview')
  const [clusterHealthOpen, setClusterHealthOpen] = useState(true)
  const { theme, toggle } = useTheme()
  const {
    nodes,
    overview,
    queues,
    exchanges,
    bindings,
    consumers,
    connections,
    dlxHistory,
    status,
    messageHistory,
    loading,
    error,
    pollMs,
  } = useDashboardData()

  const runningNodes = nodes.filter((n) => n.running).length
  const clusterHealthy = nodes.length > 0 && runningNodes === nodes.length

  const renderPanel = () => {
    switch (active) {
      case 'queues':
        return <QueueMonitorPanel queues={queues} loading={loading} error={error} />
      case 'exchanges':
        return (
          <ExchangeMapPanel
            exchanges={exchanges}
            bindings={bindings}
            loading={loading}
            error={error}
          />
        )
      case 'consumers':
        return (
          <ConsumerStatusPanel
            consumers={consumers}
            status={status}
            loading={loading}
            error={error}
          />
        )
      case 'connections':
        return <ConnectionMapPanel connections={connections} loading={loading} error={error} />
      case 'dlx':
        return <DLXAuditLogPanel dlxHistory={dlxHistory} loading={loading} error={error} />
      case 'orders':
        return <OrderSenderPanel />
      case 'publisher':
        return <MessagePublisherPanel exchanges={exchanges} />
      case 'chaos':
        return <ChaosControlPanel queues={queues} status={status} />
      case 'overview':
      default:
        return (
          <OverviewPanel
            overview={overview}
            queues={queues}
            messageHistory={messageHistory}
            loading={loading}
            error={error}
          />
        )
    }
  }

  return (
    <div className="min-h-screen bg-page flex flex-col">
      <header className="border-b border-line px-3 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] bg-brand/10 p-1.5">
            <img
              src="/adk-mark.png"
              alt="ADK Dev"
              className="h-full w-full object-contain logo-mono"
            />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold text-content leading-tight">
              ShopFlow
            </h1>
            <p className="text-xs text-muted truncate">
              Distributed Order Processing · RabbitMQ
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2 text-xs text-muted">
            <StatusDot status={clusterHealthy ? 'healthy' : nodes.length ? 'warning' : 'offline'} />
            <span className="tabular-nums whitespace-nowrap">
              {runningNodes}/{nodes.length || 3} nodes
            </span>
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            className="p-2 rounded-[var(--radius)] text-muted hover:text-content hover:bg-surface-muted transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <nav
        className="border-b border-line px-3 sm:px-6 flex gap-1 overflow-x-auto scrollbar-thin"
        aria-label="Dashboard sections"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            aria-current={active === tab.id ? 'page' : undefined}
            className={`px-3 py-3 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              active === tab.id
                ? 'text-brand border-brand'
                : 'text-muted border-transparent hover:text-content'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 p-3 sm:p-6 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
          {active !== 'overview' && (
            <ErrorBoundary>
              <ClusterHealthPanel
                nodes={nodes}
                loading={loading}
                error={error}
                isOpen={clusterHealthOpen}
                onToggle={() => setClusterHealthOpen((open) => !open)}
              />
            </ErrorBoundary>
          )}
          <ErrorBoundary key={active}>{renderPanel()}</ErrorBoundary>
        </div>
      </main>

      <footer className="border-t border-line px-3 sm:px-6 py-3 text-xs text-muted flex flex-col sm:flex-row justify-between gap-1">
        <p>Live — refreshed every {pollMs / 1000} seconds</p>
        <p className="sm:text-right">
          © 2026 ADK Dev · Dileep Adari
          <span className="text-subtle">
            {' '}
            · originally built by Team 9 (Three Musketeers), IIITH Distributed Systems
          </span>
        </p>
      </footer>
    </div>
  )
}
