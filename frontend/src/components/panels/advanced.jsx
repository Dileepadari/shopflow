import React, { useState } from 'react'
import { Card, Button, LoadingSpinner, ErrorMessage, Stat } from '../ui/index'
import { MessageRateChart } from '../charts/index'

/**
 * DLXAuditLogPanel — Shows dead-lettered messages.
 */
export function DLXAuditLogPanel({ dlxHistory = [], loading, error }) {
  const [expanded, setExpanded] = useState(null)

  if (loading) return <Card><LoadingSpinner /></Card>
  if (error) return <Card><ErrorMessage message={error} /></Card>

  const dlxCount = dlxHistory.length

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">DLX Audit Log</h2>
        <Stat label="Dead Letters" value={dlxCount} />
      </div>

      {dlxHistory.length === 0 ? (
        <p className="text-gray-500 text-sm">No dead-lettered messages</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {dlxHistory.map((msg, i) => (
            <div
              key={i}
              className="border border-gray-700 rounded p-2 bg-gray-800 cursor-pointer hover:bg-gray-750 transition"
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-xs font-semibold text-red-400">
                    {msg.original_queue || 'unknown'} → DLX
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Reason: {msg.death_reason || 'Unknown'}
                  </p>
                </div>
                <span className="text-xs text-gray-500">{msg.retry_count || 0} retries</span>
              </div>

              {expanded === i && msg.body && (
                <pre className="text-xs bg-black rounded mt-2 p-2 overflow-x-auto text-gray-300">
                  {typeof msg.body === 'string' ? msg.body : JSON.stringify(msg.body, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/**
 * MessagePublisherPanel — Form to publish test messages to exchanges.
 */
export function MessagePublisherPanel({ exchanges = [] }) {
  const [exchange, setExchange] = useState('')
  const [routingKey, setRoutingKey] = useState('')
  const [body, setBody] = useState('{"order_id": 1, "amount": 99.99}')
  const [publishing, setPublishing] = useState(false)
  const [message, setMessage] = useState('')

  const handlePublish = async () => {
    try {
      setPublishing(true)
      const BASE = import.meta.env.VITE_CHAOS_API_URL || 'http://localhost:8080'
      const response = await fetch(`${BASE}/chaos/message/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exchange,
          routing_key: routingKey,
          body: JSON.parse(body),
        }),
      })
      const result = await response.json()
      setMessage('Message published!')
      setTimeout(() => setMessage(''), 3000)
    } catch (err) {
      setMessage(`Error: ${err.message}`)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-bold text-white mb-4">Message Publisher</h2>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-gray-400 block mb-1">Exchange</label>
          <select
            value={exchange}
            onChange={(e) => setExchange(e.target.value)}
            className="w-full px-2 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white"
          >
            <option value="">Select exchange</option>
            {exchanges
              .filter(e => !e.name.startsWith('amq.'))
              .map((ex) => (
                <option key={ex.name} value={ex.name}>
                  {ex.name} ({ex.type})
                </option>
              ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-400 block mb-1">Routing Key (optional)</label>
          <input
            type="text"
            value={routingKey}
            onChange={(e) => setRoutingKey(e.target.value)}
            placeholder="e.g., notification.email.urgent"
            className="w-full px-2 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-400 block mb-1">Message Body (JSON)</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows="4"
            className="w-full px-2 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white font-mono"
          />
        </div>

        <Button onClick={handlePublish} disabled={!exchange || publishing}>
          {publishing ? 'Publishing...' : 'Publish Message'}
        </Button>

        {message && (
          <p className={clsx('text-xs', message.includes('Error') ? 'text-red-400' : 'text-green-400')}>
            {message}
          </p>
        )}
      </div>
    </Card>
  )
}

/**
 * ConnectionMapPanel — Shows all active AMQP connections.
 */
export function ConnectionMapPanel({ connections = [], loading, error }) {
  if (loading) return <Card><LoadingSpinner /></Card>
  if (error) return <Card><ErrorMessage message={error} /></Card>

  const grouped = {}
  connections.forEach((conn) => {
    const node = conn.node || 'unknown'
    if (!grouped[node]) grouped[node] = []
    grouped[node].push(conn)
  })

  return (
    <Card>
      <h2 className="text-lg font-bold text-white mb-4">Connections ({connections.length})</h2>
      <div className="space-y-3">
        {Object.entries(grouped).map(([node, conns]) => (
          <div key={node} className="border border-gray-700 rounded p-2 bg-gray-800">
            <p className="text-xs font-semibold text-orange-400 mb-2">{node}</p>
            <div className="space-y-1">
              {conns.map((conn) => (
                <div key={conn.name} className="text-xs text-gray-400 ml-2">
                  <p>
                    <span className="text-gray-500">Client:</span> {conn.client_properties?.connection_name || conn.name}
                  </p>
                  <p>
                    <span className="text-gray-500">Channels:</span> {conn.channels_count}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

/**
 * OverviewPanel — Dashboard summary with key metrics and message rate chart.
 */
export function OverviewPanel({ overview = {}, messageHistory = [], loading, error }) {
  if (loading) return <Card><LoadingSpinner /></Card>
  if (error) return <Card><ErrorMessage message={error} /></Card>

  return (
    <Card>
      <h2 className="text-lg font-bold text-white mb-4">System Overview</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label="Messages Ready" value={overview.queue_totals?.messages_ready || 0} />
        <Stat label="Consumers" value={overview.queue_totals?.consumers || 0} />
        <Stat label="Channels" value={overview.object_totals?.channels || 0} />
        <Stat label="Connections" value={overview.object_totals?.connections || 0} />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-3">Message Rate (30s window)</h3>
        <MessageRateChart data={messageHistory} />
      </div>
    </Card>
  )
}

import clsx from 'clsx'
