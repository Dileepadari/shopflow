import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

/**
 * MessageRateChart — Time-series chart of publish/ack/nack rates.
 */
export function MessageRateChart({ data = [] }) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center bg-gray-800 rounded">
        <p className="text-gray-500">No data yet</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="time" stroke="#9CA3AF" style={{ fontSize: '12px' }} />
        <YAxis stroke="#9CA3AF" style={{ fontSize: '12px' }} />
        <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151' }} />
        <Legend />
        <Line type="monotone" dataKey="publish" stroke="#F97316" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="ack" stroke="#10B981" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="nack" stroke="#EF4444" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

/**
 * QueueDepthChart — Bar chart showing queue depths.
 */
export function QueueDepthChart({ data = [] }) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center bg-gray-800 rounded">
        <p className="text-gray-500">No queues</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 50 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="name"
          stroke="#9CA3AF"
          style={{ fontSize: '11px' }}
          angle={-45}
          textAnchor="end"
          height={100}
        />
        <YAxis stroke="#9CA3AF" style={{ fontSize: '12px' }} />
        <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151' }} />
        <Bar dataKey="messages" fill="#F97316" />
      </BarChart>
    </ResponsiveContainer>
  )
}

/**
 * ExchangeVisualization — Simple exchange binding diagram.
 */
export function ExchangeVisualization({ exchange = {} }) {
  const { name, type, bindings = [] } = exchange

  return (
    <div className="space-y-4">
      <div className="p-3 bg-blue-900 border border-blue-700 rounded">
        <p className="text-xs font-semibold text-blue-200">Exchange: {name}</p>
        <p className="text-xs text-blue-300 mt-1">Type: {type}</p>
      </div>

      {bindings.length > 0 ? (
        <div className="space-y-2">
          {bindings.map((binding, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-4 h-4 bg-orange-500 rounded" />
              <span className="text-xs font-mono text-gray-300">{binding.destination}</span>
              {binding.routing_key && (
                <span className="text-xs text-gray-500">({binding.routing_key})</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500">No bindings</p>
      )}
    </div>
  )
}
