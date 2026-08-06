/**
 * RabbitMQ Management API client.
 *
 * Calls the Producer API's /mgmt proxy, which holds the broker credentials and
 * fails over between the three nodes. Reached same-origin through nginx (or the
 * Vite dev proxy), so no host or port is baked into the bundle.
 */
import { apiGet } from './client'

const VHOST = 'shopflow'
const vhost = encodeURIComponent(VHOST)

export const fetchNodes = () => apiGet('/api/mgmt/nodes')
export const fetchOverview = () => apiGet('/api/mgmt/overview')
export const fetchQueues = () => apiGet(`/api/mgmt/queues/${vhost}`)
export const fetchExchanges = () => apiGet(`/api/mgmt/exchanges/${vhost}`)
export const fetchConsumers = () => apiGet(`/api/mgmt/consumers/${vhost}`)
export const fetchConnections = () => apiGet('/api/mgmt/connections')
export const fetchBindings = () => apiGet(`/api/mgmt/bindings/${vhost}`)
