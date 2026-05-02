import React from 'react'
import { Card, Stat, StatusDot, Badge } from '../ui/index'

/**
 * ClusterHealthPanel — Shows RabbitMQ cluster node status and metrics.
 */
export function ClusterHealthPanel({ nodes = [], loading, error }) {
  if (loading) return <Card><p className="text-gray-500">Loading cluster health...</p></Card>
  if (error) return <Card><p className="text-red-400">Error: {error}</p></Card>

  return (
    <Card>
      <h2 className="text-lg font-bold text-white mb-4">Cluster Health</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {nodes.map((node) => (
          <div key={node.name} className="border border-gray-700 rounded p-3 bg-gray-800">
            <div className="flex items-center gap-2 mb-2">
              <StatusDot status={node.running ? 'healthy' : 'offline'} />
              <span className="text-sm font-semibold text-white">{node.name}</span>
              <Badge status={node.running ? 'healthy' : 'offline'} label={node.running ? 'UP' : 'DOWN'} />
            </div>
            <div className="space-y-1 text-xs">
              <p><span className="text-gray-400">Memory:</span> <span className="text-gray-300">{formatBytes(node.mem_used)}</span></p>
              <p><span className="text-gray-400">Disk:</span> <span className="text-gray-300">{formatBytes(node.disk_free)}</span></p>
              <p><span className="text-gray-400">Uptime:</span> <span className="text-gray-300">{formatUptime(node.uptime)}</span></p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

/**
 * QueueMonitorPanel — Shows all queues with message counts and consumer counts.
 */
export function QueueMonitorPanel({ queues = [], loading, error }) {
  if (loading) return <Card><p className="text-gray-500">Loading queues...</p></Card>
  if (error) return <Card><p className="text-red-400">Error: {error}</p></Card>

  return (
    <Card>
      <h2 className="text-lg font-bold text-white mb-4">Queue Monitor</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-2 px-2 text-gray-400 font-semibold">Queue Name</th>
              <th className="text-right py-2 px-2 text-gray-400 font-semibold">Messages</th>
              <th className="text-right py-2 px-2 text-gray-400 font-semibold">Consumers</th>
              <th className="text-right py-2 px-2 text-gray-400 font-semibold">Unacked</th>
              <th className="text-center py-2 px-2 text-gray-400 font-semibold">Type</th>
            </tr>
          </thead>
          <tbody>
            {queues.map((q) => (
              <tr key={q.name} className="border-b border-gray-800 hover:bg-gray-800 transition">
                <td className="py-3 px-2 text-white font-mono text-xs">{q.name}</td>
                <td className="py-3 px-2 text-right text-orange-400 font-semibold">{q.messages_ready}</td>
                <td className="py-3 px-2 text-right text-green-400">{q.consumers}</td>
                <td className="py-3 px-2 text-right text-yellow-400">{q.messages_unacked || 0}</td>
                <td className="py-3 px-2 text-center">
                  <Badge status="info" label={q['x-queue-type'] || 'classic'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/**
 * ExchangeMapPanel — Shows all exchanges and their bindings.
 */
export function ExchangeMapPanel({ exchanges = [], loading, error }) {
  if (loading) return <Card><p className="text-gray-500">Loading exchanges...</p></Card>
  if (error) return <Card><p className="text-red-400">Error: {error}</p></Card>

  return (
    <Card>
      <h2 className="text-lg font-bold text-white mb-4">Exchange Map</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {exchanges.filter(e => !e.name.startsWith('amq.')).map((ex) => (
          <div key={ex.name} className="border border-gray-700 rounded p-3 bg-gray-800">
            <div className="mb-2">
              <p className="text-sm font-semibold text-white">{ex.name}</p>
              <Badge status="info" label={ex.type} />
            </div>
            <p className="text-xs text-gray-400">Bindings: {ex.bindings_count || 0}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

/**
 * ConsumerStatusPanel — Shows active consumers and their channels.
 */
export function ConsumerStatusPanel({ consumers = [], loading, error }) {
  if (loading) return <Card><p className="text-gray-500">Loading consumers...</p></Card>
  if (error) return <Card><p className="text-red-400">Error: {error}</p></Card>

  return (
    <Card>
      <h2 className="text-lg font-bold text-white mb-4">Consumer Status</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-2 px-2 text-gray-400 font-semibold">Queue</th>
              <th className="text-left py-2 px-2 text-gray-400 font-semibold">Consumer Tag</th>
              <th className="text-right py-2 px-2 text-gray-400 font-semibold">Prefetch</th>
              <th className="text-center py-2 px-2 text-gray-400 font-semibold">Ack Mode</th>
            </tr>
          </thead>
          <tbody>
            {consumers.map((c) => (
              <tr key={c.consumer_tag} className="border-b border-gray-800 hover:bg-gray-800">
                <td className="py-3 px-2 text-white font-mono text-xs">{c.queue?.name || 'N/A'}</td>
                <td className="py-3 px-2 text-gray-300 text-xs truncate max-w-xs">{c.consumer_tag}</td>
                <td className="py-3 px-2 text-right text-orange-400">{c.prefetch_count}</td>
                <td className="py-3 px-2 text-center">
                  <Badge status="success" label={c.ack_required ? 'Manual' : 'Auto'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// Helper functions
function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d`
  if (hours > 0) return `${hours}h`
  if (minutes > 0) return `${minutes}m`
  return `${seconds}s`
}
