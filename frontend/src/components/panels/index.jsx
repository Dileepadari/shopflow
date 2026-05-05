import React from 'react'
import { ChevronDown, ChevronRight, Server, AlertCircle, Info } from 'lucide-react'
import { Card, Stat, StatusDot, Badge } from '../ui/index'

/**
 * ClusterHealthPanel - Shows RabbitMQ cluster node status and metrics.
 */
export function ClusterHealthPanel({ nodes = [], loading, error, isOpen = true, onToggle }) {
  if (loading) return <Card><p className="text-gray-500">Loading cluster health...</p></Card>
  if (error) return <Card><p className="text-red-400">Error: {error}</p></Card>

  return (
    <Card>
      <div className="mb-4">
        <div className="flex items-center justify-between cursor-pointer hover:opacity-80 transition" onClick={onToggle}>
          <div className="flex-1 flex items-center gap-3">
            <Server className="w-5 h-5 text-teal-500" />
            <div>
              <h2 className="text-lg font-bold text-white mb-1">Cluster Health</h2>
              <p className="text-xs text-gray-400">RabbitMQ cluster node status and resource usage</p>
            </div>
          </div>
          {isOpen ? <ChevronDown className="w-5 h-5 text-teal-500" /> : <ChevronRight className="w-5 h-5 text-teal-500" />}
        </div>
      </div>
      
      {isOpen && (
        <>
          {/* Node Health Legend */}
          <div className="mb-4 p-3 bg-slate-800 rounded border border-slate-700 text-xs text-gray-300 space-y-1">
            <p><span className="inline-block w-2 h-2 bg-emerald-500 rounded-full align-middle mr-2"></span> <span className="text-emerald-400">UP</span> = Node is running</p>
            <p><span className="inline-block w-2 h-2 bg-slate-500 rounded-full align-middle mr-2"></span> <span className="text-slate-400">DOWN</span> = Node is offline</p>
            <p><span className="text-gray-400">Memory:</span> RAM used by the node</p>
            <p><span className="text-gray-400">Disk:</span> Available disk space</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
            {nodes.map((node) => (
              <div key={node.name} className="border border-slate-700 rounded p-2 sm:p-3 bg-slate-800 hover:border-teal-600 transition">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
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
        </>
      )}
    </Card>
  )
}

/**
 * QueueMonitorPanel - Shows all queues with message counts and consumer counts.
 */
export function QueueMonitorPanel({ queues = [], loading, error }) {
  if (loading) return <Card><p className="text-gray-500">Loading queues...</p></Card>
  if (error) return <Card><p className="text-red-400">Error: {error}</p></Card>

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-white mb-2">Queue Monitor</h2>
        <p className="text-xs text-gray-400">View all message queues and their status</p>
      </div>
      
      {/* Legend */}
      <div className="mb-4 p-3 bg-slate-800 rounded border border-slate-700 text-xs text-gray-300 space-y-1">
        <p><span className="text-teal-400">Messages</span> = Ready messages waiting for pickup</p>
        <p><span className="text-emerald-400">Cons</span> = Active consumers listening to queue</p>
        <p><span className="text-amber-400">Unacked</span> = Messages being processed</p>
        <p><span className="text-indigo-300">Type</span> = Queue type (classic or quorum)</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-2 px-1 sm:px-2 text-gray-400 font-semibold">Queue Name</th>
              <th className="text-right py-2 px-1 sm:px-2 text-teal-400 font-semibold hidden sm:table-cell">Messages</th>
              <th className="text-right py-2 px-1 sm:px-2 text-emerald-400 font-semibold">Cons</th>
              <th className="text-right py-2 px-1 sm:px-2 text-amber-400 font-semibold hidden lg:table-cell">Unacked</th>
              <th className="text-center py-2 px-1 sm:px-2 text-indigo-400 font-semibold">Type</th>
            </tr>
          </thead>
          <tbody>
            {queues.map((q) => (
              <tr key={q.name} className="border-b border-slate-800 hover:bg-slate-800 transition">
                <td className="py-2 sm:py-3 px-1 sm:px-2 text-white font-mono text-xs truncate">{q.name}</td>
                <td className="py-2 sm:py-3 px-1 sm:px-2 text-right text-teal-400 font-semibold hidden sm:table-cell">{q.messages_ready}</td>
                <td className="py-2 sm:py-3 px-1 sm:px-2 text-right text-emerald-400">{q.consumers}</td>
                <td className="py-2 sm:py-3 px-1 sm:px-2 text-right text-amber-400 hidden lg:table-cell">{q.messages_unacked || 0}</td>
                <td className="py-2 sm:py-3 px-1 sm:px-2 text-center">
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
 * ExchangeMapPanel - Shows all exchanges and their bindings.
 */
export function ExchangeMapPanel({ exchanges = [], bindings = [], loading, error }) {
  if (loading) return <Card><p className="text-gray-500">Loading exchanges...</p></Card>
  if (error) return <Card><p className="text-red-400">Error: {error}</p></Card>

  // Group bindings by exchange
  const bindingsByExchange = {}
  bindings.forEach((binding) => {
    const exchangeName = binding.source || 'default'
    if (!bindingsByExchange[exchangeName]) {
      bindingsByExchange[exchangeName] = []
    }
    bindingsByExchange[exchangeName].push(binding)
  })

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-white mb-2">Exchange Map</h2>
        <p className="text-xs text-gray-400">Message routing endpoints that connect to queues</p>
      </div>
      
      {/* Exchange Types Legend */}
      <div className="mb-4 p-2 bg-gray-800 rounded border border-gray-700 text-xs text-gray-300 space-y-1">
        <p><span className="font-semibold">Direct:</span> Routes by exact routing key match</p>
        <p><span className="font-semibold">Fanout:</span> Broadcasts to all connected queues</p>
        <p><span className="font-semibold">Topic:</span> Routes by pattern matching (wildcards)</p>
        <p><span className="font-semibold">Headers:</span> Routes by message header matching</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
        {exchanges.filter(e => !e.name.startsWith('amq.')).map((ex) => {
          const exBindings = bindingsByExchange[ex.name] || []
          return (
            <div key={ex.name} className="border border-gray-700 rounded p-2 sm:p-3 bg-gray-800">
              <div className="mb-3">
                <p className="text-sm font-semibold text-white truncate">{ex.name}</p>
                <div className="flex gap-2 mt-1">
                  <Badge status="info" label={ex.type} />
                  <Badge status="warning" label={`${exBindings.length} binding${exBindings.length !== 1 ? 's' : ''}`} />
                </div>
              </div>
              
              {exBindings.length > 0 ? (
                <div className="space-y-2">
                  {exBindings.map((binding, idx) => (
                    <div key={idx} className="bg-gray-900 rounded p-1 sm:p-2 text-xs border border-gray-600">
                      <p className="text-gray-300">
                        <span className="text-cyan-400 font-mono truncate block">{binding.destination}</span>
                      </p>
                      {binding.routing_key && (
                        <p className="text-gray-500 mt-1">
                          Key: <span className="text-yellow-400 font-mono">{binding.routing_key}</span>
                        </p>
                      )}
                      {binding.arguments && Object.keys(binding.arguments).length > 0 && (
                        <p className="text-gray-500 mt-1 truncate">
                          Args: <span className="text-purple-400 text-xs">{JSON.stringify(binding.arguments).slice(0, 35)}</span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500 italic">No bindings</p>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/**
 * ConsumerStatusPanel - Shows active consumers and their channels.
 */
export function ConsumerStatusPanel({ consumers = [], loading, error }) {
  if (loading) return <Card><p className="text-gray-500">Loading consumers...</p></Card>
  if (error) return <Card><p className="text-red-400">Error: {error}</p></Card>

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-white mb-2">Consumer Status</h2>
        <p className="text-xs text-gray-400">Active message consumers and their configuration</p>
      </div>
      
      {/* Consumer Legend */}
      <div className="mb-4 p-2 bg-gray-800 rounded border border-gray-700 text-xs text-gray-300 space-y-1">
        <p><span className="text-gray-400">Queue:</span> Which queue the consumer is listening to</p>
        <p><span className="text-gray-400">Prefetch:</span> Max messages to fetch at once before ACK</p>
        <p><span className="text-green-400">Mode:</span> <span className="text-gray-300">Manual = explicit ACK required, Auto = auto-acknowledge</span></p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-2 px-1 sm:px-2 text-gray-400 font-semibold">Queue</th>
              <th className="text-left py-2 px-1 sm:px-2 text-gray-400 font-semibold hidden sm:table-cell">Consumer Tag</th>
              <th className="text-right py-2 px-1 sm:px-2 text-gray-400 font-semibold hidden lg:table-cell">Prefetch</th>
              <th className="text-center py-2 px-1 sm:px-2 text-gray-400 font-semibold">Mode</th>
            </tr>
          </thead>
          <tbody>
            {consumers.map((c) => (
              <tr key={c.consumer_tag} className="border-b border-gray-800 hover:bg-gray-800">
                <td className="py-2 sm:py-3 px-1 sm:px-2 text-white font-mono text-xs truncate">{c.queue?.name || 'N/A'}</td>
                <td className="py-2 sm:py-3 px-1 sm:px-2 text-gray-300 text-xs truncate hidden sm:table-cell">{c.consumer_tag}</td>
                <td className="py-2 sm:py-3 px-1 sm:px-2 text-right text-orange-400 hidden lg:table-cell">{c.prefetch_count}</td>
                <td className="py-2 sm:py-3 px-1 sm:px-2 text-center">
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
