const BASE  = import.meta.env.VITE_RABBITMQ_MGMT_URL || 'http://localhost:15672'
const USER  = import.meta.env.VITE_RABBITMQ_USER     || 'admin'
const PASS  = import.meta.env.VITE_RABBITMQ_PASS     || 'shopflow123'
const VHOST = import.meta.env.VITE_RABBITMQ_VHOST    || 'shopflow'
const AUTH  = 'Basic ' + btoa(`${USER}:${PASS}`)
const h     = { Authorization: AUTH, 'Content-Type': 'application/json' }
const get   = path => fetch(`${BASE}/api${path}`, { headers: h }).then(r => r.json())

export const fetchNodes       = () => get('/nodes')
export const fetchOverview    = () => get('/overview')
export const fetchQueues      = () => get(`/queues/${encodeURIComponent(VHOST)}`)
export const fetchExchanges   = () => get(`/exchanges/${encodeURIComponent(VHOST)}`)
export const fetchConsumers   = () => get(`/consumers/${encodeURIComponent(VHOST)}`)
export const fetchConnections = () => get('/connections')
