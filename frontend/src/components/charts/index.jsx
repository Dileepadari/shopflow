import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { EmptyState } from '../ui/index'

/**
 * Charts read their colours from the brand tokens via CSS variables, so they
 * follow the light/dark toggle instead of being hardcoded to one theme.
 */
const axis = 'var(--text-muted)'
const grid = 'var(--border)'

const tooltipStyle = {
  backgroundColor: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text)',
  fontSize: '12px',
}

function ChartFrame({ children, empty, emptyMessage }) {
  if (empty) {
    return (
      <div className="h-[300px] flex items-center justify-center rounded-[var(--radius)] border border-line bg-surface-muted">
        <EmptyState message={emptyMessage} />
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={300}>
      {children}
    </ResponsiveContainer>
  )
}

/** Broker throughput over the polling window. */
export function MessageRateChart({ data = [] }) {
  return (
    <ChartFrame empty={data.length === 0} emptyMessage="Waiting for the first samples">
      <LineChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={grid} />
        <XAxis dataKey="time" stroke={axis} tick={{ fontSize: 11 }} minTickGap={24} />
        <YAxis stroke={axis} tick={{ fontSize: 11 }} width={40} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="publish"
          name="Published/s"
          stroke="var(--brand)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="deliver"
          name="Delivered/s"
          stroke="var(--accent)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="ack"
          name="Acked/s"
          stroke="var(--success)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartFrame>
  )
}

/** Backlog per queue. */
export function QueueDepthChart({ data = [] }) {
  return (
    <ChartFrame empty={data.length === 0} emptyMessage="No queues reporting">
      <BarChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
        <XAxis
          dataKey="name"
          stroke={axis}
          tick={{ fontSize: 10 }}
          angle={-45}
          textAnchor="end"
          height={90}
          interval={0}
        />
        <YAxis stroke={axis} tick={{ fontSize: 11 }} width={40} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--border)', opacity: 0.3 }} />
        <Bar dataKey="messages" name="Messages" fill="var(--brand)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartFrame>
  )
}
