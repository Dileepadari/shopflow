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
