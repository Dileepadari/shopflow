/**
 * Chaos Control Panel and Producer API clients.
 *
 * All paths are relative and proxied same-origin - see frontend/nginx.conf.
 * These POSTs throw ApiError on failure so the UI can report it rather than
 * showing a success message for a request the server rejected.
 */
import { apiGet, apiPost } from './client'

const CHAOS = '/api/chaos'
const ORDERS = '/api/orders'

export const getStatus = () => apiGet(`${CHAOS}/status`)
export const getDlxHistory = (limit = 50) => apiGet(`${CHAOS}/dlx/history?limit=${limit}`)

export const stopConsumer = (service) => apiPost(`${CHAOS}/consumer/stop`, { service })
export const killConsumer = (service) => apiPost(`${CHAOS}/consumer/kill`, { service })
export const pauseConsumer = (service) => apiPost(`${CHAOS}/consumer/pause`, { service })
export const resumeConsumer = (service) => apiPost(`${CHAOS}/consumer/resume`, { service })
export const startConsumer = (service) => apiPost(`${CHAOS}/consumer/start`, { service })

export const stopBroker = (node) => apiPost(`${CHAOS}/broker/stop`, { node })
export const killBroker = (node) => apiPost(`${CHAOS}/broker/kill`, { node })
export const startBroker = (node) => apiPost(`${CHAOS}/broker/start`, { node })

export const purgeQueue = (queue) => apiPost(`${CHAOS}/queue/purge`, { queue })
export const injectPoison = (queue, count) => apiPost(`${CHAOS}/queue/poison`, { queue, count })
export const floodQueue = (queue, count) => apiPost(`${CHAOS}/queue/flood`, { queue, count })
export const dropAllConnections = () => apiPost(`${CHAOS}/connections/drop-all`)
export const restoreAll = () => apiPost(`${CHAOS}/restore-all`)

export const publishMessage = (body) => apiPost(`${CHAOS}/message/publish`, body)

export const publishOrder = (body) => apiPost(`${ORDERS}/publish`, body)
export const publishBatch = (body) => apiPost(`${ORDERS}/batch`, body)
