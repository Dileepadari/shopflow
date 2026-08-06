import { useCallback, useRef, useState } from 'react'

import * as chaos from '../api/chaos'
import * as rabbitmq from '../api/rabbitmq'
import { useInterval } from './useInterval'

const POLL_MS = 2000
const HISTORY_POINTS = 30

/**
 * Polls every data source the dashboard needs.
 *
 * One fetch function serves both the initial load and the interval - these used
 * to be two copies of the same ~60 lines that could drift apart.
 */
export function useDashboardData() {
  const [data, setData] = useState({
    nodes: [],
    overview: {},
    queues: [],
    exchanges: [],
    bindings: [],
    consumers: [],
    connections: [],
    dlxHistory: [],
    status: null,
  })
  const [messageHistory, setMessageHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    // A slow poll must not stack up behind itself.
    if (inFlight.current) return
    inFlight.current = true
    try {
      const [nodes, overview, queues, exchanges, bindings, consumers, connections, dlx, status] =
        await Promise.all([
          rabbitmq.fetchNodes(),
          rabbitmq.fetchOverview(),
          rabbitmq.fetchQueues(),
          rabbitmq.fetchExchanges(),
          rabbitmq.fetchBindings(),
          rabbitmq.fetchConsumers(),
          rabbitmq.fetchConnections(),
          chaos.getDlxHistory(50),
          chaos.getStatus(),
        ])

      setData({
        nodes: nodes || [],
        overview: overview || {},
        queues: queues || [],
        exchanges: exchanges || [],
        bindings: bindings || [],
        consumers: consumers || [],
        connections: connections || [],
        dlxHistory: dlx?.records || [],
        status,
      })

      // Real broker rates. This used to plot the exchange *count* as the publish
      // rate, the ready-message backlog as acks, and a hardcoded zero for nacks.
      const stats = overview?.message_stats || {}
      setMessageHistory((previous) =>
        [
          ...previous,
          {
            time: new Date().toLocaleTimeString(),
            publish: round(stats.publish_details?.rate),
            ack: round(stats.ack_details?.rate),
            deliver: round(stats.deliver_get_details?.rate),
          },
        ].slice(-HISTORY_POINTS)
      )

      setError(nodes === null && overview === null ? 'Cannot reach the ShopFlow API' : null)
    } catch (err) {
      setError(err?.message || 'Failed to fetch dashboard data')
    } finally {
      setLoading(false)
      inFlight.current = false
    }
  }, [])

  // `immediate` covers the initial load, so there is no second copy of the
  // fetch logic in a useEffect the way there used to be.
  useInterval(refresh, POLL_MS, { immediate: true })

  return { ...data, messageHistory, loading, error, refresh, pollMs: POLL_MS }
}

function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}
