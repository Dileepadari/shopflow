import React, { useState } from 'react'
import clsx from 'clsx'
import { Globe, FileText, Package, Zap, Megaphone, AlertTriangle, AlertCircle, Info } from 'lucide-react'
import { Card, Button, LoadingSpinner, ErrorMessage, Stat, Badge } from '../ui/index'
import { MessageRateChart } from '../charts/index'

/**
 * DLXAuditLogPanel — Shows dead-lettered messages.
 */
export function DLXAuditLogPanel({ dlxHistory = {}, loading, error }) {
  const [expanded, setExpanded] = useState(null)

  if (loading) return <Card><LoadingSpinner /></Card>
  if (error) return <Card><ErrorMessage message={error} /></Card>

  // Handle both array and object response formats
  const records = Array.isArray(dlxHistory) ? dlxHistory : (dlxHistory.records || [])
  const dlxCount = records.length

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-white mb-2">DLX Audit Log</h2>
        <p className="text-xs text-slate-400">Dead-letter messages that failed processing</p>
      </div>
      
      {/* DLX Legend */}
      <div className="mb-4 p-2 bg-slate-800 rounded border border-slate-700 text-xs text-slate-300 space-y-1">
        <p><span className="text-red-400 font-semibold">Dead Letter:</span> Message rejected after max retries</p>
        <p><span className="text-slate-400">Reason:</span> Why the message was rejected (TTL, rejected, etc)</p>
        <p><span className="text-slate-400">Retries:</span> Number of times processing was attempted</p>
      </div>

      <div className="flex items-center justify-between mb-4">
        <Stat label="Dead Letters" value={dlxCount} description="Total failed messages" />
      </div>

      {records.length === 0 ? (
        <p className="text-slate-500 text-sm">No dead-lettered messages</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {records.map((msg, i) => (
            <div
              key={i}
              className="border border-slate-700 rounded p-2 bg-slate-800 cursor-pointer hover:bg-slate-750 transition flex-1 min-w-64 sm:min-w-96"
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-xs font-semibold text-red-400">
                    {msg.original_queue || 'unknown'} → DLX
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Reason: {msg.death_reason || 'Unknown'}
                  </p>
                </div>
                <span className="text-xs text-slate-500">{msg.retry_count || 0} retries</span>
              </div>

              {expanded === i && msg.body && (
                <pre className="text-xs bg-black rounded mt-2 p-2 overflow-x-auto text-slate-300">
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
 * Each exchange type has its own message format and templates.
 */
export function MessagePublisherPanel({ exchanges = [] }) {
  const [exchange, setExchange] = useState('')
  const [routingKey, setRoutingKey] = useState('')
  const [body, setBody] = useState('{}')
  const [headers, setHeaders] = useState({})
  const [publishing, setPublishing] = useState(false)
  const [message, setMessage] = useState('')

  // Exchange-specific templates and metadata
  const exchangeTemplates = {
    '': {
      name: 'Select an exchange',
      body: '{}',
      routingKeyHint: '',
      responseType: '❓ Unknown',
      description: 'Select an exchange to see templates and routing information',
      samples: []
    },
    'default': {
      name: 'Default Exchange (Work Queues)',
      body: '{"order_id": "ORD-001", "amount": 99.99, "customer_email": "customer@example.com", "items": [{"sku": "SKU-001", "qty": 1}]}',
      routingKeyHint: 'payment_queue or inventory_queue',
      responseType: '✓ Processed by payment/inventory consumers',
      description: 'Routes to specific queues by name. Consumers: payment_consumer, inventory_consumer',
      samples: [
        {
          label: 'Payment Order',
          key: 'payment_queue',
          body: '{"order_id": "PAY-001", "amount": 150.50, "currency": "USD", "customer_email": "buyer@example.com", "items": [{"sku": "PROD-123", "name": "Laptop", "qty": 1, "price": 150.50}]}'
        },
        {
          label: 'Inventory Update',
          key: 'inventory_queue',
          body: '{"order_id": "INV-001", "items": [{"sku": "SKU-001", "qty": 5}, {"sku": "SKU-002", "qty": 3}]}'
        }
      ]
    },
    'order.events': {
      name: 'Fanout: order.events',
      body: '{"order_id": "ORD-FAN-001", "customer_email": "customer@example.com", "customer_phone": "+1-555-0100", "amount": 99.99}',
      routingKeyHint: '(ignored - broadcasts to all)',
      responseType: '✓ Broadcasts to email, sms, push consumers',
      description: 'Broadcasts to all listeners: email_queue, sms_queue, push_queue. Consumers: email_consumer, sms_consumer, push_consumer',
      samples: [
        {
          label: 'Order Notification',
          key: '',
          body: '{"order_id": "ORD-EVT-001", "customer_name": "John Doe", "customer_email": "john@example.com", "customer_phone": "+1-555-0199", "amount": 299.99, "items": [{"sku": "GAMING-PC", "qty": 1, "price": 299.99}], "event": "order.created"}'
        }
      ]
    },
    'logs.error': {
      name: 'Direct: logs.error',
      body: '{"level": "error", "service": "test_publisher", "message": "Test error message", "timestamp": "2025-05-04T10:00:00Z"}',
      routingKeyHint: 'error or warning',
      responseType: '✓ Logged to log_error_queue',
      description: 'Routes errors/warnings to log_error_queue. Consumer: log_error_consumer',
      samples: [
        {
          label: 'Error Log',
          key: 'error',
          body: '{"level": "error", "service": "order_processor", "message": "Failed to process order PAY-123", "order_id": "ORD-123", "error": "Payment gateway timeout"}'
        },
        {
          label: 'Warning Log',
          key: 'warning',
          body: '{"level": "warning", "service": "inventory_service", "message": "Low stock for SKU-001", "sku": "SKU-001", "remaining_qty": 2}'
        }
      ]
    },
    'logs.info': {
      name: 'Direct: logs.info',
      body: '{"level": "info", "service": "test_publisher", "message": "Test info message", "timestamp": "2025-05-04T10:00:00Z"}',
      routingKeyHint: 'info or debug',
      responseType: '✓ Logged to log_info_queue',
      description: 'Routes info/debug messages to log_info_queue. Consumer: log_info_consumer',
      samples: [
        {
          label: 'Info Log',
          key: 'info',
          body: '{"level": "info", "service": "order_producer", "message": "Order published successfully", "order_id": "ORD-456"}'
        },
        {
          label: 'Debug Log',
          key: 'debug',
          body: '{"level": "debug", "service": "payment_service", "message": "Payment validation passed", "order_id": "ORD-789"}'
        }
      ]
    },
    'notifications.topic': {
      name: 'Topic: notifications.topic',
      body: '{"order_id": "ORD-NOTIF-001", "customer_email": "customer@example.com", "customer_phone": "+1-555-0100"}',
      routingKeyHint: 'notification.email.* or notification.sms.urgent',
      responseType: '✓ Routed to notif_email_queue, notif_sms_queue, notif_audit_queue',
      description: 'Pattern-based routing to notification queues. Consumers: notif_email_consumer, notif_sms_consumer, notif_audit_consumer',
      samples: [
        {
          label: 'Email Normal',
          key: 'notification.email.normal',
          body: '{"order_id": "ORD-EMAIL-001", "customer_email": "user@example.com", "subject": "Order Confirmation", "body": "Your order has been confirmed"}'
        },
        {
          label: 'Email Urgent',
          key: 'notification.email.urgent',
          body: '{"order_id": "ORD-EMAIL-URG-001", "customer_email": "vip@example.com", "subject": "URGENT: Order Issue", "body": "Your order needs immediate attention"}'
        },
        {
          label: 'SMS Urgent',
          key: 'notification.sms.urgent',
          body: '{"order_id": "ORD-SMS-URG-001", "customer_phone": "+1-555-0100", "message": "URGENT: Your payment failed. Please update payment method."}'
        }
      ]
    },
    'orders.headers': {
      name: 'Headers: orders.headers',
      body: '{"order_id": "ORD-HDR-001", "amount": 99.99}',
      routingKeyHint: '(ignored - uses headers)',
      responseType: '✓ Routed to eu_queue, us_queue, or xml_legacy_queue',
      description: 'Routes based on region & format headers to eu_queue, us_queue, xml_legacy_queue. Consumers: eu_processor, us_processor, xml_legacy_consumer',
      samples: [
        {
          label: 'EU JSON Order',
          key: '',
          body: '{"order_id": "ORD-EU-001", "customer_email": "customer@example.eu", "amount": 149.99, "items": [{"sku": "EU-PROD-001", "qty": 1}]}',
          headers: { region: 'EU', format: 'json' }
        },
        {
          label: 'US JSON Order',
          key: '',
          body: '{"order_id": "ORD-US-001", "customer_email": "customer@example.com", "amount": 99.99, "items": [{"sku": "US-PROD-001", "qty": 1}]}',
          headers: { region: 'US', format: 'json' }
        },
        // {
        //   label: 'XML Legacy Order',
        //   key: '',
        //   body: '<?xml version="1.0"?><order><id>ORD-XML-001</id><amount>199.99</amount></order>',
        //   headers: { format: 'xml' }
        // }
      ]
    },
    'dead.letter.exchange': {
      name: 'Dead Letter Exchange (NOT For Direct Publishing)',
      body: '{"error": "DLX cannot be triggered directly"}',
      routingKeyHint: 'N/A',
      responseType: 'Passive System - No Direct Publishing',
      description: 'DLX is PASSIVE. Messages only arrive here when they FAIL in other queues after max retries. You cannot publish to it directly.',
      samples: [
        {
          label: 'How to Trigger DLX',
          key: '',
          body: 'To see dead letters:\n1. Publish to another exchange (e.g., payment_queue)\n2. Kill the consumer before it ACKs\n3. Message retries will fail\n4. After max retries, message goes to DLX\n5. Check /app/logs/dead_letters.jsonl'
        }
      ]
    }
  }

  const selectedTemplate = exchangeTemplates[exchange] || exchangeTemplates['']

  const handleExchangeChange = (e) => {
    const newExchange = e.target.value
    setExchange(newExchange)
    setHeaders({})
    const template = exchangeTemplates[newExchange]
    if (template) {
      setBody(template.body)
      setRoutingKey(template.routingKeyHint.split(' ')[0] || '')
    }
  }

  const handleSampleClick = (sample) => {
    setBody(sample.body)
    setRoutingKey(sample.key)
    if (sample.headers) {
      setHeaders(typeof sample.headers === 'string' ? JSON.parse(sample.headers) : sample.headers)
    } else {
      setHeaders({})
    }
  }

  const handlePublish = async () => {
    if (exchange === 'dead.letter.exchange') {
      setMessage('❌ Cannot publish to DLX directly. See description for details.')
      setTimeout(() => setMessage(''), 5000)
      return
    }

    try {
      setPublishing(true)
      const BASE = import.meta.env.VITE_CHAOS_API_URL || 'http://localhost:8080'
      
      // Map 'default' to empty string for AMQP default exchange
      const actualExchange = exchange === 'default' ? '' : exchange
      
      const publishPayload = {
        exchange: actualExchange,
        routing_key: routingKey,
        body: JSON.parse(body),
      }
      
      // Include headers if present (for headers exchange routing)
      if (Object.keys(headers).length > 0) {
        publishPayload.headers = headers
      }
      
      const response = await fetch(`${BASE}/chaos/message/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(publishPayload),
      })
      const result = await response.json()
      setMessage(`✓ Message published! Response: ${selectedTemplate.responseType}`)
      setTimeout(() => setMessage(''), 4000)
    } catch (err) {
      setMessage(`❌ Error: ${err.message}`)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-white">Message Publisher</h2>
        <p className="text-xs text-slate-500 mt-1">Test messages with exchange-specific templates. Each exchange has different message format and visibility.</p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-400 block mb-1">📨 Exchange</label>
          <select
            value={exchange}
            onChange={handleExchangeChange}
            className="w-full px-2 py-2 bg-slate-800 border border-teal-600 rounded text-xs sm:text-sm text-white font-semibold"
          >
            <option value="">Select exchange...</option>
            <optgroup label="Active Exchanges">
              <option value="default">Work Queues</option>
              <option value="order.events">Fanout - order.events</option>
              <option value="logs.error">Direct - logs.error</option>
              <option value="logs.info">Direct - logs.info</option>
              <option value="notifications.topic">Topic - notifications.topic</option>
              <option value="orders.headers">Headers - orders.headers</option>
            </optgroup>
            <optgroup label="System Exchanges">
              <option value="dead.letter.exchange">Dead Letter Exchange (DLX)</option>
            </optgroup>
          </select>
        </div>

        {exchange && (
          <div className="bg-slate-800 border border-slate-700 rounded p-3 mb-3">
            <p className="text-xs text-slate-300 mb-1"><strong>Type:</strong> {selectedTemplate.name}</p>
            <p className="text-xs text-slate-400 mb-2"><strong>Description:</strong> {selectedTemplate.description}</p>
            <div className={clsx('text-xs font-semibold p-2 rounded', 
              selectedTemplate.responseType.includes('✓') ? 'bg-emerald-900 text-emerald-300' :
              selectedTemplate.responseType.includes('Passive') ? 'bg-amber-900 text-amber-300' :
              'bg-slate-800 text-slate-300'
            )}>
              Response: {selectedTemplate.responseType}
            </div>
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-slate-400 block mb-1">Routing Key {selectedTemplate.routingKeyHint && `(e.g., ${selectedTemplate.routingKeyHint})`}</label>
          <input
            type="text"
            value={routingKey}
            onChange={(e) => setRoutingKey(e.target.value)}
            placeholder={selectedTemplate.routingKeyHint || 'Leave empty if not needed'}
            className="w-full px-2 py-2 bg-slate-800 border border-slate-700 rounded text-xs sm:text-sm text-white font-mono"
          />
        </div>

        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-1">
            <label className="text-xs font-semibold text-slate-400">Message Body (JSON)</label>
            {selectedTemplate.samples && selectedTemplate.samples.length > 0 && (
              <div className="text-xs space-y-1 flex flex-wrap gap-1">
                <span className="text-slate-500">Samples:</span>
                {selectedTemplate.samples.map((sample, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSampleClick(sample)}
                    className="px-2 py-1 bg-purple-800 hover:bg-purple-700 rounded text-purple-200 text-xs transition whitespace-nowrap"
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows="5"
            className="w-full px-2 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-xs"
          />
        </div>

        {Object.keys(headers).length > 0 && (
          <div className="bg-slate-800 border border-slate-700 rounded p-2">
            <p className="text-xs font-semibold text-slate-400 mb-2">📋 Headers (Auto-populated)</p>
            <div className="text-xs text-slate-300 font-mono">
              {Object.entries(headers).map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <span className="text-slate-500">{key}:</span>
                  <span className="text-teal-300">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button onClick={handlePublish} disabled={!exchange || exchange === 'dead.letter.exchange' || publishing}>
          {publishing ? 'Publishing...' : `Publish to ${exchange.split('.')[-1] || 'Exchange'}`}
        </Button>

        {message && (
          <div className={clsx('text-xs p-2 rounded', 
            message.includes('Cannot publish') ? 'bg-amber-900 text-amber-200' :
            message.includes('Error') ? 'bg-red-900 text-red-300' : 
            'bg-emerald-900 text-emerald-300'
          )}>
            {message}
          </div>
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
      <div className="mb-4">
        <h2 className="text-lg font-bold text-white mb-2">Connections ({connections.length})</h2>
        <p className="text-xs text-slate-400">Active AMQP connections to the RabbitMQ broker</p>
      </div>
      
      {/* Connection Legend */}
      <div className="mb-4 p-2 bg-slate-800 rounded border border-slate-700 text-xs text-slate-300 space-y-1">
        <p><span className="text-slate-400">Connection:</span> Network link between client and broker</p>
        <p><span className="text-slate-400">Channels:</span> Logical communication channels within a connection</p>
        <p className="text-slate-500 text-xs">Multiple channels allow multiple operations over one connection</p>
      </div>

      <div className="space-y-3">
        {Object.entries(grouped).map(([node, conns]) => (
          <div key={node} className="border border-slate-700 rounded p-2 bg-slate-800">
            <p className="text-xs font-semibold text-teal-400 mb-2">{node}</p>
            <div className="space-y-1">
              {conns.map((conn) => (
                <div key={conn.name} className="text-xs text-slate-400 ml-2">
                  <p>
                    <span className="text-slate-500">Client:</span> {conn.client_properties?.connection_name || conn.name}
                  </p>
                  <p>
                    <span className="text-slate-500">Channels:</span> {conn.channels_count}
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

  const queueStats = overview.queue_totals || {}
  const objectStats = overview.object_totals || {}

  return (
    <Card>
      <h2 className="text-lg font-bold text-white mb-6">System Overview</h2>

      {/* Core Metrics Row */}
      <div className="mb-6">
        <h3 className="text-xs font-semibold text-slate-400 uppercase mb-3 tracking-wider">Core Metrics</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <div className="bg-gradient-to-br from-indigo-900 to-indigo-800 rounded p-3 sm:p-4 border border-indigo-700 relative">
            <Stat 
              label="Consumers" 
              value={objectStats.consumers || 0}
              description="Active message consumers listening to queues"
            />
          </div>
          <div className="bg-gradient-to-br from-emerald-900 to-emerald-800 rounded p-3 sm:p-4 border border-emerald-700 relative">
            <Stat 
              label="Messages Ready" 
              value={queueStats.messages_ready || 0}
              description="Messages waiting in queues for consumer pickup"
            />
          </div>
          <div className="bg-gradient-to-br from-teal-900 to-teal-800 rounded p-3 sm:p-4 border border-teal-700 relative">
            <Stat 
              label="Total Messages" 
              value={queueStats.messages || 0}
              description="All messages: ready + unacknowledged"
            />
          </div>
          <div className="bg-gradient-to-br from-amber-900 to-amber-800 rounded p-3 sm:p-4 border border-amber-700 relative">
            <Stat 
              label="Unacknowledged" 
              value={queueStats.messages_unacknowledged || 0}
              description="Messages being processed by consumers"
            />
          </div>
        </div>
      </div>

      {/* Infrastructure Row */}
      <div className="mb-6">
        <h3 className="text-xs font-semibold text-slate-400 uppercase mb-3 tracking-wider">Infrastructure</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <div className="bg-gradient-to-br from-red-900 to-red-800 rounded p-3 sm:p-4 border border-red-700 relative">
            <Stat 
              label="Channels" 
              value={objectStats.channels || 0}
              description="AMQP channels for communication"
            />
          </div>
          <div className="bg-gradient-to-br from-orange-900 to-orange-800 rounded p-3 sm:p-4 border border-orange-700 relative">
            <Stat 
              label="Connections" 
              value={objectStats.connections || 0}
              description="Active AMQP connections to broker"
            />
          </div>
          <div className="bg-gradient-to-br from-violet-900 to-violet-800 rounded p-3 sm:p-4 border border-violet-700 relative">
            <Stat 
              label="Exchanges" 
              value={objectStats.exchanges || 0}
              description="Message routing entities (direct, fanout, topic)"
            />
          </div>
          <div className="bg-gradient-to-br from-rose-900 to-rose-800 rounded p-3 sm:p-4 border border-rose-700 relative">
            <Stat 
              label="Queues" 
              value={objectStats.queues || 0}
              description="Message storage entities"
            />
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-3">Message Rate (30s window)</h3>
        <MessageRateChart data={messageHistory} />
      </div>
    </Card>
  )
}

/**
 * OrderSenderPanel — Form to send actual orders to the producer API.
 */
export function OrderSenderPanel() {
  const [orderCount, setOrderCount] = useState(1)
  const [region, setRegion] = useState('US')
  const [format, setFormat] = useState('json')
  const [customerId, setCustomerId] = useState('CUST-001')
  const [amount, setAmount] = useState('99.99')
  const [items, setItems] = useState('[{"product_id": "SKU-001", "quantity": 1, "price": 99.99}]')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [successCount, setSuccessCount] = useState(0)

  const validateOrderData = () => {
    // Validate order count
    if (orderCount < 1 || orderCount > 100) {
      return 'Order count must be between 1 and 100'
    }

    // Validate customer ID
    if (!customerId || customerId.trim().length === 0) {
      return 'Customer ID is required'
    }
    if (customerId.length > 100) {
      return 'Customer ID must be less than 100 characters'
    }

    // Validate amount
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum)) {
      return 'Amount must be a valid number'
    }
    if (amountNum <= 0) {
      return 'Amount must be greater than 0'
    }
    if (amountNum > 1000000) {
      return 'Amount must be less than 1,000,000'
    }

    // Validate items JSON
    let itemsArray
    try {
      itemsArray = JSON.parse(items)
    } catch (e) {
      return `Invalid items JSON: ${e.message}`
    }

    // Validate items is an array
    if (!Array.isArray(itemsArray)) {
      return 'Items must be a JSON array'
    }

    // Validate items array is not empty
    if (itemsArray.length === 0) {
      return 'Items array cannot be empty'
    }

    // Validate each item
    for (let i = 0; i < itemsArray.length; i++) {
      const item = itemsArray[i]

      // Check item is an object
      if (typeof item !== 'object' || item === null) {
        return `Item ${i} must be an object`
      }

      // Check required fields
      if (!item.product_id) {
        return `Item ${i} missing required field: product_id`
      }
      if (item.quantity === undefined) {
        return `Item ${i} missing required field: quantity`
      }
      if (item.price === undefined) {
        return `Item ${i} missing required field: price`
      }

      // Validate product_id
      if (typeof item.product_id !== 'string' || item.product_id.length === 0) {
        return `Item ${i}: product_id must be a non-empty string`
      }

      // Validate quantity
      const qty = parseInt(item.quantity)
      if (isNaN(qty) || qty <= 0) {
        return `Item ${i}: quantity must be a positive integer`
      }

      // Validate price
      const price = parseFloat(item.price)
      if (isNaN(price) || price <= 0) {
        return `Item ${i}: price must be a positive number`
      }
      if (price > 100000) {
        return `Item ${i}: price must be less than 100,000`
      }
    }

    return null // No errors
  }

  const handleSendOrder = async () => {
    try {
      // Validate all inputs
      const validationError = validateOrderData()
      if (validationError) {
        setMessage(`Validation Error: ${validationError}`)
        return
      }

      setSending(true)
      const PRODUCER = 'http://localhost:8090'

      // Parse items JSON (validated above)
      const itemsArray = JSON.parse(items)

      let sent = 0
      const errors = []

      for (let i = 0; i < orderCount; i++) {
        const orderPayload = {
          region: region,
          format: format,
          amount: parseFloat(amount),
          currency: 'USD',
        }

        try {
          const response = await fetch(`${PRODUCER}/orders/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderPayload),
          })

          if (response.ok) {
            sent++
          } else {
            errors.push(`Order ${i + 1}: HTTP ${response.status}`)
          }
        } catch (err) {
          errors.push(`Order ${i + 1}: ${err.message}`)
          console.error('Order send error:', err)
        }
      }

      setSuccessCount(sent)
      if (errors.length === 0) {
        setMessage(`✓ Successfully sent ${sent}/${orderCount} order(s) to ${region} region as ${format.toUpperCase()}`)
      } else {
        setMessage(
          `⚠ Sent ${sent}/${orderCount} orders. Errors: ${errors.slice(0, 3).join(', ')}${
            errors.length > 3 ? `... and ${errors.length - 3} more` : ''
          }`
        )
      }
      setTimeout(() => setMessage(''), 5000)
    } catch (err) {
      setMessage(`Error: ${err.message}`)
      console.error('SendOrder error:', err)
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Package className="w-5 h-5 text-teal-500" />
          Send Orders
        </h2>
        <p className="text-xs text-slate-400 mt-1">Publish orders to the messaging system</p>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1 flex items-center gap-1">
              <Globe className="w-4 h-4 text-teal-500" />
              Region
            </label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-full px-2 py-2 bg-slate-800 border border-teal-600 rounded text-xs sm:text-sm text-white font-semibold">
              <option value="US">US Region</option>
              <option value="EU">EU Region</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1 flex items-center gap-1">
              <FileText className="w-4 h-4 text-teal-500" />
              Format
            </label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="w-full px-2 py-2 bg-slate-800 border border-teal-600 rounded text-xs sm:text-sm text-white font-semibold"
            >
              <option value="json">JSON</option>
              <option value="xml">XML Legacy</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1">Number of Orders</label>
            <input
              type="number"
              min="1"
              max="100"
              value={orderCount}
              onChange={(e) => setOrderCount(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-2 py-2 bg-slate-800 border border-slate-700 rounded text-xs sm:text-sm text-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1">Amount (USD)</label>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="99.99"
              className="w-full px-2 py-2 bg-slate-800 border border-slate-700 rounded text-xs sm:text-sm text-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1">Customer ID</label>
            <input
              type="text"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="CUST-001"
              className="w-full px-2 py-2 bg-slate-800 border border-slate-700 rounded text-xs sm:text-sm text-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1">
              <Badge variant="warning">Quick Template</Badge>
            </label>
            <select
              onChange={(e) => {
                if (e.target.value === 'eu') {
                  setRegion('EU')
                  setFormat('json')
                  setCustomerId('CUST-EU-001')
                  setAmount('149.99')
                } else if (e.target.value === 'us') {
                  setRegion('US')
                  setFormat('json')
                  setCustomerId('CUST-US-001')
                  setAmount('99.99')
                } else if (e.target.value === 'xml') {
                  setRegion('US')
                  setFormat('xml')
                  setCustomerId('CUST-XML-001')
                  setAmount('199.99')
                }
              }}
              defaultValue=""
              className="w-full px-2 py-2 bg-slate-800 border border-slate-700 rounded text-xs sm:text-sm text-white"
            >
              <option value="">Select template...</option>
              <option value="us">US (JSON)</option>
              <option value="eu">EU (JSON)</option>
              <option value="xml">XML Legacy</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-400 block mb-1">Items (JSON)</label>
          <textarea
            value={items}
            onChange={(e) => setItems(e.target.value)}
            rows="3"
            className="w-full px-2 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-xs"
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleSendOrder}
            disabled={sending}
            variant={successCount > 0 ? 'success' : 'primary'}
          >
            {sending ? 'Sending...' : `Send ${orderCount} Order${orderCount !== 1 ? 's' : ''}`}
          </Button>

          {successCount > 0 && (
            <Badge variant="success">{successCount} sent</Badge>
          )}
        </div>

        {message && (
          <p className={clsx('text-xs', message.includes('Error') ? 'text-red-400' : 'text-emerald-400')}>
            {message}
          </p>
        )}
      </div>
    </Card>
  )
}
