/**
 * App.jsx - ShopFlow dashboard root.
 * Real-time monitoring and chaos control for RabbitMQ distributed messaging system.
 */
import React, { useState, useEffect } from 'react'
import {
  ClusterHealthPanel,
  QueueMonitorPanel,
  ExchangeMapPanel,
  ConsumerStatusPanel,
} from './components/panels/index'
import {
  DLXAuditLogPanel,
  MessagePublisherPanel,
  ConnectionMapPanel,
  OverviewPanel,
  OrderSenderPanel,
} from './components/panels/advanced'
import { ChaosControlPanel } from './components/chaos/index'
import * as rabbitmq from './api/rabbitmq'
import * as chaos from './api/chaos'
import { useInterval } from './hooks/useInterval'

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
  const [isClusterHealthOpen, setIsClusterHealthOpen] = useState(true)
  const [nodes, setNodes] = useState([])
  const [overview, setOverview] = useState({})
  const [queues, setQueues] = useState([])
  const [exchanges, setExchanges] = useState([])
  const [bindings, setBindings] = useState([])
  const [consumers, setConsumers] = useState([])
  const [connections, setConnections] = useState([])
  const [dlxHistory, setDlxHistory] = useState([])
  const [messageHistory, setMessageHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch all data every 2 seconds
  useInterval(async () => {
    try {
      const [nodesData, overviewData, queuesData, exchangesData, bindingsData, consumersData, connsData, dlxData] =
        await Promise.all([
          rabbitmq.fetchNodes(),
          rabbitmq.fetchOverview(),
          rabbitmq.fetchQueues(),
          rabbitmq.fetchExchanges(),
          rabbitmq.fetchBindings(),
          rabbitmq.fetchConsumers(),
          rabbitmq.fetchConnections(),
          chaos.getDlxHistory(50),
        ])

      setNodes(nodesData || [])
      setOverview(overviewData || {})
      setQueues(queuesData || [])
      setExchanges(exchangesData || [])
      setBindings(bindingsData || [])
      setConsumers(consumersData || [])
      setConnections(connsData || [])
      setDlxHistory(dlxData || [])
      setError(null)
      setLoading(false)

      // Update message history (keep last 30 entries)
      setMessageHistory((prev) => {
        const newEntry = {
          time: new Date().toLocaleTimeString(),
          publish: overviewData?.object_totals?.exchanges || 0,
          ack: overviewData?.queue_totals?.messages_ready || 0,
          nack: 0,
        }
        return [...prev, newEntry].slice(-30)
      })
    } catch (err) {
      setError(err.message || 'Failed to fetch data')
      setLoading(false)
    }
  }, 2000)

  // Initial fetch
  useEffect(() => {
    ;(async () => {
      try {
        const [nodesData, overviewData, queuesData, exchangesData, bindingsData, consumersData, connsData, dlxData] =
          await Promise.all([
            rabbitmq.fetchNodes(),
            rabbitmq.fetchOverview(),
            rabbitmq.fetchQueues(),
            rabbitmq.fetchExchanges(),
            rabbitmq.fetchBindings(),
            rabbitmq.fetchConsumers(),
            rabbitmq.fetchConnections(),
            chaos.getDlxHistory(50),
          ])

        setNodes(nodesData || [])
        setOverview(overviewData || {})
        setQueues(queuesData || [])
        setExchanges(exchangesData || [])
        setBindings(bindingsData || [])
        setConsumers(consumersData || [])
        setConnections(connsData || [])
        setDlxHistory(dlxData || [])
        setLoading(false)
      } catch (err) {
        setError(err.message || 'Failed to fetch data')
        setLoading(false)
      }
    })()
  }, [])

  const renderPanel = () => {
    switch (active) {
      case 'overview':
        return <OverviewPanel overview={overview} messageHistory={messageHistory} loading={loading} error={error} />

      case 'queues':
        return <QueueMonitorPanel queues={queues} loading={loading} error={error} />

      case 'exchanges':
        return <ExchangeMapPanel exchanges={exchanges} bindings={bindings} loading={loading} error={error} />

      case 'consumers':
        return <ConsumerStatusPanel consumers={consumers} loading={loading} error={error} />

      case 'connections':
        return <ConnectionMapPanel connections={connections} loading={loading} error={error} />

      case 'dlx':
        return <DLXAuditLogPanel dlxHistory={dlxHistory} loading={loading} error={error} />

      case 'orders':
        return <OrderSenderPanel />

      case 'publisher':
        return <MessagePublisherPanel exchanges={exchanges} />

      case 'chaos':
        return <ChaosControlPanel queues={queues} exchanges={exchanges} />

      default:
        return <OverviewPanel overview={overview} messageHistory={messageHistory} loading={loading} error={error} />
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-3 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">
            <span className="text-orange-500">Shop</span>Flow
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Distributed Order Processing · RabbitMQ Dashboard
          </p>
        </div>
        <div className="flex flex-col items-end text-xs">
          <p className="text-gray-400">Team 9 - Three Musketeers</p>
          <p className="text-gray-600 mt-1">
            {nodes.filter((n) => n.running).length}/{nodes.length} nodes
            <span className="ml-2 inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          </p>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="border-b border-gray-800 px-3 sm:px-6 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
              active === t.id
                ? 'text-orange-400 border-b-2 border-orange-500'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-3 sm:p-6 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
          {/* Show cluster health on all pages */}
          {active !== 'overview' && (
            <ClusterHealthPanel 
              nodes={nodes} 
              loading={loading} 
              error={error}
              isOpen={isClusterHealthOpen}
              onToggle={() => setIsClusterHealthOpen(!isClusterHealthOpen)}
            />
          )}

          {/* Active panel */}
          {renderPanel()}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-3 sm:px-6 py-2 sm:py-3 text-xs text-gray-600 flex flex-col sm:flex-row justify-between gap-1 sm:gap-0">
        <p>Real-time updates every 2 seconds</p>
        <p className="text-center sm:text-right">© 2025 Team 9 - IIITH Distributed Systems Course</p>
      </footer>
    </div>
  )
}
