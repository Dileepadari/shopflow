import { useMemo, useState } from 'react'
import {
  Bomb,
  CircleStop,
  History,
  Pause,
  Play,
  RotateCcw,
  ServerCog,
  Skull,
  Trash2,
  Unplug,
  Waves,
  Zap,
} from 'lucide-react'

import * as chaos from '../../api/chaos'
import { Badge, Button, Card, EmptyState, Mono, SectionTitle } from '../ui/index'

const BROKER_NODES = ['rabbit1', 'rabbit2', 'rabbit3']

const FIELD_LABEL = 'block text-xs font-medium text-muted mb-1'
const FIELD_INPUT =
  'w-full px-2.5 py-2 bg-surface-muted border border-line rounded-[var(--radius)] text-sm text-content focus:border-brand outline-none'

/** What each consumer does, so the operator knows what breaking it will show. */
const CONSUMER_NOTES = {
  payment_consumer: 'Processes payments (2–5s each). The slowest queue, so backlog builds fastest here.',
  inventory_consumer: 'Reserves stock (0.5–2s each).',
  email_consumer: 'Fanout subscriber — email confirmations.',
  sms_consumer: 'Fanout subscriber — SMS alerts.',
  push_consumer: 'Fanout subscriber — push notifications.',
  log_error_consumer: 'Persists error logs to the shared volume.',
  log_info_consumer: 'Prints info and debug logs.',
  notif_email_consumer: 'Topic routing — notification.email.*',
  notif_sms_consumer: 'Topic routing — notification.sms.urgent only.',
  notif_audit_consumer: 'Topic routing — receives everything via #.',
  eu_processor: 'Headers routing — region=EU, format=json.',
  us_processor: 'Headers routing — region=US, format=json.',
  xml_legacy_consumer: 'Headers routing — format=xml, any region.',
  dead_letter_consumer: 'Drains the DLX. Stopping it stops dead letters being recorded.',
}

function noteFor(service) {
  if (CONSUMER_NOTES[service]) return CONSUMER_NOTES[service]
  // payment_consumer_1 -> payment_consumer
  const base = service.replace(/_\d+$/, '')
  return CONSUMER_NOTES[base] || 'Consumer container.'
}

function stateBadge(state) {
  if (state === 'consuming' || state === 'running') return 'healthy'
  if (state === 'stopped' || state === 'exited') return 'error'
  return 'warning'
}

/**
 * Fault injection controls.
 *
 * Status comes from the shared dashboard poll rather than a second interval of
 * its own, so the whole page reflects one consistent snapshot.
 */
export function ChaosControlPanel({ queues = [], status }) {
  const [actionLog, setActionLog] = useState([])
  const [acting, setActing] = useState(false)
  const [selectedService, setSelectedService] = useState('')
  const [selectedQueue, setSelectedQueue] = useState('payment_queue')
  const [selectedBroker, setSelectedBroker] = useState('rabbit1')
  const [floodCount, setFloodCount] = useState(100)
  const [poisonCount, setPoisonCount] = useState(5)

  const services = useMemo(() => {
    if (!status?.services) return []
    return Object.entries(status.services)
      .filter(([name]) => name.includes('consumer') || name.includes('processor'))
      .map(([name, info]) => ({ name, ...info }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [status])

  const queueNames = useMemo(
    () => queues.map((q) => q.name).filter((n) => n !== 'dead_letter_queue').sort(),
    [queues]
  )

  const service = selectedService || services[0]?.name || ''
  const queueChoices = queueNames.length > 0 ? queueNames : [selectedQueue]

  const run = async (fn, label, detail = '') => {
    setActing(true)
    try {
      const response = await fn()
      const text =
        typeof response?.result === 'string'
          ? response.result
          : response?.result?.message || 'done'
      log(label, true, `${detail}${detail ? ' — ' : ''}${text}`)
    } catch (err) {
      log(label, false, err.message)
    } finally {
      setActing(false)
    }
  }

  const log = (action, ok, detail) => {
    setActionLog((previous) =>
      [{ time: new Date().toLocaleTimeString(), action, ok, detail }, ...previous].slice(0, 20)
    )
  }

  return (
    <div className="space-y-4">
      <Card className="border-warning/40 bg-warning-soft">
        <div className="flex items-start gap-2">
          <Zap className="w-4 h-4 mt-0.5 text-warning shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-content">Chaos Control Panel</h2>
            <p className="text-xs text-muted mt-1">
              Inject faults and watch the system recover on the other tabs. Every action here is
              reversible — “Restore all” brings back any container this panel stopped.
            </p>
          </div>
        </div>
      </Card>

      {/* ----------------------------------------------------------- consumers */}
      <Card>
        <SectionTitle
          icon={ServerCog}
          title="Consumer faults"
          description="Stop is graceful, kill is a SIGKILL, pause freezes the process with its connection still open"
        />

        {services.length === 0 ? (
          <EmptyState message="No consumer containers reporting — is the chaos service running?" />
        ) : (
          <>
            <div className="mb-3">
              <label className={FIELD_LABEL} htmlFor="chaos-service">
                Consumer
              </label>
              <select
                id="chaos-service"
                value={service}
                onChange={(e) => setSelectedService(e.target.value)}
                className={FIELD_INPUT}
              >
                {services.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} — {s.connection || s.state}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted mt-1.5">{noteFor(service)}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={acting}
                onClick={() => run(() => chaos.stopConsumer(service), 'Stop consumer', service)}>
                <CircleStop className="w-3.5 h-3.5" /> Stop
              </Button>
              <Button variant="danger" disabled={acting}
                onClick={() => run(() => chaos.killConsumer(service), 'Kill consumer', service)}>
                <Skull className="w-3.5 h-3.5" /> Kill
              </Button>
              <Button variant="warning" disabled={acting}
                onClick={() => run(() => chaos.pauseConsumer(service), 'Pause consumer', service)}>
                <Pause className="w-3.5 h-3.5" /> Pause
              </Button>
              <Button variant="secondary" disabled={acting}
                onClick={() => run(() => chaos.resumeConsumer(service), 'Resume consumer', service)}>
                <Play className="w-3.5 h-3.5" /> Resume
              </Button>
              <Button variant="success" disabled={acting}
                onClick={() => run(() => chaos.startConsumer(service), 'Start consumer', service)}>
                <Play className="w-3.5 h-3.5" /> Start
              </Button>
            </div>

            <div className="flex flex-wrap gap-1.5 mt-4">
              {services.map((s) => (
                <Badge
                  key={s.name}
                  status={stateBadge(s.connection || s.state)}
                  label={`${s.name}: ${s.connection || s.state}`}
                />
              ))}
            </div>
          </>
        )}
      </Card>

      {/* ------------------------------------------------------------- brokers */}
      <Card>
        <SectionTitle
          icon={ServerCog}
          title="Broker faults"
          description="Take a cluster node down and watch HAProxy reroute while the quorum queues elect a new leader"
        />
        <div className="mb-3 max-w-xs">
          <label className={FIELD_LABEL} htmlFor="chaos-broker">
            Node
          </label>
          <select
            id="chaos-broker"
            value={selectedBroker}
            onChange={(e) => setSelectedBroker(e.target.value)}
            className={FIELD_INPUT}
          >
            {BROKER_NODES.map((node) => (
              <option key={node} value={node}>
                {node}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={acting}
            onClick={() => run(() => chaos.stopBroker(selectedBroker), 'Stop broker', selectedBroker)}>
            <CircleStop className="w-3.5 h-3.5" /> Stop node
          </Button>
          <Button variant="danger" disabled={acting}
            onClick={() => run(() => chaos.killBroker(selectedBroker), 'Kill broker', selectedBroker)}>
            <Skull className="w-3.5 h-3.5" /> Kill node
          </Button>
          <Button variant="success" disabled={acting}
            onClick={() => run(() => chaos.startBroker(selectedBroker), 'Start broker', selectedBroker)}>
            <Play className="w-3.5 h-3.5" /> Start node
          </Button>
        </div>
      </Card>

      {/* -------------------------------------------------------------- queues */}
      <Card>
        <SectionTitle
          icon={Waves}
          title="Queue faults"
          description="Purge a backlog, inject messages that always fail, or flood a queue to build one up"
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className={FIELD_LABEL} htmlFor="chaos-queue">
              Queue
            </label>
            <select
              id="chaos-queue"
              value={selectedQueue}
              onChange={(e) => setSelectedQueue(e.target.value)}
              className={FIELD_INPUT}
            >
              {queueChoices.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={FIELD_LABEL} htmlFor="chaos-poison">
              Poison messages
            </label>
            <input
              id="chaos-poison"
              type="number"
              min="1"
              max="500"
              value={poisonCount}
              onChange={(e) => setPoisonCount(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
              className={FIELD_INPUT}
            />
          </div>
          <div>
            <label className={FIELD_LABEL} htmlFor="chaos-flood">
              Flood count
            </label>
            <input
              id="chaos-flood"
              type="number"
              min="1"
              max="5000"
              value={floodCount}
              onChange={(e) => setFloodCount(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
              className={FIELD_INPUT}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={acting}
            onClick={() => run(() => chaos.purgeQueue(selectedQueue), 'Purge queue', selectedQueue)}>
            <Trash2 className="w-3.5 h-3.5" /> Purge
          </Button>
          <Button variant="warning" disabled={acting}
            onClick={() =>
              run(
                () => chaos.injectPoison(selectedQueue, poisonCount),
                'Inject poison',
                `${poisonCount} into ${selectedQueue}`
              )
            }>
            <Bomb className="w-3.5 h-3.5" /> Inject {poisonCount} poison
          </Button>
          <Button variant="warning" disabled={acting}
            onClick={() =>
              run(
                () => chaos.floodQueue(selectedQueue, floodCount),
                'Flood queue',
                `${floodCount} into ${selectedQueue}`
              )
            }>
            <Waves className="w-3.5 h-3.5" /> Flood {floodCount}
          </Button>
        </div>
        <p className="text-xs text-muted mt-3">
          Poison messages fail to decode, so each is dead-lettered and shows up on the DLX Audit tab.
        </p>
      </Card>

      {/* -------------------------------------------------------------- global */}
      <Card>
        <SectionTitle
          icon={RotateCcw}
          title="Global controls"
          description="Drop every connection, or bring the whole stack back"
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="warning" disabled={acting}
            onClick={() => run(chaos.dropAllConnections, 'Drop all connections')}>
            <Unplug className="w-3.5 h-3.5" /> Drop all connections
          </Button>
          <Button variant="success" disabled={acting}
            onClick={() => run(chaos.restoreAll, 'Restore all containers')}>
            <RotateCcw className="w-3.5 h-3.5" /> Restore all
          </Button>
        </div>
      </Card>

      {/* ----------------------------------------------------------- audit log */}
      <Card>
        <SectionTitle icon={History} title="Action history" description="This session only" />
        {actionLog.length === 0 ? (
          <EmptyState message="No chaos actions yet." />
        ) : (
          <ul className="space-y-1.5">
            {actionLog.map((entry, index) => (
              <li
                key={`${entry.time}-${index}`}
                className="flex items-start gap-2 text-xs border-b border-line/60 pb-1.5 last:border-0"
              >
                <Mono className="text-subtle shrink-0">{entry.time}</Mono>
                <Badge status={entry.ok ? 'healthy' : 'error'} label={entry.action} />
                <span className="text-muted min-w-0 break-words">{entry.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
