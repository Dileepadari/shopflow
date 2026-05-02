const CHAOS    = import.meta.env.VITE_CHAOS_API_URL    || 'http://localhost:8080'
const PRODUCER = import.meta.env.VITE_PRODUCER_API_URL || 'http://localhost:8090'
const post = (base, path, body={}) =>
  fetch(`${base}${path}`, { method:'POST', headers:{'Content-Type':'application/json'},
                             body: JSON.stringify(body) }).then(r => r.json())
const get  = (base, path) => fetch(`${base}${path}`).then(r => r.json())

export const getStatus          = ()           => get(CHAOS, '/chaos/status')
export const getDlxHistory      = (limit=50)   => get(CHAOS, `/chaos/dlx/history?limit=${limit}`)
export const stopConsumer       = s            => post(CHAOS, '/chaos/consumer/stop',   {service:s})
export const killConsumer       = s            => post(CHAOS, '/chaos/consumer/kill',   {service:s})
export const pauseConsumer      = s            => post(CHAOS, '/chaos/consumer/pause',  {service:s})
export const resumeConsumer     = s            => post(CHAOS, '/chaos/consumer/resume', {service:s})
export const startConsumer      = s            => post(CHAOS, '/chaos/consumer/start',  {service:s})
export const stopBroker         = n            => post(CHAOS, '/chaos/broker/stop',  {node:n})
export const killBroker         = n            => post(CHAOS, '/chaos/broker/kill',  {node:n})
export const startBroker        = n            => post(CHAOS, '/chaos/broker/start', {node:n})
export const purgeQueue         = q            => post(CHAOS, '/chaos/queue/purge',  {queue:q})
export const injectPoison       = (q,c)        => post(CHAOS, '/chaos/queue/poison', {queue:q,count:c})
export const floodExchange      = (e,c)        => post(CHAOS, '/chaos/queue/flood',  {exchange:e,count:c})
export const dropAllConnections = ()           => post(CHAOS, '/chaos/connections/drop-all')
export const restoreAll         = ()           => post(CHAOS, '/chaos/restore-all')

export const publishOrder       = body         => post(PRODUCER, '/orders/publish', body)
export const publishBatch       = body         => post(PRODUCER, '/orders/batch',   body)
