import {
  ChevronDown,
  ChevronRight,
  Network,
  Server,
  Share2,
  Users,
} from 'lucide-react'

import {
  Badge,
  Card,
  EmptyState,
  ErrorMessage,
  LoadingSpinner,
  Mono,
  SectionTitle,
  StatusDot,
} from '../ui/index'

/** Wraps the loading/error/empty states every panel shares. */
function PanelState({ loading, error, empty, emptyMessage, children }) {
  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error} />
  if (empty) return <EmptyState message={emptyMessage} />
  return children
}

const LEGEND_CLASS =
  'mb-4 p-3 rounded-[var(--radius)] border border-line bg-surface-muted text-xs text-muted space-y-1'

/** RabbitMQ cluster node status and resource usage. */
export function ClusterHealthPanel({ nodes = [], loading, error, isOpen = true, onToggle }) {
  const running = nodes.filter((n) => n.running).length

  return (
    <Card>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-3 text-left hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-brand" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-content">Cluster Health</h2>
            <p className="text-xs text-muted">
              {running} of {nodes.length || 3} nodes running
            </p>
          </div>
        </div>
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-muted" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted" />
        )}
      </button>

      {isOpen && (
        <div className="mt-4">
          <PanelState
            loading={loading && nodes.length === 0}
            error={nodes.length === 0 ? error : null}
            empty={!loading && nodes.length === 0}
            emptyMessage="No cluster nodes reporting"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {nodes.map((node) => (
                <div
                  key={node.name}
                  className="border border-line rounded-[var(--radius)] p-3 bg-surface-muted"
                >
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <StatusDot status={node.running ? 'healthy' : 'offline'} />
                    <Mono className="font-medium text-content truncate">{node.name}</Mono>
                    <Badge
                      status={node.running ? 'healthy' : 'offline'}
                      label={node.running ? 'UP' : 'DOWN'}
                    />
                  </div>
                  <dl className="space-y-1 text-xs">
                    <Row label="Memory" value={formatBytes(node.mem_used)} />
                    <Row label="Disk free" value={formatBytes(node.disk_free)} />
                    <Row label="Uptime" value={formatUptime(node.uptime)} />
                  </dl>
                </div>
              ))}
            </div>
          </PanelState>
        </div>
      )}
    </Card>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-content tabular-nums">{value}</dd>
    </div>
  )
}

/** Every queue, its backlog and its consumers. */
export function QueueMonitorPanel({ queues = [], loading, error }) {
  return (
    <Card>
      <SectionTitle
        icon={Network}
        title="Queue Monitor"
        description="Backlog, in-flight messages and consumer count per queue"
      />
      <div className={LEGEND_CLASS}>
        <p>
          <strong className="text-content">Ready</strong> — messages waiting to be delivered
        </p>
        <p>
          <strong className="text-content">Unacked</strong> — delivered but not yet acknowledged
        </p>
        <p>
          <strong className="text-content">Type</strong> — quorum queues replicate across all three
          nodes
        </p>
      </div>

      <PanelState
        loading={loading && queues.length === 0}
        error={queues.length === 0 ? error : null}
        empty={!loading && queues.length === 0}
        emptyMessage="No queues declared yet"
      >
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="text-left py-2 px-2 font-medium">Queue</th>
                <th className="text-right py-2 px-2 font-medium">Ready</th>
                <th className="text-right py-2 px-2 font-medium hidden sm:table-cell">Unacked</th>
                <th className="text-right py-2 px-2 font-medium">Consumers</th>
                <th className="text-center py-2 px-2 font-medium hidden lg:table-cell">Type</th>
              </tr>
            </thead>
            <tbody>
              {queues.map((q) => (
                <tr key={q.name} className="border-b border-line/60 hover:bg-surface-muted">
                  <td className="py-2 px-2">
                    <Mono className="text-content">{q.name}</Mono>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-content">
                    {q.messages_ready ?? 0}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-warning hidden sm:table-cell">
                    {q.messages_unacknowledged ?? q.messages_unacked ?? 0}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-content">
                    {q.consumers ?? 0}
                  </td>
                  <td className="py-2 px-2 text-center hidden lg:table-cell">
                    {/* The Management API reports the type as `type`, or in
                        `arguments['x-queue-type']` - never as a top-level
                        `x-queue-type`, which is why every queue used to show
                        "classic" when they are all quorum. */}
                    <Badge status="brand" label={queueType(q)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelState>
    </Card>
  )
}

function queueType(queue) {
  return queue?.type || queue?.arguments?.['x-queue-type'] || 'classic'
}

/** Exchanges and what they are bound to. */
export function ExchangeMapPanel({ exchanges = [], bindings = [], loading, error }) {
  const bindingsByExchange = bindings.reduce((acc, binding) => {
    const key = binding.source || 'default'
    ;(acc[key] ||= []).push(binding)
    return acc
  }, {})

  const declared = exchanges.filter((e) => e.name && !e.name.startsWith('amq.'))

  return (
    <Card>
      <SectionTitle
        icon={Share2}
        title="Exchange Map"
        description="How each exchange routes messages to queues"
      />
      <div className={LEGEND_CLASS}>
        <p>
          <strong className="text-content">Direct</strong> — exact routing-key match
        </p>
        <p>
          <strong className="text-content">Fanout</strong> — broadcast to every bound queue
        </p>
        <p>
          <strong className="text-content">Topic</strong> — pattern match with * and #
        </p>
        <p>
          <strong className="text-content">Headers</strong> — match on message headers, not the key
        </p>
      </div>

      <PanelState
        loading={loading && declared.length === 0}
        error={declared.length === 0 ? error : null}
        empty={!loading && declared.length === 0}
        emptyMessage="No exchanges declared yet"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {declared.map((exchange) => {
            const exBindings = bindingsByExchange[exchange.name] || []
            return (
              <div
                key={exchange.name}
                className="border border-line rounded-[var(--radius)] p-3 bg-surface-muted"
              >
                <Mono className="block font-medium text-content truncate">{exchange.name}</Mono>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  <Badge status="brand" label={exchange.type} />
                  <Badge
                    status="offline"
                    label={`${exBindings.length} binding${exBindings.length === 1 ? '' : 's'}`}
                  />
                </div>

                {exBindings.length > 0 ? (
                  <ul className="space-y-1.5 mt-3">
                    {exBindings.map((binding, index) => (
                      <li
                        key={`${binding.destination}-${binding.routing_key}-${index}`}
                        className="bg-surface rounded border border-line p-2"
                      >
                        <Mono className="block text-content truncate">{binding.destination}</Mono>
                        {binding.routing_key && (
                          <p className="text-xs text-muted mt-1">
                            key <Mono className="text-accent">{binding.routing_key}</Mono>
                          </p>
                        )}
                        {binding.arguments && Object.keys(binding.arguments).length > 0 && (
                          <p className="text-xs text-muted mt-1 truncate">
                            <Mono>{JSON.stringify(binding.arguments)}</Mono>
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-subtle mt-3">No bindings</p>
                )}
              </div>
            )
          })}
        </div>
      </PanelState>
    </Card>
  )
}

/** Live consumer subscriptions, plus each container's state from the chaos service. */
export function ConsumerStatusPanel({ consumers = [], status, loading, error }) {
  const containerStates = status?.consumers || {}

  return (
    <Card>
      <SectionTitle
        icon={Users}
        title="Consumer Status"
        description="Active subscriptions and the container behind each one"
      />
      <div className={LEGEND_CLASS}>
        <p>
          <strong className="text-content">Prefetch</strong> — messages delivered before an
          acknowledgement is required; 1 gives true fair dispatch
        </p>
        <p>
          <strong className="text-content">Manual</strong> — the consumer explicitly ACKs, so a
          crash requeues the message
        </p>
      </div>

      {Object.keys(containerStates).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {Object.entries(containerStates).map(([name, state]) => (
            <Badge
              key={name}
              status={
                state === 'consuming' ? 'healthy' : state === 'stopped' ? 'error' : 'warning'
              }
              label={`${name}: ${state}`}
            />
          ))}
        </div>
      )}

      <PanelState
        loading={loading && consumers.length === 0}
        error={consumers.length === 0 ? error : null}
        empty={!loading && consumers.length === 0}
        emptyMessage="No active consumers"
      >
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="text-left py-2 px-2 font-medium">Queue</th>
                <th className="text-left py-2 px-2 font-medium hidden sm:table-cell">
                  Consumer tag
                </th>
                <th className="text-right py-2 px-2 font-medium hidden lg:table-cell">Prefetch</th>
                <th className="text-center py-2 px-2 font-medium">Ack mode</th>
              </tr>
            </thead>
            <tbody>
              {consumers.map((c) => (
                <tr
                  key={c.consumer_tag}
                  className="border-b border-line/60 hover:bg-surface-muted"
                >
                  <td className="py-2 px-2">
                    <Mono className="text-content">{c.queue?.name || 'N/A'}</Mono>
                  </td>
                  <td className="py-2 px-2 hidden sm:table-cell">
                    <Mono className="text-muted">{c.consumer_tag}</Mono>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-content hidden lg:table-cell">
                    {c.prefetch_count}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <Badge
                      status={c.ack_required ? 'healthy' : 'warning'}
                      label={c.ack_required ? 'Manual' : 'Auto'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelState>
    </Card>
  )
}

function formatBytes(bytes) {
  if (!bytes) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${Math.round((bytes / 1024 ** i) * 100) / 100} ${units[i]}`
}

function formatUptime(ms) {
  if (!ms) return '—'
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m`
  return `${seconds}s`
}
