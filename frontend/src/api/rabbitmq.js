/**
 * RabbitMQ Management API Client
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 * Calls the producer_api proxy endpoints to avoid CORS issues.
 * The proxy forwards to RabbitMQ Management API on port 15672.
 */
const PROXY = import.meta.env.VITE_PRODUCER_API_URL || 'http://localhost:8090'
const VHOST = import.meta.env.VITE_RABBITMQ_VHOST || 'shopflow'

const get = (path) =>
  fetch(`${PROXY}/mgmt${path}`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })
    .catch((e) => {
      console.error('RabbitMQ API error:', e)
      return null
    })

export const fetchNodes = () => get('/nodes')
export const fetchOverview = () => get('/overview')
export const fetchQueues = () => get(`/queues/${encodeURIComponent(VHOST)}`)
export const fetchExchanges = () => get(`/exchanges/${encodeURIComponent(VHOST)}`)
export const fetchConsumers = () => get(`/consumers/${encodeURIComponent(VHOST)}`)
export const fetchConnections = () => get('/connections')
export const fetchBindings = () => get(`/bindings/${encodeURIComponent(VHOST)}`)
