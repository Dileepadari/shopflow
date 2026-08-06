#!/usr/bin/env bash
# Guided chaos demo. Open the dashboard at http://localhost:3000 first, then run
# this and watch each step land: queue depth, consumer status and the DLX tab.
set -uo pipefail

CHAOS="http://localhost:${CHAOS_SERVICE_PORT:-8080}/chaos"
ORDERS="http://localhost:${PRODUCER_API_PORT:-8090}/orders"
PAUSE="${DEMO_PAUSE:-8}"

BOLD='\033[1m'
RESET='\033[0m'

post() {
    local url=$1 body=$2
    if ! curl -sf -X POST "$url" -H 'Content-Type: application/json' -d "$body" \
        | python3 -m json.tool 2>/dev/null; then
        printf '  request failed: POST %s %s\n' "$url" "$body" >&2
    fi
}

chaos() { post "$CHAOS/$1" "$2"; }
orders() { post "$ORDERS/$1" "$2"; }

step() { printf "\n${BOLD}=== STEP %s ===${RESET}\n" "$*"; }

step "1: Publish 10 orders through all five exchange types"
orders "batch" '{"count":10,"region":"US","format":"json"}'
sleep "$PAUSE"

step "2: Stop payment_consumer_1 - watch payment_queue build a backlog"
chaos "consumer/stop" '{"service":"payment_consumer_1"}'
orders "batch" '{"count":20,"region":"US","format":"json"}'
echo "  Waiting 10s - the Queues tab should show payment_queue rising..."
sleep 10
chaos "consumer/start" '{"service":"payment_consumer_1"}'
echo "  Restarted. The backlog should now drain."
sleep "$PAUSE"

step "3: SIGKILL email_consumer - unACKed messages requeue on TCP disconnect"
chaos "consumer/kill" '{"service":"email_consumer"}'
orders "batch" '{"count":10,"region":"US","format":"json"}'
sleep 15
chaos "consumer/start" '{"service":"email_consumer"}'
sleep "$PAUSE"

step "4: Inject poison messages - they dead-letter after their retries"
chaos "queue/poison" '{"queue":"payment_queue","count":5}'
echo "  Check the DLX Audit tab; records should appear within a few seconds."
sleep "$PAUSE"

step "5: Poison a headers-routed queue - proves the DLX binding covers it too"
chaos "queue/poison" '{"queue":"eu_queue","count":3}'
sleep "$PAUSE"

step "6: Stop rabbit2 - HAProxy reroutes, quorum queues elect a new leader"
chaos "broker/stop" '{"node":"rabbit2"}'
orders "batch" '{"count":20,"region":"EU","format":"json"}'
sleep 10
chaos "broker/start" '{"node":"rabbit2"}'
sleep "$PAUSE"

# The request model is {queue, count}: the flood endpoint resolves which
# exchange feeds that queue from the topology registry.
step "7: Flood order.events via email_queue - 500 messages"
chaos "queue/flood" '{"queue":"email_queue","count":500}'
sleep "$PAUSE"

step "8: Restore everything"
chaos "restore-all" '{}'

printf "\nDemo complete. Dashboard: http://localhost:3000\n"
