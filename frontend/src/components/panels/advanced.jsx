import { useState } from 'react'
import clsx from 'clsx'
import {
  Activity,
  Inbox,
  Link2,
  Package,
  Send,
  Skull,
} from 'lucide-react'

import { publishBatch, publishMessage, publishOrder } from '../../api/chaos'
import { MessageRateChart, QueueDepthChart } from '../charts/index'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  LoadingSpinner,
  Mono,
  SectionTitle,
  Stat,
} from '../ui/index'

const FIELD_LABEL = 'block text-xs font-medium text-muted mb-1'
const FIELD_INPUT =
  'w-full px-2.5 py-2 bg-surface-muted border border-line rounded-[var(--radius)] text-sm text-content focus:border-brand outline-none'

/** Inline result banner for form actions. */
function ResultMessage({ result }) {
  if (!result) return null
  return (
    <p
      className={clsx(
        'text-xs p-2 rounded-[var(--radius)] border',
        result.ok
          ? 'bg-success-soft text-success border-success/30'
          : 'bg-danger-soft text-danger border-danger/30'
      )}
      role={result.ok ? 'status' : 'alert'}
    >
      {result.text}
    </p>
  )
}

/* ========================================================================== */
/* DLX audit                                                                  */
/* ========================================================================== */

export function DLXAuditLogPanel({ dlxHistory = [], loading, error }) {
  const [expanded, setExpanded] = useState(null)
  const records = Array.isArray(dlxHistory) ? dlxHistory : dlxHistory?.records || []

  if (loading && records.length === 0) {
    return (
      <Card>
        <LoadingSpinner />
      </Card>
    )
  }
  if (error && records.length === 0) {
    return (
      <Card>
        <ErrorMessage message={error} />
      </Card>
    )
  }

  const byQueue = records.reduce((acc, r) => {
    acc[r.original_queue] = (acc[r.original_queue] || 0) + 1
    return acc
  }, {})

  return (
    <Card>
      <SectionTitle
        icon={Skull}
        title="Dead Letter Audit"
        description="Messages that exhausted their retries or expired, kept for review"
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <Stat label="Dead letters" value={records.length} emphasis={records.length > 0} />
        <Stat label="Source queues" value={Object.keys(byQueue).length} />
      </div>

      {records.length === 0 ? (
        <EmptyState message="No dead-lettered messages — everything is being processed successfully." />
      ) : (
        <ul className="space-y-2">
          {records.map((record, index) => {
            // The DLX consumer writes the payload as `message_body`.
            const body = record.message_body
            const isOpen = expanded === index
            return (
              <li
                key={`${record.received_at}-${index}`}
                className="border border-line rounded-[var(--radius)] bg-surface-muted"
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : index)}
                  aria-expanded={isOpen}
                  className="w-full text-left p-3 hover:bg-surface transition-colors rounded-[var(--radius)]"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <Mono className="text-content">
                        {record.original_queue || 'unknown'} → dead_letter_queue
                      </Mono>
                      <p className="text-xs text-muted mt-1">
                        {record.received_at
                          ? new Date(record.received_at).toLocaleString()
                          : 'time unknown'}
                      </p>
                      {record.correlation_id && (
                        <p className="text-xs text-muted mt-0.5">
                          order <Mono className="text-brand">{record.correlation_id}</Mono>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        status={record.death_reason === 'expired' ? 'warning' : 'error'}
                        label={record.death_reason || 'unknown'}
                      />
                      <Badge status="offline" label={`${record.retry_count ?? 0} retries`} />
                    </div>
                  </div>
                </button>
                {isOpen && body != null && (
                  <pre className="text-xs bg-surface border-t border-line p-3 overflow-x-auto scrollbar-thin text-muted font-mono">
                    {typeof body === 'string' ? body : JSON.stringify(body, null, 2)}
                  </pre>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

/* ========================================================================== */
/* Message publisher                                                          */
/* ========================================================================== */

const EXCHANGE_TEMPLATES = {
  default: {
    name: 'Default exchange — work queues',
    description:
      'Routes by queue name. Consumed by payment_consumer and inventory_consumer, prefetch 1.',
    routingKeyHint: 'payment_queue',
    outcome: 'Processed by the payment and inventory workers',
    samples: [
      {
        label: 'Payment order',
        key: 'payment_queue',
        body: {
          order_id: 'PAY-001',
          amount: 150.5,
          currency: 'USD',
          customer_email: 'buyer@example.com',
          items: [{ sku: 'PROD-123', name: 'Laptop', qty: 1, price: 150.5 }],
        },
      },
      {
        label: 'Inventory reservation',
        key: 'inventory_queue',
        body: {
          order_id: 'INV-001',
          items: [
            { sku: 'SKU-001', qty: 5, price: 10 },
            { sku: 'SKU-002', qty: 3, price: 20 },
          ],
        },
      },
    ],
  },
  'order.events': {
    name: 'Fanout — order.events',
    description: 'Broadcasts to email_queue, sms_queue and push_queue. The routing key is ignored.',
    routingKeyHint: '',
    outcome: 'Delivered to all three notification consumers',
    samples: [
      {
        label: 'Order created',
        key: '',
        body: {
          order_id: 'ORD-EVT-001',
          customer_name: 'John Doe',
          customer_email: 'john@example.com',
          customer_phone: '+1-555-0199',
          amount: 299.99,
          event: 'order.created',
        },
      },
    ],
  },
  'logs.error': {
    name: 'Direct — logs.error',
    description: 'Routing keys "error" and "warning" both reach log_error_queue.',
    routingKeyHint: 'error',
    outcome: 'Persisted to error_logs.jsonl on the shared volume',
    samples: [
      {
        label: 'Error',
        key: 'error',
        body: {
          level: 'error',
          service: 'order_processor',
          message: 'Payment gateway timeout',
          order_id: 'ORD-123',
        },
      },
      {
        label: 'Warning',
        key: 'warning',
        body: {
          level: 'warning',
          service: 'inventory_service',
          message: 'Low stock for SKU-001',
          remaining_qty: 2,
        },
      },
    ],
  },
  'logs.info': {
    name: 'Direct — logs.info',
    description: 'Routing keys "info" and "debug" both reach log_info_queue.',
    routingKeyHint: 'info',
    outcome: 'Printed by log_info_consumer',
    samples: [
      {
        label: 'Info',
        key: 'info',
        body: { level: 'info', service: 'order_producer', message: 'Order published' },
      },
      {
        label: 'Debug',
        key: 'debug',
        body: { level: 'debug', service: 'payment_service', message: 'Validation passed' },
      },
    ],
  },
  'notifications.topic': {
    name: 'Topic — notifications.topic',
    description:
      'notification.email.* reaches the email handler, notification.sms.urgent the SMS handler, and # the audit log.',
    routingKeyHint: 'notification.email.normal',
    outcome: 'Routed by pattern; the audit consumer sees everything',
    samples: [
      {
        label: 'Email (normal)',
        key: 'notification.email.normal',
        body: { order_id: 'ORD-EMAIL-001', customer_email: 'user@example.com', subject: 'Confirmed' },
      },
      {
        label: 'Email (urgent)',
        key: 'notification.email.urgent',
        body: { order_id: 'ORD-EMAIL-002', customer_email: 'vip@example.com', subject: 'Action needed' },
      },
      {
        label: 'SMS (urgent)',
        key: 'notification.sms.urgent',
        body: { order_id: 'ORD-SMS-001', customer_phone: '+1-555-0100', message: 'Payment failed' },
      },
      {
        label: 'SMS (normal) — audit only',
        key: 'notification.sms.normal',
        body: { order_id: 'ORD-SMS-002', customer_phone: '+1-555-0101', message: 'Shipped' },
      },
    ],
  },
  'orders.headers': {
    name: 'Headers — orders.headers',
    description:
      'Routes on the region and format headers, not the routing key. region=EU/US with format=json, or format=xml for the legacy queue.',
    routingKeyHint: '',
    outcome: 'Routed to eu_queue, us_queue or xml_legacy_queue',
    samples: [
      {
        label: 'EU JSON',
        key: '',
        body: { order_id: 'ORD-EU-001', customer_email: 'customer@example.eu', amount: 149.99 },
        headers: { region: 'EU', format: 'json' },
      },
      {
        label: 'US JSON',
        key: '',
        body: { order_id: 'ORD-US-001', customer_email: 'customer@example.com', amount: 99.99 },
        headers: { region: 'US', format: 'json' },
      },
      {
        label: 'XML legacy',
        key: '',
        body: { order_id: 'ORD-XML-001', amount: 199.99, legacy: true },
        headers: { format: 'xml' },
      },
    ],
  },
}

const PUBLISHABLE = Object.keys(EXCHANGE_TEMPLATES)

export function MessagePublisherPanel() {
  const [exchange, setExchange] = useState('')
  const [routingKey, setRoutingKey] = useState('')
  const [body, setBody] = useState('{}')
  const [headers, setHeaders] = useState({})
  const [publishing, setPublishing] = useState(false)
  const [result, setResult] = useState(null)

  const template = EXCHANGE_TEMPLATES[exchange]

  const selectExchange = (value) => {
    setExchange(value)
    setResult(null)
    setHeaders({})
    const next = EXCHANGE_TEMPLATES[value]
    if (next) {
      const first = next.samples[0]
      setBody(JSON.stringify(first.body, null, 2))
      // Use the sample's real key. The old code sliced the human-readable hint
      // and ended up setting keys like "(ignored".
      setRoutingKey(first.key || '')
      setHeaders(first.headers || {})
    } else {
      setBody('{}')
      setRoutingKey('')
    }
  }

  const applySample = (sample) => {
    setBody(JSON.stringify(sample.body, null, 2))
    setRoutingKey(sample.key || '')
    setHeaders(sample.headers || {})
    setResult(null)
  }

  const handlePublish = async () => {
    let parsed
    try {
      parsed = JSON.parse(body)
    } catch (err) {
      setResult({ ok: false, text: `Message body is not valid JSON: ${err.message}` })
      return
    }

    setPublishing(true)
    setResult(null)
    try {
      await publishMessage({
        exchange,
        routing_key: routingKey,
        body: parsed,
        headers,
      })
      setResult({ ok: true, text: `Published. ${template.outcome}.` })
    } catch (err) {
      // apiPost throws on a non-2xx, so a rejected publish can no longer be
      // reported as a success.
      setResult({ ok: false, text: err.message })
    } finally {
      setPublishing(false)
    }
  }

  return (
    <Card>
      <SectionTitle
        icon={Send}
        title="Message Publisher"
        description="Publish directly to any exchange to watch how it routes"
      />

      <div className="space-y-3">
        <div>
          <label className={FIELD_LABEL} htmlFor="publisher-exchange">
            Exchange
          </label>
          <select
            id="publisher-exchange"
            value={exchange}
            onChange={(e) => selectExchange(e.target.value)}
            className={FIELD_INPUT}
          >
            <option value="">Select an exchange…</option>
            {PUBLISHABLE.map((name) => (
              <option key={name} value={name}>
                {EXCHANGE_TEMPLATES[name].name}
              </option>
            ))}
          </select>
        </div>

        {template && (
          <div className="rounded-[var(--radius)] border border-line bg-surface-muted p-3">
            <p className="text-xs text-muted">{template.description}</p>
            <p className="text-xs text-brand mt-2 font-medium">Expected: {template.outcome}</p>
          </div>
        )}

        {template && (
          <div>
            <span className={FIELD_LABEL}>Samples</span>
            <div className="flex flex-wrap gap-1.5">
              {template.samples.map((sample) => (
                <Button key={sample.label} variant="secondary" onClick={() => applySample(sample)}>
                  {sample.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className={FIELD_LABEL} htmlFor="publisher-key">
            Routing key
          </label>
          <input
            id="publisher-key"
            type="text"
            value={routingKey}
            onChange={(e) => setRoutingKey(e.target.value)}
            placeholder={template?.routingKeyHint || 'Not used by this exchange'}
            className={clsx(FIELD_INPUT, 'font-mono')}
          />
        </div>

        <div>
          <label className={FIELD_LABEL} htmlFor="publisher-body">
            Message body (JSON)
          </label>
          <textarea
            id="publisher-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className={clsx(FIELD_INPUT, 'font-mono text-xs')}
          />
        </div>

        {Object.keys(headers).length > 0 && (
          <div className="rounded-[var(--radius)] border border-line bg-surface-muted p-3">
            <p className="text-xs font-medium text-muted mb-1.5">Headers</p>
            <dl className="space-y-0.5">
              {Object.entries(headers).map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <dt className="text-xs text-muted">
                    <Mono>{key}</Mono>
                  </dt>
                  <dd className="text-xs text-brand">
                    <Mono>{String(value)}</Mono>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <Button onClick={handlePublish} disabled={!exchange || publishing}>
          {publishing ? 'Publishing…' : `Publish to ${exchange || 'exchange'}`}
        </Button>

        <ResultMessage result={result} />
      </div>
    </Card>
  )
}

/* ========================================================================== */
/* Connections                                                                */
/* ========================================================================== */

export function ConnectionMapPanel({ connections = [], loading, error }) {
  if (loading && connections.length === 0) {
    return (
      <Card>
        <LoadingSpinner />
      </Card>
    )
  }
  if (error && connections.length === 0) {
    return (
      <Card>
        <ErrorMessage message={error} />
      </Card>
    )
  }

  const byNode = connections.reduce((acc, conn) => {
    const node = conn.node || 'unknown'
    ;(acc[node] ||= []).push(conn)
    return acc
  }, {})

  return (
    <Card>
      <SectionTitle
        icon={Link2}
        title={`Connections (${connections.length})`}
        description="Live AMQP connections, grouped by the cluster node serving them"
      />

      {connections.length === 0 ? (
        <EmptyState message="No active connections" />
      ) : (
        <div className="space-y-3">
          {Object.entries(byNode).map(([node, conns]) => (
            <div key={node} className="border border-line rounded-[var(--radius)] bg-surface-muted p-3">
              <div className="flex items-center justify-between mb-2">
                <Mono className="text-brand font-medium">{node}</Mono>
                <Badge status="offline" label={`${conns.length} connection${conns.length === 1 ? '' : 's'}`} />
              </div>
              <ul className="space-y-1.5">
                {conns.map((conn) => (
                  <li key={conn.name} className="flex justify-between gap-2 text-xs">
                    <Mono className="text-muted truncate">
                      {conn.client_properties?.connection_name || conn.name}
                    </Mono>
                    <span className="text-muted shrink-0 tabular-nums">
                      {conn.channels_count ?? 0} ch
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/* ========================================================================== */
/* Overview                                                                   */
/* ========================================================================== */

export function OverviewPanel({ overview = {}, queues = [], messageHistory = [], loading, error }) {
  if (loading && !overview.object_totals) {
    return (
      <Card>
        <LoadingSpinner />
      </Card>
    )
  }
  if (error && !overview.object_totals) {
    return (
      <Card>
        <ErrorMessage message={error} />
      </Card>
    )
  }

  const queueTotals = overview.queue_totals || {}
  const objectTotals = overview.object_totals || {}
  const unacked = queueTotals.messages_unacknowledged || 0

  const depths = [...queues]
    .filter((q) => (q.messages ?? 0) > 0)
    .sort((a, b) => (b.messages ?? 0) - (a.messages ?? 0))
    .slice(0, 12)
    .map((q) => ({ name: q.name, messages: q.messages ?? 0 }))

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <SectionTitle
          icon={Activity}
          title="System Overview"
          description="Live totals across the whole cluster"
        />

        {/* One uniform tile treatment. The previous eight-gradient rainbow
            encoded nothing - Channels was red and Queues was rose. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <Stat
            label="Messages ready"
            value={queueTotals.messages_ready || 0}
            description="Waiting in queues for a consumer"
            emphasis
          />
          <Stat
            label="Unacknowledged"
            value={unacked}
            description="Delivered but not yet ACKed — in flight right now"
          />
          <Stat
            label="Total messages"
            value={queueTotals.messages || 0}
            description="Ready plus unacknowledged"
          />
          <Stat
            label="Consumers"
            value={objectTotals.consumers || 0}
            description="Active subscriptions across all queues"
          />
          <Stat label="Queues" value={objectTotals.queues || 0} description="Declared queues" />
          <Stat
            label="Exchanges"
            value={objectTotals.exchanges || 0}
            description="Includes the built-in amq.* exchanges"
          />
          <Stat
            label="Connections"
            value={objectTotals.connections || 0}
            description="Open AMQP connections"
          />
          <Stat
            label="Channels"
            value={objectTotals.channels || 0}
            description="Logical channels multiplexed over those connections"
          />
        </div>
      </Card>

      <Card>
        <SectionTitle
          icon={Activity}
          title="Throughput"
          description="Broker publish, deliver and acknowledge rates, sampled every 2 seconds"
        />
        <MessageRateChart data={messageHistory} />
      </Card>

      <Card>
        <SectionTitle
          icon={Inbox}
          title="Queue Depth"
          description="Queues currently holding messages, deepest first"
        />
        <QueueDepthChart data={depths} />
      </Card>
    </div>
  )
}

/* ========================================================================== */
/* Order sender                                                               */
/* ========================================================================== */

const DEFAULT_ITEMS = JSON.stringify(
  [{ sku: 'SKU-001', name: 'Sample Product', qty: 1, price: 99.99 }],
  null,
  2
)

const ORDER_TEMPLATES = {
  us: { region: 'US', format: 'json', customer: 'US Customer', amount: '99.99' },
  eu: { region: 'EU', format: 'json', customer: 'EU Customer', amount: '149.99' },
  xml: { region: 'US', format: 'xml', customer: 'Legacy Customer', amount: '199.99' },
}

const MAX_ORDERS = 100

export function OrderSenderPanel() {
  const [orderCount, setOrderCount] = useState(1)
  const [region, setRegion] = useState('US')
  const [format, setFormat] = useState('json')
  const [customerName, setCustomerName] = useState('Test Customer')
  const [amount, setAmount] = useState('99.99')
  const [items, setItems] = useState(DEFAULT_ITEMS)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  const validate = () => {
    if (!Number.isInteger(orderCount) || orderCount < 1 || orderCount > MAX_ORDERS) {
      return `Order count must be between 1 and ${MAX_ORDERS}`
    }
    if (!customerName.trim()) return 'Customer name is required'
    if (customerName.length > 100) return 'Customer name must be under 100 characters'

    const amountNum = Number.parseFloat(amount)
    if (Number.isNaN(amountNum)) return 'Amount must be a number'
    if (amountNum <= 0) return 'Amount must be greater than 0'
    if (amountNum > 1_000_000) return 'Amount must be less than 1,000,000'

    let parsed
    try {
      parsed = JSON.parse(items)
    } catch (err) {
      return `Items is not valid JSON: ${err.message}`
    }
    if (!Array.isArray(parsed) || parsed.length === 0) return 'Items must be a non-empty array'

    for (const [index, item] of parsed.entries()) {
      if (typeof item !== 'object' || item === null) return `Item ${index + 1} must be an object`
      if (!item.sku) return `Item ${index + 1} is missing "sku"`
      if (!(Number.parseInt(item.qty, 10) > 0)) return `Item ${index + 1}: qty must be positive`
      if (!(Number.parseFloat(item.price) >= 0)) return `Item ${index + 1}: price must be a number`
    }
    return null
  }

  const handleSend = async () => {
    const problem = validate()
    if (problem) {
      setResult({ ok: false, text: problem })
      return
    }

    setSending(true)
    setResult(null)
    // Every field the form validates is actually sent - customer_name and items
    // used to be validated and then dropped from the payload.
    const payload = {
      region,
      format,
      amount: Number.parseFloat(amount),
      currency: 'USD',
      customer_name: customerName.trim(),
      items: JSON.parse(items),
    }

    try {
      if (orderCount === 1) {
        const response = await publishOrder(payload)
        setResult({ ok: true, text: `Order ${response.order_id} published to the ${region} region.` })
      } else {
        // One request, one broker connection, instead of N round trips.
        const response = await publishBatch({ ...payload, count: orderCount })
        setResult({
          ok: true,
          text: `Published ${response.count} orders to the ${region} region as ${format.toUpperCase()}.`,
        })
      }
    } catch (err) {
      setResult({ ok: false, text: err.message })
    } finally {
      setSending(false)
    }
  }

  const applyTemplate = (key) => {
    const preset = ORDER_TEMPLATES[key]
    if (!preset) return
    setRegion(preset.region)
    setFormat(preset.format)
    setCustomerName(preset.customer)
    setAmount(preset.amount)
  }

  return (
    <Card>
      <SectionTitle
        icon={Package}
        title="Send Orders"
        description="Publish real orders through all five exchange types"
      />

      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className={FIELD_LABEL} htmlFor="order-region">
              Region
            </label>
            <select
              id="order-region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className={FIELD_INPUT}
            >
              <option value="US">US</option>
              <option value="EU">EU</option>
            </select>
          </div>

          <div>
            <label className={FIELD_LABEL} htmlFor="order-format">
              Format
            </label>
            <select
              id="order-format"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className={FIELD_INPUT}
            >
              <option value="json">JSON</option>
              <option value="xml">XML (legacy)</option>
            </select>
          </div>

          <div>
            <label className={FIELD_LABEL} htmlFor="order-template">
              Quick template
            </label>
            <select
              id="order-template"
              defaultValue=""
              onChange={(e) => applyTemplate(e.target.value)}
              className={FIELD_INPUT}
            >
              <option value="">Select…</option>
              <option value="us">US (JSON)</option>
              <option value="eu">EU (JSON)</option>
              <option value="xml">XML legacy</option>
            </select>
          </div>

          <div>
            <label className={FIELD_LABEL} htmlFor="order-count">
              Number of orders
            </label>
            <input
              id="order-count"
              type="number"
              min="1"
              max={MAX_ORDERS}
              value={orderCount}
              onChange={(e) =>
                setOrderCount(Math.min(MAX_ORDERS, Math.max(1, Number.parseInt(e.target.value, 10) || 1)))
              }
              className={FIELD_INPUT}
            />
          </div>

          <div>
            <label className={FIELD_LABEL} htmlFor="order-amount">
              Amount (USD)
            </label>
            <input
              id="order-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={FIELD_INPUT}
            />
          </div>

          <div>
            <label className={FIELD_LABEL} htmlFor="order-customer">
              Customer name
            </label>
            <input
              id="order-customer"
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className={FIELD_INPUT}
            />
          </div>
        </div>

        <div>
          <label className={FIELD_LABEL} htmlFor="order-items">
            Items (JSON array of sku, name, qty, price)
          </label>
          <textarea
            id="order-items"
            value={items}
            onChange={(e) => setItems(e.target.value)}
            rows={5}
            className={clsx(FIELD_INPUT, 'font-mono text-xs')}
          />
        </div>

        <Button onClick={handleSend} disabled={sending}>
          {sending
            ? 'Sending…'
            : `Send ${orderCount} order${orderCount === 1 ? '' : 's'}`}
        </Button>

        <ResultMessage result={result} />
      </div>
    </Card>
  )
}
