import React, { useState, useEffect } from 'react'
import { Card, Button, LoadingSpinner, Stat, Badge } from '../ui/index'
import * as chaos from '../../api/chaos'
import { useInterval } from '../../hooks/useInterval'

/**
 * ChaosControlPanel — Master control panel for all chaos actions.
 * Allows operators to stop, kill, pause, and restart services on demand.
 */
export function ChaosControlPanel({ queues = [], exchanges = [] }) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLog, setActionLog] = useState([])
  const [selectedService, setSelectedService] = useState('payment_consumer_1')
  const [selectedQueue, setSelectedQueue] = useState('payment_queue')
  const [delayMs, setDelayMs] = useState(5000)
  const [acting, setActing] = useState(false)

  // Fetch chaos status every 2 seconds
  useInterval(async () => {
    try {
      const s = await chaos.getStatus()
      setStatus(s)
    } catch (err) {
      console.error('Failed to fetch chaos status:', err)
    }
  }, 2000)

  const logAction = (action, result) => {
    const entry = {
      timestamp: new Date().toLocaleTimeString(),
      action,
      result,
    }
    setActionLog((prev) => [entry, ...prev.slice(0, 9)])
  }

  const executeAction = async (fn, actionName) => {
    try {
      setActing(true)
      const result = await fn()
      logAction(actionName, 'Success')
    } catch (err) {
      logAction(actionName, `Error: ${err.message}`)
    } finally {
      setActing(false)
    }
  }

  const getServicesByType = (type) => {
    if (!status?.services) return []
    return Object.entries(status.services)
      .filter(([name]) => name.includes(type))
      .map(([name, info]) => ({ name, ...info }))
  }

  const consumers = getServicesByType('consumer')
  const processors = getServicesByType('processor')

  return (
    <Card className="space-y-6">
      <div className="border-b border-gray-700 pb-4">
        <h2 className="text-lg font-bold text-white mb-2">⚡ Chaos Control Panel</h2>
        <p className="text-xs text-gray-400">
          Inject failures to observe system resilience. All actions can be reverted.
        </p>
      </div>

      {/* Section: Consumer Controls */}
      <div>
        <h3 className="text-sm font-semibold text-orange-400 mb-3">Consumer Controls</h3>
        <div className="mb-3">
          <label className="text-xs font-semibold text-gray-400 block mb-1">Select Consumer</label>
          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className="w-full px-2 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white"
          >
            {[...consumers, ...processors].map((svc) => (
              <option key={svc.name} value={svc.name}>
                {svc.name} — {svc.state || 'unknown'}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Button
            variant="danger"
            onClick={() => executeAction(() => chaos.stopConsumer(selectedService), `Stop ${selectedService}`)}
            disabled={acting}
            className="text-xs"
          >
            Stop
          </Button>
          <Button
            variant="danger"
            onClick={() => executeAction(() => chaos.killConsumer(selectedService), `Kill ${selectedService}`)}
            disabled={acting}
            className="text-xs"
          >
            Kill (SIGKILL)
          </Button>
          <Button
            variant="warning"
            onClick={() => executeAction(() => chaos.pauseConsumer(selectedService), `Pause ${selectedService}`)}
            disabled={acting}
            className="text-xs"
          >
            Pause
          </Button>
          <Button
            variant="secondary"
            onClick={() => executeAction(() => chaos.resumeConsumer(selectedService), `Resume ${selectedService}`)}
            disabled={acting}
            className="text-xs"
          >
            Resume
          </Button>
          <Button
            variant="success"
            onClick={() => executeAction(() => chaos.startConsumer(selectedService), `Start ${selectedService}`)}
            disabled={acting}
            className="text-xs"
          >
            Start
          </Button>
        </div>
      </div>

      {/* Section: Broker Controls */}
      <div className="border-t border-gray-700 pt-4">
        <h3 className="text-sm font-semibold text-red-400 mb-3">Broker Controls</h3>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {['rabbit1', 'rabbit2', 'rabbit3'].map((node) => (
            <div key={node} className="flex flex-col gap-1">
              <Button
                variant="danger"
                onClick={() => executeAction(() => chaos.stopBroker(node), `Stop ${node}`)}
                disabled={acting}
                className="text-xs py-1"
              >
                Stop
              </Button>
              <Button
                variant="danger"
                onClick={() => executeAction(() => chaos.killBroker(node), `Kill ${node}`)}
                disabled={acting}
                className="text-xs py-1"
              >
                Kill
              </Button>
              <Button
                variant="success"
                onClick={() => executeAction(() => chaos.startBroker(node), `Start ${node}`)}
                disabled={acting}
                className="text-xs py-1"
              >
                Start
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Section: Queue Controls */}
      <div className="border-t border-gray-700 pt-4">
        <h3 className="text-sm font-semibold text-yellow-400 mb-3">Queue Controls</h3>
        <div className="mb-3">
          <label className="text-xs font-semibold text-gray-400 block mb-1">Select Queue</label>
          <select
            value={selectedQueue}
            onChange={(e) => setSelectedQueue(e.target.value)}
            className="w-full px-2 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white"
          >
            {queues.map((q) => (
              <option key={q.name} value={q.name}>
                {q.name} ({q.messages_ready} messages)
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          <Button
            variant="danger"
            onClick={() => executeAction(() => chaos.purgeQueue(selectedQueue), `Purge ${selectedQueue}`)}
            disabled={acting}
            className="text-xs"
          >
            Purge Queue
          </Button>
          <Button
            variant="warning"
            onClick={() => executeAction(() => chaos.injectPoison(selectedQueue, 1), `Poison ${selectedQueue}`)}
            disabled={acting}
            className="text-xs"
          >
            Inject Poison (1x)
          </Button>
          <Button
            variant="warning"
            onClick={() => executeAction(() => chaos.injectPoison(selectedQueue, 5), `Poison ${selectedQueue}`)}
            disabled={acting}
            className="text-xs"
          >
            Inject Poison (5x)
          </Button>
          <Button
            variant="warning"
            onClick={() => executeAction(() => chaos.floodExchange('order.events', 100), 'Flood order.events')}
            disabled={acting}
            className="text-xs"
          >
            Flood (100 msgs)
          </Button>
        </div>
      </div>

      {/* Section: Consumer Delay */}
      {/* NOTE: Delay feature not yet implemented. To add:
          1. Implement /chaos/consumer/delay endpoint in backend
          2. Use 'tc' (traffic control) or similar for network delay simulation
          3. Uncomment this section when ready
      */}

      {/* Section: Global Controls */}
      <div className="border-t border-gray-700 pt-4">
        <h3 className="text-sm font-semibold text-green-400 mb-3">Global Controls</h3>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="danger"
            onClick={() => executeAction(() => chaos.dropAllConnections(), 'Drop all connections')}
            disabled={acting}
            className="text-xs"
          >
            Disconnect All
          </Button>
          <Button
            variant="success"
            onClick={() => executeAction(() => chaos.restoreAll(), 'Restore all services')}
            disabled={acting}
            className="text-xs"
          >
            Restore All
          </Button>
        </div>
      </div>

      {/* Action Log */}
      <div className="border-t border-gray-700 pt-4">
        <h3 className="text-sm font-semibold text-white mb-2">Action Log</h3>
        <div className="bg-black rounded p-2 max-h-40 overflow-y-auto space-y-1">
          {actionLog.length === 0 ? (
            <p className="text-xs text-gray-500">No actions yet</p>
          ) : (
            actionLog.map((entry, i) => (
              <div key={i} className="text-xs font-mono">
                <span className="text-gray-500">[{entry.timestamp}]</span>
                <span className="text-orange-400 ml-2">{entry.action}</span>
                <span
                  className={clsx('ml-2', entry.result.includes('Error') ? 'text-red-400' : 'text-green-400')}
                >
                  {entry.result}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  )
}

import clsx from 'clsx'
