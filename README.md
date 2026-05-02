# ShopFlow — Distributed Order Processing & Notification System
> Team 9 — Three Musketeers

## Quick Start — One Command

```bash
docker compose up --build
```

That's it. All 24 services start automatically:
- 3-node RabbitMQ cluster
- HAProxy load balancer
- `cluster_init` (declares all topology, then exits)
- 14 consumers (all 5 exchange types + DLX)
- Producer API (REST trigger for orders)
- Chaos Control Panel
- React dashboard

## Open in Browser

| URL | What |
|-----|------|
| http://localhost:3000 | React Dashboard |
| http://localhost:15672 | RabbitMQ Management (admin/shopflow123) |
| http://localhost:8090/docs | Producer API (Swagger) |
| http://localhost:8080/docs | Chaos Control Panel (Swagger) |
| http://localhost:8404/stats | HAProxy stats |

## Publish a Test Order

```bash
# Via REST (no Python needed — everything is Docker)
curl -X POST http://localhost:8090/orders/publish \
  -H "Content-Type: application/json" \
  -d '{"region":"US","format":"json","amount":49.99}'

# Publish a batch
curl -X POST http://localhost:8090/orders/batch \
  -d '{"count":20,"region":"EU"}'
```

## Run Chaos Scenarios

```bash
bash scripts/demo.sh     # automated walkthrough of all 7 scenarios
```

Or use the Chaos panel in the dashboard (⚡ Chaos tab).

## Load Testing

```bash
# Install Locust locally
pip install locust

locust -f tests/load/locustfile.py --host http://localhost:8090
# Open http://localhost:8089 → set users/rate → Start
```

## Teardown

```bash
docker compose down -v     # removes containers + volumes
# or
bash scripts/teardown.sh
```

## Architecture

```
docker compose up
  ├── rabbit1 / rabbit2 / rabbit3  (3-node Raft quorum cluster)
  ├── haproxy                       (AMQP :5670, leastconn LB)
  ├── cluster_init                  (one-shot: declares all topology → exits 0)
  │
  ├── payment_consumer_1            ─┐
  ├── payment_consumer_2            ─┤  FR-01 Work Queues (default exchange)
  ├── inventory_consumer_1          ─┤
  ├── inventory_consumer_2          ─┘
  │
  ├── email_consumer                ─┐
  ├── sms_consumer                  ─┤  FR-02 Fanout (order.events)
  ├── push_consumer                 ─┘
  │
  ├── log_error_consumer            ─┐  FR-03 Direct (logs.direct)
  ├── log_info_consumer             ─┘
  │
  ├── notif_email_consumer          ─┐
  ├── notif_sms_consumer            ─┤  FR-04 Topic (notifications.topic)
  ├── notif_audit_consumer          ─┘
  │
  ├── eu_processor                  ─┐
  ├── us_processor                  ─┤  FR-05 Headers (orders.headers)
  ├── xml_legacy_consumer           ─┘
  │
  ├── dead_letter_consumer              FR-08 DLX audit
  │
  ├── producer_api     :8090            REST → publish orders on demand
  ├── chaos_service    :8080            Fault injection API
  └── frontend         :3000            React dashboard
```

## Service Startup Order

```
rabbit1 → rabbit2 → rabbit3
               ↓
           haproxy (healthy)
               ↓
         cluster_init (exits 0)
               ↓
    ┌──────────┴──────────┐
    │ all consumers       │
    │ producer_api        │
    │ chaos_service       │
    └─────────────────────┘
               ↓
           frontend
```
