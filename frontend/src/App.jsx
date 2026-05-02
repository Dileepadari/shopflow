/**
 * App.jsx — ShopFlow dashboard root.
 */
import React, { useState } from 'react'

const TABS = [
  { id: 'overview',  label: 'Overview' },
  { id: 'queues',    label: 'Queues' },
  { id: 'exchanges', label: 'Exchanges' },
  { id: 'consumers', label: 'Consumers' },
  { id: 'dlx',       label: 'DLX Audit' },
  { id: 'publisher', label: 'Publisher' },
  { id: 'chaos',     label: '⚡ Chaos' },
]

function PlaceholderPanel({ title }) {
  return (
    <div className="panel">
      <p className="panel-title">{title}</p>
      <p className="text-gray-500 text-sm">Panel implementation pending.</p>
    </div>
  )
}

export default function App() {
  const [active, setActive] = useState('overview')
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">
            <span className="text-orange-400">Shop</span>Flow
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Distributed Order Processing · RabbitMQ Dashboard
          </p>
        </div>
        <span className="text-xs text-gray-500">Team 9 — Three Musketeers</span>
      </header>
      <nav className="border-b border-gray-800 px-6 flex gap-1 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActive(t.id)}
            className={`px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors
              ${active === t.id
                ? 'text-white border-b-2 border-orange-500'
                : 'text-gray-400 hover:text-gray-200'}`}>
            {t.label}
          </button>
        ))}
      </nav>
      <main className="flex-1 p-6">
        <PlaceholderPanel title={TABS.find(t => t.id === active)?.label} />
      </main>
    </div>
  )
}
