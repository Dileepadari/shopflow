import React, { useState, useEffect } from 'react'
import { Card, Button, LoadingSpinner, Stat, Badge } from '../ui/index'
import * as chaos from '../../api/chaos'
import { useInterval } from '../../hooks/useInterval'
import clsx from 'clsx'

/**
 * ChaosControlPanel — Master control panel for failure injection testing.
 * Demonstrates system resilience under various failure conditions.
 * 
 * Key Concepts:
 * - Stop: Gracefully shutdown (SIGTERM) - consumer can clean up
 * - Kill: Force kill (SIGKILL) - immediate termination
 * - Pause: Freeze process - still consuming but not processing
 * - Purge: Delete all messages in queue
 * - Poison: Inject malformed messages that cause errors
 * - Flood: Send many messages to stress test
 */
export function ChaosControlPanel({ queues = [], exchanges = [] }) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLog, setActionLog] = useState([])
  const [selectedService, setSelectedService] = useState('payment_consumer_1')
  const [selectedQueue, setSelectedQueue] = useState('payment_queue')
  const [delayMs, setDelayMs] = useState(5000)
  const [acting, setActing] = useState(false)
  const [selectedBroker, setSelectedBroker] = useState('rabbit1')

  // Fetch chaos status every 2 seconds
  useInterval(async () => {
    try {
      const s = await chaos.getStatus()
      setStatus(s)
    } catch (err) {
      console.error('Failed to fetch chaos status:', err)
    }
  }, 2000)

  const logAction = (action, result, details) => {
    const entry = {
      timestamp: new Date().toLocaleTimeString(),
      action,
      result,
      details,
    }
    setActionLog((prev) => [entry, ...prev.slice(0, 14)])
  }

  const executeAction = async (fn, actionName, details = '') => {
    try {
      setActing(true)
      const result = await fn()
      logAction(actionName, 'Success', details)
    } catch (err) {
      logAction(actionName, `Error: ${err.message}`, details)
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
  const allServices = [...consumers, ...processors]

  // Consumer metadata for descriptions
  const consumerInfo = {
    payment_consumer: 'Processes payments (2-5s each). Killing affects payment processing.',
    inventory_consumer: 'Reserves inventory (0.5-2s each). Critical for stock management.',
    email_consumer: 'Sends email notifications. Pause to test resilience.',
    sms_consumer: 'Sends SMS notifications. Test message buffering.',
    push_consumer: 'Sends push notifications. Fast operation.',
    log_error_consumer: 'Logs errors to file. Impacts error tracking.',
    log_info_consumer: 'Logs info messages. Less critical.',
    notif_email_consumer: 'Email notifications by pattern. Test topic routing.',
    notif_sms_consumer: 'Urgent SMS notifications. Test selective routing.',
    notif_audit_consumer: 'Audits all notifications. Compliance critical.',
    eu_processor: 'Processes EU region orders. Test region failover.',
    us_processor: 'Processes US region orders. Test region failover.',
    xml_legacy_consumer: 'Handles legacy XML format. Test format compatibility.',
    dead_letter_consumer: 'Captures failed messages. Critical for debugging.',
  }

  const getConsumerDescription = (service) => {
    const prefix = service.split('_').slice(0, -1).join('_')
    return consumerInfo[prefix] || 'Unknown consumer'
  }

  return (
    <div className="space-y-4">
      <Card className="bg-red-950 border-red-800">
        <div className="mb-2">
          <h2 className="text-lg font-bold text-red-300">⚡ Chaos Engineering Control Panel</h2>
          <p className="text-xs text-red-400 mt-1">
            Inject failures to test system resilience. Effects are reversible. Monitor the system's response!
          </p>
        </div>
      </Card>

      {/* CONSUMER CHAOS */}
      <Card>
        <h3 className="text-sm font-semibold text-orange-400 mb-3">🔴 Consumer Controls</h3>
        <p className="text-xs text-gray-400 mb-3">
          Test consumer failures: Stop (graceful), Kill (force), Pause (freeze processing), Resume, or Start
        </p>

        <div className="mb-4">
          <label className="text-xs font-semibold text-gray-300 block mb-2">Select Consumer or Processor</label>
          {allServices.length === 0 ? (
            <p className="text-xs text-gray-500">No services found. Start containers first.</p>
          ) : (
            <>
              <select
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                className="w-full px-2 py-2 bg-gray-800 border border-orange-600 rounded text-sm text-white font-semibold mb-2"
              >
                {allServices.map((svc) => (
                  <option key={svc.name} value={svc.name}>
                    {svc.name} ({svc.state || 'running'})
                  </option>
                ))}
              </select>
              <div className="bg-gray-900 rounded p-2 mb-3 border border-gray-700">
                <p className="text-xs text-gray-300">
                  <strong>Role:</strong> {getConsumerDescription(selectedService)}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  <strong>Impact:</strong> This consumer will be affected by the action below.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <div className="flex flex-col gap-1">
            <div className="text-xs text-gray-500 font-semibold">Graceful Stop</div>
            <Button
              variant="danger"
              onClick={() => executeAction(() => chaos.stopConsumer(selectedService), `Stop ${selectedService}`, 'SIGTERM - allows cleanup')}
              disabled={acting || !selectedService}
              className="text-xs py-2"
            >
              Stop
            </Button>
            <p className="text-xs text-gray-600">SIGTERM: allows cleanup</p>
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-xs text-gray-500 font-semibold">Force Kill</div>
            <Button
              variant="danger"
              onClick={() => executeAction(() => chaos.killConsumer(selectedService), `Kill ${selectedService}`, 'SIGKILL - immediate')}
              disabled={acting || !selectedService}
              className="text-xs py-2"
            >
              Kill (SIGKILL)
            </Button>
            <p className="text-xs text-gray-600">Immediate halt</p>
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-xs text-gray-500 font-semibold">Freeze</div>
            <Button
              variant="warning"
              onClick={() => executeAction(() => chaos.pauseConsumer(selectedService), `Pause ${selectedService}`, 'Process frozen')}
              disabled={acting || !selectedService}
              className="text-xs py-2"
            >
              Pause
            </Button>
            <p className="text-xs text-gray-600">Freeze processing</p>
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-xs text-gray-500 font-semibold">Unfreeze</div>
            <Button
              variant="secondary"
              onClick={() => executeAction(() => chaos.resumeConsumer(selectedService), `Resume ${selectedService}`, 'Process resumed')}
              disabled={acting || !selectedService}
              className="text-xs py-2"
            >
              Resume
            </Button>
            <p className="text-xs text-gray-600">Resume frozen</p>
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-xs text-gray-500 font-semibold">Restart</div>
            <Button
              variant="success"
              onClick={() => executeAction(() => chaos.startConsumer(selectedService), `Start ${selectedService}`, 'Container restarted')}
              disabled={acting || !selectedService}
              className="text-xs py-2"
            >
              Start
            </Button>
            <p className="text-xs text-gray-600">Restart container</p>
          </div>
        </div>

        <div className="mt-4 bg-blue-950 border border-blue-800 rounded p-2">
          <p className="text-xs text-blue-300">
            <strong>Expected Result:</strong> Messages queue up as consumer can't process. If stopped, DLX may capture failed messages after retries exhaust.
          </p>
        </div>
      </Card>

      {/* BROKER CHAOS */}
      <Card>
        <h3 className="text-sm font-semibold text-red-400 mb-3">🔴 Broker Node Controls (RabbitMQ)</h3>
        <p className="text-xs text-gray-400 mb-3">
          Test broker failures. RabbitMQ cluster has 3 nodes (rabbit1, rabbit2, rabbit3). Stopping one tests failover.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['rabbit1', 'rabbit2', 'rabbit3'].map((node) => (
            <div key={node} className="border border-gray-700 rounded p-3 bg-gray-900">
              <div className="mb-3">
                <p className="text-sm font-semibold text-orange-400">{node}</p>
                <p className="text-xs text-gray-500">RabbitMQ Node</p>
              </div>

              <div className="space-y-2">
                <Button
                  variant="danger"
                  onClick={() => executeAction(() => chaos.stopBroker(node), `Stop ${node}`, 'Graceful shutdown')}
                  disabled={acting}
                  className="w-full text-xs py-1"
                >
                  Stop (Graceful)
                </Button>
                <Button
                  variant="danger"
                  onClick={() => executeAction(() => chaos.killBroker(node), `Kill ${node}`, 'Force shutdown')}
                  disabled={acting}
                  className="w-full text-xs py-1"
                >
                  Kill (Force)
                </Button>
                <Button
                  variant="success"
                  onClick={() => executeAction(() => chaos.startBroker(node), `Start ${node}`, 'Node restart')}
                  disabled={acting}
                  className="w-full text-xs py-1"
                >
                  Start
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 bg-blue-950 border border-blue-800 rounded p-2">
          <p className="text-xs text-blue-300">
            <strong>Expected Result:</strong> If 1 node stops, cluster continues (quorum maintained). If 2+ nodes stop, cluster fails. Messages may be lost or delayed.
          </p>
        </div>
      </Card>

      {/* QUEUE CHAOS */}
      <Card>
        <h3 className="text-sm font-semibold text-yellow-400 mb-3">🟡 Queue & Message Controls</h3>
        <p className="text-xs text-gray-400 mb-3">
          Manipulate queue contents: Purge (delete), Poison (inject bad data), or Flood (stress test)
        </p>

        <div className="mb-4">
          <label className="text-xs font-semibold text-gray-300 block mb-2">Select Queue</label>
          <select
            value={selectedQueue}
            onChange={(e) => setSelectedQueue(e.target.value)}
            className="w-full px-2 py-2 bg-gray-800 border border-yellow-600 rounded text-sm text-white font-semibold"
          >
            {queues.map((q) => (
              <option key={q.name} value={q.name}>
                {q.name} ({q.messages_ready} msgs, {q.consumers} consumers)
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Purge */}
          <div className="border border-red-700 rounded p-3 bg-gray-900">
            <p className="text-xs font-semibold text-red-400 mb-2">Purge Queue</p>
            <p className="text-xs text-gray-500 mb-2">Delete ALL messages in queue</p>
            <Button
              variant="danger"
              onClick={() => executeAction(() => chaos.purgeQueue(selectedQueue), `Purge ${selectedQueue}`, `All messages deleted`)}
              disabled={acting}
              className="w-full text-xs"
            >
              Purge Now
            </Button>
            <p className="text-xs text-gray-600 mt-2">⚠️ Destructive - messages lost</p>
          </div>

          {/* Inject Poison - Single */}
          <div className="border border-orange-700 rounded p-3 bg-gray-900">
            <p className="text-xs font-semibold text-orange-400 mb-2">Poison (1 message)</p>
            <p className="text-xs text-gray-500 mb-2">Inject 1 malformed message</p>
            <Button
              variant="warning"
              onClick={() => executeAction(() => chaos.injectPoison(selectedQueue, 1), `Poison ${selectedQueue} (1x)`, `1 poisoned message added`)}
              disabled={acting}
              className="w-full text-xs"
            >
              Inject (1x)
            </Button>
            <p className="text-xs text-gray-600 mt-2">Consumer will error & retry</p>
          </div>

          {/* Inject Poison - Multiple */}
          <div className="border border-orange-700 rounded p-3 bg-gray-900">
            <p className="text-xs font-semibold text-orange-400 mb-2">Poison (5 messages)</p>
            <p className="text-xs text-gray-500 mb-2">Inject 5 malformed messages</p>
            <Button
              variant="warning"
              onClick={() => executeAction(() => chaos.injectPoison(selectedQueue, 5), `Poison ${selectedQueue} (5x)`, `5 poisoned messages added`)}
              disabled={acting}
              className="w-full text-xs"
            >
              Inject (5x)
            </Button>
            <p className="text-xs text-gray-600 mt-2">Test error handling</p>
          </div>

          {/* Flood */}
          <div className="border border-yellow-700 rounded p-3 bg-gray-900">
            <p className="text-xs font-semibold text-yellow-400 mb-2">Flood Exchange</p>
            <p className="text-xs text-gray-500 mb-2">Send 100 messages fast</p>
            <Button
              variant="warning"
              onClick={() => executeAction(() => chaos.floodExchange('order.events', 100), `Flood order.events`, `100 messages sent`)}
              disabled={acting}
              className="w-full text-xs"
            >
              Flood (100 msgs)
            </Button>
            <p className="text-xs text-gray-600 mt-2">Load test the system</p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="bg-yellow-950 border border-yellow-800 rounded p-2">
            <p className="text-xs text-yellow-300">
              <strong>📋 Purge:</strong> Deletes all pending messages. Useful for cleanup.
            </p>
          </div>
          <div className="bg-orange-950 border border-orange-800 rounded p-2">
            <p className="text-xs text-orange-300">
              <strong>☠️ Poison:</strong> Sends bad JSON that causes parsing errors. Consumer errors and messages go to DLX after retries.
            </p>
          </div>
          <div className="bg-blue-950 border border-blue-800 rounded p-2">
            <p className="text-xs text-blue-300">
              <strong>🌊 Flood:</strong> Rapid fire 100 messages to queue. Tests consumer throughput and backpressure.
            </p>
          </div>
        </div>
      </Card>

      {/* GLOBAL CONTROLS */}
      <Card>
        <h3 className="text-sm font-semibold text-green-400 mb-3">🟢 Global Controls</h3>
        <p className="text-xs text-gray-400 mb-3">
          System-wide operations: disconnect all or restore everything
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="border border-red-700 rounded p-3 bg-gray-900">
            <p className="text-xs font-semibold text-red-400 mb-2">Disconnect All</p>
            <p className="text-xs text-gray-500 mb-2">Break all AMQP connections</p>
            <Button
              variant="danger"
              onClick={() => executeAction(() => chaos.dropAllConnections(), `Disconnect all`, `All connections dropped`)}
              disabled={acting}
              className="w-full text-xs"
            >
              Drop All Connections
            </Button>
            <p className="text-xs text-gray-600 mt-2">Severe - tests reconnection logic</p>
          </div>

          <div className="border border-green-700 rounded p-3 bg-gray-900">
            <p className="text-xs font-semibold text-green-400 mb-2">Restore All</p>
            <p className="text-xs text-gray-500 mb-2">Restart all services</p>
            <Button
              variant="success"
              onClick={() => executeAction(() => chaos.restoreAll(), `Restore all services`, `All services restarted`)}
              disabled={acting}
              className="w-full text-xs"
            >
              Restore All
            </Button>
            <p className="text-xs text-gray-600 mt-2">Reset to normal state</p>
          </div>
        </div>
      </Card>

      {/* ACTION LOG */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-2">📋 Action History</h3>
        <p className="text-xs text-gray-500 mb-2">Track all chaos actions executed</p>

        <div className="bg-black rounded p-3 max-h-48 overflow-y-auto space-y-1 border border-gray-800">
          {actionLog.length === 0 ? (
            <p className="text-xs text-gray-600">No actions yet. Start injecting failures!</p>
          ) : (
            actionLog.map((entry, i) => (
              <div key={i} className="text-xs font-mono">
                <span className="text-gray-500">[{entry.timestamp}]</span>
                <span className="text-white ml-2">{entry.action}</span>
                <span className={clsx('ml-2 font-semibold', entry.result.includes('Error') ? 'text-red-400' : 'text-green-400')}>
                  {entry.result}
                </span>
                {entry.details && <span className="text-gray-600 ml-2">({entry.details})</span>}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  )
}

export default ChaosControlPanel
