import React, { useState } from 'react'
import clsx from 'clsx'
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
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">DLX Audit Log</h2>
        <Stat label="Dead Letters" value={dlxCount} />
      </div>

      {records.length === 0 ? (
        <p className="text-gray-500 text-sm">No dead-lettered messages</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {records.map((msg, i) => (
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
 * Each exchange type has its own message format and templates.
 */
export function MessagePublisherPanel({ exchanges = [] }) {
  const [exchange, setExchange] = useState('')
  const [routingKey, setRoutingKey] = useState('')
  const [body, setBody] = useState('{}')
  const [publishing, setPublishing] = useState(false)
  const [message, setMessage] = useState('')

  // Exchange-specific templates and metadata
  const exchangeTemplates = {
    '': {
      name: 'Select an exchange',
      body: '{}',
      routingKeyHint: '',
      responseType: '❓ Unknown',
      description: 'Select an exchange to see templates',
      samples: []
    },
    'default': {
      name: 'Default Exchange (Work Queues)',
      body: '{"order_id": "ORD-001", "amount": 99.99, "customer_email": "customer@example.com", "items": [{"sku": "SKU-001", "qty": 1}]}',
      routingKeyHint: 'payment_queue or inventory_queue',
      responseType: '✓ Visible - Logs in console',
      description: 'Work queue for payment & inventory processing',
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
      responseType: '✓ Visible - Email, SMS, Push logs',
      description: 'Broadcasts order events to all listeners (email, SMS, push)',
      samples: [
        {
          label: 'New Order Event',
          key: '',
          body: '{"order_id": "ORD-NEW-001", "customer_name": "John Doe", "customer_email": "john@example.com", "customer_phone": "+1-555-0199", "amount": 299.99, "items": [{"sku": "GAMING-PC", "qty": 1, "price": 299.99}], "event": "order.created"}'
        }
      ]
    },
    'logs.direct': {
      name: 'Direct: logs.direct',
      body: '{"level": "error", "service": "test_publisher", "message": "Test error message", "timestamp": "2025-05-04T10:00:00Z"}',
      routingKeyHint: 'error, warning, info, or debug',
      responseType: 'Check /app/logs/error_logs.jsonl',
      description: 'Routes logs by severity. Writes to files, not visible on dashboard.',
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
        },
        {
          label: 'Info Log',
          key: 'info',
          body: '{"level": "info", "service": "order_producer", "message": "Order published successfully", "order_id": "ORD-456"}'
        }
      ]
    },
    'notifications.topic': {
      name: 'Topic: notifications.topic',
      body: '{"order_id": "ORD-NOTIF-001", "customer_email": "customer@example.com", "customer_phone": "+1-555-0100", "notification_type": "email"}',
      routingKeyHint: 'notification.email.* or notification.sms.urgent',
      responseType: 'Check /app/logs/notification_audit.jsonl',
      description: 'Pattern-based routing. Notifications sent but not visible on UI.',
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
      name: 'Headers: orders.headers (Region Routing)',
      body: '{"order_id": "ORD-HDR-001", "amount": 99.99}',
      routingKeyHint: '(ignored - uses headers)',
      responseType: 'Region-specific processing',
      description: 'Routes based on message headers (region, format). EU/US processors handle silently.',
      samples: [
        {
          label: 'EU JSON Order',
          key: '',
          body: '{"order_id": "ORD-EU-001", "customer_email": "customer@example.eu", "amount": 149.99, "items": [{"sku": "EU-PROD-001", "qty": 1}]}',
          headers: '{"region": "EU", "format": "json"}'
        },
        {
          label: 'US JSON Order',
          key: '',
          body: '{"order_id": "ORD-US-001", "customer_email": "customer@example.com", "amount": 99.99, "items": [{"sku": "US-PROD-001", "qty": 1}]}',
          headers: '{"region": "US", "format": "json"}'
        },
        {
          label: 'XML Legacy Order',
          key: '',
          body: '<?xml version="1.0"?><order><id>ORD-XML-001</id><amount>199.99</amount></order>',
          headers: '{"format": "xml"}'
        }
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
    const template = exchangeTemplates[newExchange]
    if (template) {
      setBody(template.body)
      setRoutingKey(template.routingKeyHint.split(' ')[0] || '')
    }
  }

  const handleSampleClick = (sample) => {
    setBody(sample.body)
    setRoutingKey(sample.key)
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
        <p className="text-xs text-gray-500 mt-1">Test messages with exchange-specific templates. Each exchange has different message format and visibility.</p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-gray-400 block mb-1">📨 Exchange</label>
          <select
            value={exchange}
            onChange={handleExchangeChange}
            className="w-full px-2 py-2 bg-gray-800 border border-orange-600 rounded text-sm text-white font-semibold"
          >
            <option value="">Select exchange...</option>
            <optgroup label="Active Exchanges">
              <option value="default">🔄 (default) - Work Queues</option>
              <option value="order.events">📢 order.events - Fanout</option>
              <option value="logs.direct">📋 logs.direct - Direct (Severity)</option>
              <option value="notifications.topic">🔔 notifications.topic - Topic (Pattern)</option>
              <option value="orders.headers">🗺️ orders.headers - Headers (Region)</option>
            </optgroup>
            <optgroup label="System Exchanges">
              <option value="dead.letter.exchange">⚠️ dead.letter.exchange - DLX (Passive)</option>
            </optgroup>
          </select>
        </div>

        {exchange && (
          <div className="bg-gray-900 border border-gray-700 rounded p-3 mb-3">
            <p className="text-xs text-gray-300 mb-1"><strong>Type:</strong> {selectedTemplate.name}</p>
            <p className="text-xs text-gray-400 mb-2"><strong>Description:</strong> {selectedTemplate.description}</p>
            <div className={clsx('text-xs font-semibold p-2 rounded', 
              selectedTemplate.responseType.includes('Visible') ? 'bg-green-900 text-green-300' :
              selectedTemplate.responseType.includes('No UI') ? 'bg-yellow-900 text-yellow-300' :
              'bg-red-900 text-red-300'
            )}>
              Response: {selectedTemplate.responseType}
            </div>
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-gray-400 block mb-1">Routing Key {selectedTemplate.routingKeyHint && `(e.g., ${selectedTemplate.routingKeyHint})`}</label>
          <input
            type="text"
            value={routingKey}
            onChange={(e) => setRoutingKey(e.target.value)}
            placeholder={selectedTemplate.routingKeyHint || 'Leave empty if not needed'}
            className="w-full px-2 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white font-mono"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-gray-400">Message Body (JSON)</label>
            {selectedTemplate.samples && selectedTemplate.samples.length > 0 && (
              <div className="text-xs space-y-1">
                <span className="text-gray-500 mr-2">Quick Samples:</span>
                {selectedTemplate.samples.map((sample, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSampleClick(sample)}
                    className="inline-block ml-1 px-2 py-1 bg-purple-800 hover:bg-purple-700 rounded text-purple-200 text-xs transition"
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
            className="w-full px-2 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white font-mono text-xs"
          />
        </div>

        <Button onClick={handlePublish} disabled={!exchange || exchange === 'dead.letter.exchange' || publishing}>
          {publishing ? 'Publishing...' : `Publish to ${exchange.split('.')[-1] || 'Exchange'}`}
        </Button>

        {message && (
          <div className={clsx('text-xs p-2 rounded', 
            message.includes('Cannot publish') ? 'bg-red-900 text-red-200' :
            message.includes('Error') ? 'bg-red-900 text-red-300' : 
            'bg-green-900 text-green-300'
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
        <h2 className="text-lg font-bold text-white">📦 Send Orders</h2>
        <p className="text-xs text-gray-400 mt-1">Publish orders to the messaging system</p>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-400 block mb-1">🌍 Region</label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-full px-2 py-2 bg-gray-800 border border-orange-600 rounded text-sm text-white font-semibold"
            >
              <option value="US">🇺🇸 US Region</option>
              <option value="EU">🇪🇺 EU Region</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-400 block mb-1">📋 Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="w-full px-2 py-2 bg-gray-800 border border-orange-600 rounded text-sm text-white font-semibold"
            >
              <option value="json">JSON</option>
              <option value="xml">XML Legacy</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-400 block mb-1">Number of Orders</label>
            <input
              type="number"
              min="1"
              max="100"
              value={orderCount}
              onChange={(e) => setOrderCount(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-2 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-400 block mb-1">Order Amount ($)</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="99.99"
              className="w-full px-2 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-400 block mb-1">Customer ID</label>
            <input
              type="text"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="CUST-001"
              className="w-full px-2 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-400 block mb-1">
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
              className="w-full px-2 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white"
            >
              <option value="">Select template...</option>
              <option value="us">📦 US (JSON)</option>
              <option value="eu">📦 EU (JSON)</option>
              <option value="xml">📦 XML Legacy</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-400 block mb-1">Items (JSON)</label>
          <textarea
            value={items}
            onChange={(e) => setItems(e.target.value)}
            rows="3"
            className="w-full px-2 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white font-mono text-xs"
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
          <p className={clsx('text-xs', message.includes('Error') ? 'text-red-400' : 'text-green-400')}>
            {message}
          </p>
        )}
      </div>
    </Card>
  )
}

/**
 * PhonePublisherPanel — Direct SMS/phone notification publisher.
 * Sends messages to notifications.topic exchange with routing keys.
 */
export function PhonePublisherPanel() {
  const [phoneNumber, setPhoneNumber] = useState('+1-555-0100')
  const [messageType, setMessageType] = useState('alert')
  const [customMessage, setCustomMessage] = useState('')
  const [orderId, setOrderId] = useState('ORD-001')
  const [publishing, setPublishing] = useState(false)
  const [message, setMessage] = useState('')

  const messageTemplates = {
    alert: {
      title: '🚨 Emergency Alert',
      default: 'URGENT: Your payment failed. Please update payment method immediately.',
      routingKey: 'notification.sms.urgent',
      description: 'Critical alerts that need immediate attention'
    },
    delivery: {
      title: '📦 Delivery Update',
      default: 'Your order is out for delivery. Expected arrival: Today.',
      routingKey: 'notification.sms.normal',
      description: 'Delivery status notifications'
    },
    confirmation: {
      title: '✅ Order Confirmation',
      default: 'Order confirmed! Order ID: ORD-123. Thank you for your purchase.',
      routingKey: 'notification.sms.normal',
      description: 'Order confirmation messages'
    },
    reminder: {
      title: '📣 Reminder',
      default: 'Reminder: Your order is ready for pickup at store. Reference: ORD-123',
      routingKey: 'notification.sms.normal',
      description: 'Pickup and reminder notifications'
    },
    promotion: {
      title: '🎉 Promotion',
      default: 'Exclusive offer: Get 20% off on your next purchase. Use code: SAVE20',
      routingKey: 'notification.sms.normal',
      description: 'Promotional messages'
    }
  }

  const validatePhoneNumber = (phone) => {
    // Basic phone validation: at least + followed by digits
    const phoneRegex = /^\+?\d{1,3}-?\d{3,14}$/
    return phoneRegex.test(phone)
  }

  const handlePublish = async () => {
    try {
      // Validate phone number
      if (!validatePhoneNumber(phoneNumber)) {
        setMessage('❌ Invalid phone number format. Use format like: +1-555-0100')
        setTimeout(() => setMessage(''), 5000)
        return
      }

      // Validate message
      const finalMessage = customMessage.trim() || messageTemplates[messageType].default
      if (finalMessage.length === 0) {
        setMessage('❌ Message cannot be empty')
        setTimeout(() => setMessage(''), 5000)
        return
      }

      if (finalMessage.length > 160) {
        setMessage('⚠️ Message is longer than 160 chars (SMS standard)')
        // Still allow sending
      }

      setPublishing(true)
      const BASE = import.meta.env.VITE_CHAOS_API_URL || 'http://localhost:8080'
      const response = await fetch(`${BASE}/chaos/message/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exchange: 'notifications.topic',
          routing_key: messageTemplates[messageType].routingKey,
          body: {
            order_id: orderId || 'SMS-' + Date.now(),
            customer_phone: phoneNumber,
            message: finalMessage,
            message_type: messageType,
            timestamp: new Date().toISOString(),
          },
        }),
      })
      const result = await response.json()
      setMessage(`✓ SMS published to ${phoneNumber}!`)
      setTimeout(() => setMessage(''), 4000)
    } catch (err) {
      setMessage(`❌ Error: ${err.message}`)
    } finally {
      setPublishing(false)
    }
  }

  const template = messageTemplates[messageType]

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-white">📱 Phone Publisher (SMS)</h2>
        <p className="text-xs text-gray-500 mt-1">Send direct SMS notifications to customers via notifications.topic</p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-gray-400 block mb-1">📞 Phone Number</label>
          <input
            type="text"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+1-555-0100"
            className="w-full px-2 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white font-mono"
          />
          <p className="text-xs text-gray-500 mt-1">Format: +1-555-0100 or similar</p>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-400 block mb-1">📋 Order ID (Optional)</label>
          <input
            type="text"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="ORD-001"
            className="w-full px-2 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white font-mono"
          />
          <p className="text-xs text-gray-500 mt-1">Reference for tracking</p>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-400 block mb-1">📢 Message Type</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(messageTemplates).map(([type, config]) => (
              <button
                key={type}
                onClick={() => setMessageType(type)}
                className={clsx(
                  'px-2 py-2 rounded text-xs font-semibold transition',
                  messageType === type
                    ? 'bg-blue-700 text-white border border-blue-500'
                    : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
                )}
              >
                {config.title}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">{template.description}</p>
          <p className="text-xs text-gray-500 mt-1">
            <strong>Routing:</strong> {template.routingKey}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-gray-400">Message (160 char limit)</label>
            <span className={clsx(
              'text-xs',
              customMessage.length > 160 ? 'text-orange-400' : 'text-gray-500'
            )}>
              {customMessage.length}/160
            </span>
          </div>
          <textarea
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            placeholder={template.default}
            rows="3"
            maxLength="160"
            className="w-full px-2 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white font-mono text-xs"
          />
          <p className="text-xs text-gray-500 mt-1">Leave empty to use template default</p>
        </div>

        <div className="bg-gray-900 border border-gray-700 rounded p-2 mb-3">
          <p className="text-xs text-gray-300"><strong>Preview:</strong></p>
          <p className="text-xs text-gray-400 mt-1 break-words">
            {customMessage.trim() || template.default}
          </p>
        </div>

        <Button onClick={handlePublish} disabled={publishing}>
          {publishing ? 'Sending...' : `Send SMS to ${phoneNumber}`}
        </Button>

        {message && (
          <div className={clsx('text-xs p-2 rounded',
            message.includes('Error') ? 'bg-red-900 text-red-200' :
            message.includes('⚠️') ? 'bg-yellow-900 text-yellow-200' :
            'bg-green-900 text-green-300'
          )}>
            {message}
          </div>
        )}
      </div>
    </Card>
  )
}
