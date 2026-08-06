<div align="center">
<img src="adk-logo.png" alt="ADK Dev" width="140" />

# ShopFlow — Developer Guide

</div>

Everything you need to work on ShopFlow rather than just run it. If you only want
to start it and click around, the [README](../README.md) is the right document.

---

## Contents

- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Local development](#local-development)
- [The topology](#the-topology)
- [How a message flows](#how-a-message-flows)
- [Reliability model](#reliability-model)
- [Adding a consumer](#adding-a-consumer)
- [Configuration reference](#configuration-reference)
- [API reference](#api-reference)
- [Testing](#testing)
- [Code style](#code-style)
- [Upgrade notes](#upgrade-notes)
- [Design decisions](#design-decisions)
- [Known gaps](#known-gaps)

---

## Architecture

24 containers on one Docker bridge network (`172.20.0.0/24`).

```
                         ┌──────────────────────────────┐
   browser ───► :3000 ───│  frontend (nginx + React SPA)│
                         │  proxies /api/* ─────────────┼──┐
                         └──────────────────────────────┘  │
                                                            │
              ┌─────────────────────────────────────────────┤
              │                                             │
    ┌─────────▼──────────┐                     ┌────────────▼─────────┐
    │  producer_api      │                     │  chaos_service       │
    │  FastAPI :8090     │                     │  FastAPI :8080       │
    │  publishes orders  │                     │  docker.sock mounted │
    │  proxies /mgmt     │                     │  starts/stops/kills  │
    └─────────┬──────────┘                     └────────────┬─────────┘
              │                                             │
              │           AMQP 5670                         │
              └──────────────┬──────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  haproxy        │  leastconn over the 3 nodes
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
   ┌────▼────┐          ┌────▼────┐          ┌────▼────┐
   │ rabbit1 │◄────────►│ rabbit2 │◄────────►│ rabbit3 │   quorum queues,
   └────┬────┘          └─────────┘          └─────────┘   Raft replication
        │
        │  16 consumer containers, each `python src/consumers/<name>.py`
        └──────────────────────────────────────────────────────────────►
```

**Startup order** is enforced by Compose health checks:

1. `rabbit1` becomes healthy (`rabbitmq-diagnostics check_running`)
2. `rabbit2` and `rabbit3` join the cluster
3. `haproxy` starts once all three are healthy; its own health check hits the
   live stats endpoint, not just the config file
4. `cluster_init` runs `declare_all()` once and exits 0
5. Every consumer, `producer_api` and `chaos_service` start, gated on
   `service_completed_successfully`
6. `frontend` starts

Step 4 matters: topology is declared exactly once, by one process. Consumers do
not declare their own queues, so they cannot race each other or disagree about a
queue's arguments.

---

## Repository layout

```
shopflow/
├── docker-compose.yml         24 services, one network, four volumes
├── Dockerfile                 shared Python image: cluster_init, consumers, producer_api
├── pyproject.toml             pytest and ruff configuration
│
├── src/
│   ├── core/
│   │   ├── config.py          frozen Settings dataclass, read from the environment
│   │   ├── connection.py      pika connection/channel factory with a retry budget
│   │   ├── declarations.py    ★ the single source of truth for all topology
│   │   ├── message_builder.py persistent properties, order payloads, encode/decode
│   │   └── management.py      RabbitMQ HTTP Management client, shared by both services
│   ├── consumers/
│   │   ├── _base_consumer.py  ★ ack/nack contract, reconnect, graceful shutdown
│   │   ├── dead_letter_consumer.py   owns the retry budget
│   │   └── … 13 more, ~15 lines each
│   ├── producers/order_producer.py   publishes one order to all five exchange types
│   └── utils/
│       ├── logger.py          root handler configured once
│       ├── retry.py           x-death parsing and the retry decision
│       └── jsonl.py           append-only JSONL sinks on the shared volume
│
├── producer_api/              FastAPI: order publishing + management proxy
│   ├── broker.py              one long-lived AMQP connection, shared per request
│   └── routes/{order,mgmt}_routes.py
│
├── chaos_service/             FastAPI: fault injection
│   ├── containers.py          ★ allow-list of containers it may touch
│   ├── services/{docker,rabbitmq}_service.py
│   └── routes/{consumer,broker,queue,message,status}_routes.py
│
├── frontend/                  React 19 + Vite 8 + Tailwind 4
│   ├── src/api/               client.js, chaos.js, rabbitmq.js — all relative paths
│   ├── src/hooks/             useDashboardData (one poll for the whole page)
│   ├── src/components/        ui/ primitives, panels/, charts/, chaos/
│   └── nginx.conf             serves the SPA and proxies /api/*
│
├── infrastructure/
│   ├── rabbitmq/{rabbitmq.conf,enabled_plugins}
│   └── haproxy/haproxy.cfg
│
├── scripts/                   cluster_init.py, demo, health-check, monitor,
│                              teardown, validate
└── tests/
    ├── unit/                  no broker required
    ├── integration/           needs a running stack; marked `integration`
    └── load/locustfile.py
```

Files marked ★ are the ones worth reading first.

---

## Local development

### Python services

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
```

`LOG_DIR` defaults to `/app/logs`, which only exists in a container. Point it
somewhere writable when running locally:

```bash
export LOG_DIR=/tmp/shopflow-logs
```

Start the infrastructure in Docker and run one consumer on your machine against
it:

```bash
docker compose up -d rabbit1 rabbit2 rabbit3 haproxy cluster_init
docker compose stop payment_consumer_1

RABBITMQ_HOST=localhost HAPROXY_AMQP_PORT=5670 LOG_DIR=/tmp/shopflow-logs \
  python src/consumers/payment_consumer.py
```

The Producer API the same way:

```bash
RABBITMQ_HOST=localhost LOG_DIR=/tmp/shopflow-logs \
  uvicorn producer_api.main:app --reload --port 8090
```

### Frontend

```bash
cd frontend
npm install
npm run dev      # http://localhost:3000
```

The Vite dev server proxies `/api/chaos`, `/api/orders` and `/api/mgmt` to the
containerised services on ports 8080 and 8090 — the same paths nginx serves in
production, so there is no dev-only code path.

```bash
npm run build    # production bundle
npm run lint
```

---

## The topology

Everything below is generated from `QUEUES` and `EXCHANGES` in
`src/core/declarations.py`. **Change it there and nowhere else** — the DLX
bindings, the chaos service's flood targets and the validation script all derive
from that one list.

### Exchanges

| Exchange | Type | Requirement | Purpose |
|---|---|---|---|
| *(default)* | direct | FR-01 | Routes by queue name to the work queues |
| `order.events` | fanout | FR-02 | Broadcasts every order to all notification channels |
| `logs.error` | direct | FR-03 | `error` and `warning` |
| `logs.info` | direct | FR-03 | `info` and `debug` |
| `notifications.topic` | topic | FR-04 | Pattern-routed notifications |
| `orders.headers` | headers | FR-05 | Region and format routing |
| `dead.letter.exchange` | direct | FR-08 | Receives everything that fails |

### Queues

| Queue | Exchange | Binding | Consumer(s) |
|---|---|---|---|
| `payment_queue` | *(default)* | `payment_queue` | `payment_consumer_1`, `payment_consumer_2` |
| `inventory_queue` | *(default)* | `inventory_queue` | `inventory_consumer_1`, `inventory_consumer_2` |
| `email_queue` | `order.events` | *(fanout)* | `email_consumer` |
| `sms_queue` | `order.events` | *(fanout)* | `sms_consumer` |
| `push_queue` | `order.events` | *(fanout)* | `push_consumer` |
| `log_error_queue` | `logs.error` | `error`, `warning` | `log_error_consumer` |
| `log_info_queue` | `logs.info` | `info`, `debug` | `log_info_consumer` |
| `notif_email_queue` | `notifications.topic` | `notification.email.*` | `notif_email_consumer` |
| `notif_sms_queue` | `notifications.topic` | `notification.sms.urgent` | `notif_sms_consumer` |
| `notif_audit_queue` | `notifications.topic` | `#` | `notif_audit_consumer` |
| `eu_queue` | `orders.headers` | `x-match: all`, `region=EU`, `format=json` | `eu_processor` |
| `us_queue` | `orders.headers` | `x-match: all`, `region=US`, `format=json` | `us_processor` |
| `xml_legacy_queue` | `orders.headers` | `x-match: any`, `format=xml` | `xml_legacy_consumer` |
| `dead_letter_queue` | `dead.letter.exchange` | `dlx.<source queue>` ×13 | `dead_letter_consumer` |

Every work queue is declared with:

```python
{
  "x-queue-type": "quorum",
  "x-message-ttl": settings.message_ttl_ms,          # 60_000 by default
  "x-dead-letter-exchange": "dead.letter.exchange",
  "x-dead-letter-routing-key": f"dlx.{queue_name}",
}
```

`dead_letter_queue` is the exception: no TTL (records are kept until reviewed)
and no onward DLX (there is nowhere further to go).

> **Why the DLX bindings are derived, not listed.** `dead.letter.exchange` is a
> *direct* exchange, so a dead letter whose routing key has no binding is
> discarded silently — no error, no log, nothing in the management UI. The bind
> list used to be maintained by hand next to the queue declarations, and drifted:
> three entries named queues that did not exist and two real queues were missing
> entirely, so five of the thirteen queues silently dropped every dead letter.
> `_declare_dlx` now iterates the same `QUEUES` tuple the declarations come from,
> and `tests/unit/test_declarations.py::test_every_queue_dead_letter_key_is_bound`
> fails if they ever diverge again.

---

## How a message flows

`POST /orders/publish` → `publish_order()` in `src/producers/order_producer.py`
publishes, in order, on a channel in **confirm mode**:

1. `payment_queue` via the default exchange, `mandatory=True`
2. `inventory_queue` — only reached if step 1 was confirmed by the broker
3. `order.events` (fanout) — one message becomes three
4. `logs.info` with routing key `info`
5. `notifications.topic`, five times, once per routing-key combination
6. `orders.headers` with `{region, format}` headers, `mandatory=True`

Roughly a dozen deliveries per order.

**Confirm mode is what makes step 2 meaningful.** Without
`channel.confirm_delivery()`, `basic_publish` on a `BlockingChannel` is
fire-and-forget: it does not raise on a routing or broker failure, so a
"publish payment before inventory" guard would always take the success branch
regardless of what happened.

`mandatory=True` turns an unroutable message into an exception instead of a
silent drop. Region and format are also validated up front
(`validate_order_inputs`), because `region="ASIA"` matches no headers binding and
would otherwise vanish.

---

## Reliability model

### Acknowledgement

`BaseConsumer._on_message` is the whole contract:

| Situation | Action | Result |
|---|---|---|
| Processed successfully | `basic_ack` | Removed from the queue |
| Body will not decode | `basic_nack(requeue=False)` | Straight to the DLX — retrying cannot help |
| `process_message` raised | `basic_nack(requeue=False)` | To the DLX, `x-death` count incremented |
| Consumer crashes | *(nothing)* | Broker requeues on TCP disconnect |

**Why never `requeue=True`.** Requeueing does not increment `x-death`, so a
poison message would loop forever with no retry budget ever being consumed.
Sending it to the DLX increments the count, and `dead_letter_consumer` decides
whether to hand it back or archive it. That makes `MAX_RETRIES` real.

### The retry loop

```
queue ──fails──► nack(requeue=False) ──► DLX ──► dead_letter_consumer
                                                     │
                     x-death count < MAX_RETRIES ─────┤──► republish to the original queue
                     count >= MAX_RETRIES, or  ───────┘
                     reason == "expired"                   archive to dead_letters.jsonl
```

Expired messages are never retried: republishing into the same 60-second-TTL
queue just expires again, burning the whole budget for nothing.

### Log retention

The three JSONL sinks (`dead_letters.jsonl`, `error_logs.jsonl`,
`notification_audit.jsonl`) live on the shared volume and roll over at
`LOG_MAX_BYTES`, keeping one previous generation as `<name>.1`. `read_records`
and `count_records` span both, so a rollover never looks like data loss on the
DLX Audit tab. Set `LOG_MAX_BYTES=0` to disable rotation.

### Guarded publishes

Any publish that happens *around* an ack — the audit log on success, the error
notice on failure — goes through `BaseConsumer._safe_publish`, which swallows
failures. An unguarded publish there escapes into pika's dispatch loop and leaves
the in-flight message unacked forever.

### Log feedback loops

`log_info_consumer` reads the queue that every other consumer publishes its
success audit to; `log_error_consumer` reads the error equivalent. Both set
`emit_info_log = False` / `emit_error_log = False` so they cannot feed their own
queue.

### Fair dispatch

`basic_qos(prefetch_count=1, global_qos=False)`. `global_qos` must stay `False`:
RabbitMQ 4.3 rejects channel-wide QoS outright, and quorum queues never supported
it.

---

## Adding a consumer

Say you want `fraud_check_consumer` on a new `fraud_queue`, fed by the existing
fanout.

**1. Register the queue** in `src/core/declarations.py`:

```python
QUEUES: tuple[QueueSpec, ...] = (
    ...
    QueueSpec("fraud_queue", "order.events", ("",), consumers=("fraud_check_consumer",)),
)
```

That is all the topology work. The DLX binding, quorum arguments and TTL are
applied automatically, and the chaos service can already flood and poison it.

**2. Write the consumer** — `src/consumers/fraud_check_consumer.py`:

```python
"""Fraud scoring for incoming orders."""
from src.consumers._base_consumer import BaseConsumer


class FraudCheckConsumer(BaseConsumer):
    queue_name   = "fraud_queue"
    consumer_tag = "fraud_check_consumer"
    min_delay, max_delay = 0.2, 1.0

    def process_message(self, payload: dict) -> None:
        if float(payload.get("amount", 0)) > 10_000:
            raise ValueError(f"Flagged order {payload['order_id']}")
        self.logger.info("[FRAUD] Cleared order %s", payload.get("order_id"))
```

Raise to reject a message — the base class dead-letters it for you. Do not catch
and swallow, or the message will be acked as if it succeeded.

**3. Add the container** to `docker-compose.yml`:

```yaml
  fraud_check_consumer:
    <<: *consumer-common
    container_name: fraud_check_consumer
    hostname: fraud_check_consumer      # required: the chaos service matches on it
    command: python src/consumers/fraud_check_consumer.py
```

**4. Allow the chaos panel to control it** — add the name to `CONSUMERS` in
`chaos_service/containers.py`.

**5. Rebuild.** Because the queue set changed, start from clean volumes:

```bash
./scripts/teardown.sh && docker compose up --build -d
```

---

## Configuration reference

Everything is read from the environment; `src/core/config.py` is the only place
that reads it.

| Variable | Default | Read by |
|---|---|---|
| `RABBITMQ_HOST` | `localhost` | `connection.py` — `haproxy` inside Compose |
| `HAPROXY_AMQP_PORT` | `5670` | `connection.py`; `RABBITMQ_PORT` is accepted as an alias |
| `RABBITMQ_USER` / `RABBITMQ_PASS` | `admin` / `shopflow123` | AMQP and the management API |
| `RABBITMQ_VHOST` | `shopflow` | All connections |
| `RABBIT{1,2,3}_MGMT` | `http://rabbit{n}:15672` | `management.py`; `RABBITMQ_MGMT_URLS` overrides all three |
| `PREFETCH_COUNT` | `1` | `get_channel` |
| `MAX_RETRIES` | `3` | `retry.py`, so `dead_letter_consumer` |
| `MESSAGE_TTL_MS` | `60000` | `_quorum_args` in `declarations.py` |
| `LOG_LEVEL` | `INFO` | `logger.py` |
| `LOG_DIR` | `/app/logs` | `jsonl.py` |
| `LOG_MAX_BYTES` | `10485760` | `jsonl.py` — rolls a sink to `<name>.1`; `0` disables |
| `CORS_ORIGINS` | `http://localhost:3000` | Both FastAPI apps |
| `API_BIND_ADDRESS` | `127.0.0.1` | `docker-compose.yml` — interface the two APIs publish on |

> Earlier versions of `.env.example` documented about a dozen variables that no
> code read — `ENABLE_METRICS`, `PRODUCER_DELIVERY_MODE`,
> `CONSUMER_RECONNECT_DELAY_SECONDS`, the `LOCUST_*` group and others, plus three
> "performance profiles" built from them. They have been removed, except
> `LOG_MAX_SIZE_BYTES`, which was worth having and is now implemented as
> `LOG_MAX_BYTES`. Everything listed above is genuinely wired up.

---

## API reference

### Producer API — port 8090

| Method | Path | Notes |
|---|---|---|
| `POST` | `/orders/publish` | `region` (US/EU), `format` (json/xml), `amount`, `currency`, `customer_name`, `items` |
| `POST` | `/orders/batch` | Same fields plus `count` (1–1000), over one connection |
| `POST` | `/orders/flood/{exchange}` | `count` (1–5000), `routing_key`; exchange must be one this system declares |
| `GET` | `/mgmt/{nodes,overview,connections}` | Management proxy with node failover |
| `GET` | `/mgmt/{queues,exchanges,consumers,bindings}/{vhost}` | ditto |
| `GET` | `/health` | Includes `broker_connected` |

Status codes: `422` for a request the schema rejects, `503` when the broker
cannot be reached, `502` when no management node answers.

### Chaos Panel — port 8080

| Method | Path | Notes |
|---|---|---|
| `POST` | `/chaos/consumer/{stop,kill,pause,resume,start}` | `service` must be in the `CONSUMERS` allow-list |
| `POST` | `/chaos/broker/{stop,kill,start}` | `node` must be `rabbit1`, `rabbit2` or `rabbit3` |
| `POST` | `/chaos/queue/{purge,poison,flood}` | `queue` must be a declared queue |
| `POST` | `/chaos/connections/drop-all` | Every consumer reconnects on its own |
| `POST` | `/chaos/restore-all` | Scoped to `containers.RESTORABLE` |
| `POST` | `/chaos/message/{publish,publish-batch}` | Raw publishing, with header support |
| `GET` | `/chaos/status` | `{services, consumers, cluster}` |
| `GET` | `/chaos/dlx/history?limit=N` | Tail of `dead_letters.jsonl`, max 500 |

> **Security note.** This service has `/var/run/docker.sock` mounted, which is
> effectively root on the host. Every container and queue name it accepts is
> checked against an allow-list (`chaos_service/containers.py` and the topology
> registry) and CORS is limited to the dashboard origin. Do not expose port 8080
> beyond localhost.

---

## Testing

```bash
python -m pytest                      # unit tests; integration auto-skips
python -m pytest -m "not integration" # unit only, explicitly
python -m pytest tests/integration -v # needs a running stack
python -m pytest --cov               # coverage
ruff check .                          # lint and import order
ruff check . --fix                    # auto-fix what it can
```

`ruff format` is deliberately **not** part of the workflow: the consumer classes
use aligned assignments (`queue_name   = "payment_queue"`) that the formatter
would collapse, and reformatting every file would bury real changes in noise.
`ruff check` covers correctness and import order, which is what matters.

`pyproject.toml` sets `pythonpath = ["."]`, so a bare `pytest tests/unit/` works.
Without it you would get `ModuleNotFoundError: No module named 'src'`, because
pytest inserts `tests/unit` on the path rather than the repository root.

**What is covered**

| Area | File |
|---|---|
| Topology and DLX binding integrity | `tests/unit/test_declarations.py` |
| Ack/nack contract, poison handling, lifecycle | `tests/unit/test_base_consumer.py` |
| Retry budget and `x-death` parsing | `tests/unit/test_retry.py` |
| DLX retry-versus-archive decision | `tests/unit/test_dead_letter_consumer.py` |
| Producer API validation and error mapping | `tests/unit/test_producer_api.py` |
| Chaos allow-lists and flood targeting | `tests/unit/test_chaos_service.py` |
| Message construction and serialisation | `tests/unit/test_message_builder.py` |
| End-to-end routing and dead-lettering | `tests/integration/test_order_flow.py` |

Integration tests skip themselves when the broker is unreachable, so a plain
`pytest` run is always safe.

### Continuous integration

`.github/workflows/ci.yml` runs four jobs on every push and pull request:

| Job | What it does |
|---|---|
| `python` | `ruff check` plus the unit suite with coverage |
| `frontend` | `npm ci`, `eslint`, `npm run build` |
| `compose` | `docker compose config` and a real `haproxy -c` config parse |
| `integration` | Builds and starts all 24 containers, runs `validate.sh` and the integration suite, then tears the stack down |

The integration job dumps the last 100 lines of container logs when it fails,
which is usually enough to see which service refused to start.

---

## Code style

- `ruff check` for linting and import sorting; line length 100. No auto-formatter.
- Lazy `%s` logging (`logger.info("Order %s", order_id)`), never f-strings in log
  calls.
- Type hints on function signatures; `dict | None` rather than `Optional[dict]`.
- Comments explain *why*, not *what*. Several in this codebase document a
  specific bug that a change prevents — keep those.

---

## Upgrade notes

### RabbitMQ 3.13 → 4.3

- **Volumes must be wiped.** 4.x uses Khepri and cannot read 3.13's Mnesia data.
  `docker compose down -v` first.
- `rabbitmq_peer_discovery_classic_config` was removed from `enabled_plugins` —
  config-file peer discovery is built into the core in 4.x.
- `basic.qos(global=true)` is **rejected** in 4.3. All QoS calls pass
  `global_qos=False` explicitly.
- Classic mirrored queues are gone. This project already used quorum queues
  everywhere, so nothing changed; `default_queue_type = quorum` in
  `rabbitmq.conf` now enforces it.
- `infrastructure/rabbitmq/definitions.json` was deleted. It described an
  obsolete topology, was never loaded (there was no `load_definitions` setting),
  and its `ha-policy` used classic mirroring, which 4.x rejects.

### Frontend

Tailwind v4 is CSS-first: there is no `tailwind.config.js` or `postcss.config.js`
any more. Design tokens live in `@theme` in `frontend/src/index.css`, and the
plugin is wired up through `@tailwindcss/vite`.

The dashboard no longer uses `VITE_*` variables. Vite inlines those at build
time, but Compose supplied them as runtime environment, so every one resolved to
`undefined` and fell back to `http://localhost:*` — which only worked when the
browser happened to be running on the Docker host. All calls are now relative and
proxied by nginx.

---

## Design decisions

| Decision | Why | Trade-off accepted |
|---|---|---|
| `cluster_init` declares topology once | No races, no disagreement about queue arguments | If it fails, nothing starts — deliberate |
| Consumers never declare queues | A stale argument would 406 and loop forever | Topology changes need a teardown |
| One shared connection in the Producer API | Was opening a connection *and redeclaring the whole topology* per order | pika is not thread-safe, so access is serialised behind a lock |
| Frontend calls same-origin `/api/*` | Works from any host, not just the Docker host | One nginx hop |
| `chaos_service` builds from the repo root | Lets it import `src/`, so config, connection and message building are not reimplemented | Slightly larger build context |
| Allow-lists on every container name | The Docker socket is mounted | New consumers must be registered in two places |
| Quorum queues everywhere | Raft majority means no loss on single-node failure | More memory and disk per node |
| `prefetch_count=1` | True fair dispatch; a slow consumer cannot hoard a backlog | Lower raw throughput |
| Retry budget lives in the DLX consumer | `requeue=True` never increments `x-death`, so it cannot enforce a limit | One extra hop per retry |

---

## Tracing an order

Every publish for one order carries that order's id as the AMQP
`correlation_id`, and each consumer propagates it onto the audit and error log
messages it emits. One order is therefore followable across all five exchanges,
every queue it fans out to, and into the dead letter record if it fails.

From the broker's management UI, or in the DLX Audit tab, which shows it on each
record. In code:

```python
build_properties(correlation_id=order_id)      # producers set it
self._correlation_id(properties, payload)      # consumers read it, with a
                                               # fallback to payload["order_id"]
```

---

## Known gaps

Honest list of what is not done.

- **No authentication on either FastAPI service.** This is deliberate — adding
  auth would mean putting credentials in the dashboard, and the whole point is
  a zero-setup demo. Instead both services bind to **loopback only**
  (`API_BIND_ADDRESS`, default `127.0.0.1`), so they are not reachable from the
  LAN. The dashboard talks to them over the internal Docker network by service
  name, so it is unaffected. If you set `API_BIND_ADDRESS=0.0.0.0`, understand
  that you are exposing unauthenticated container lifecycle control.
- **The dashboard has no automated UI tests.** Behaviour is covered at the API
  level and the bundle is lint- and build-checked in CI, but there is no
  Playwright or component test suite.
- **`ShopFlow_PRD.pdf` is not regenerated.** It documents Team 9's v1.0.0 as
  delivered and deliberately still describes the original topology, including
  the retry semantics that turned out not to work (see the note under
  Reliability model).

---

<div align="center">
<sub>ShopFlow · ADK Dev · 2026 — originally Team 9, Three Musketeers, IIITH</sub>
</div>
