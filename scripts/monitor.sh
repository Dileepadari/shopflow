#!/usr/bin/env bash
# Terminal dashboard. Refreshes every 5 seconds; press q or Ctrl+C to exit.
set -uo pipefail

RESET='\033[0m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'

RABBIT_USER="${RABBITMQ_USER:-admin}"
RABBIT_PASS="${RABBITMQ_PASS:-shopflow123}"
VHOST="${RABBITMQ_VHOST:-shopflow}"
MGMT="http://localhost:${RABBIT1_MGMT_PORT:-15672}/api"
INTERVAL="${MONITOR_INTERVAL:-5}"

mgmt_get() { curl -s --max-time 5 -u "$RABBIT_USER:$RABBIT_PASS" "$MGMT$1"; }

section() { printf "\n${YELLOW}=== %s ===${RESET}\n" "$1"; }

show_cluster() {
    section "CLUSTER"
    mgmt_get "/nodes" | python3 -c "
import sys, json
try:
    nodes = json.load(sys.stdin)
except Exception:
    print('  unavailable'); raise SystemExit
for node in sorted(nodes, key=lambda n: n['name']):
    name = node['name'].replace('rabbit@', '')
    state = 'UP' if node['running'] else 'DOWN'
    mem = (node.get('mem_used') or 0) / 1024 / 1024
    disk = (node.get('disk_free') or 0) / 1024 / 1024 / 1024
    print(f'  {name:10} {state:5} mem {mem:7.1f} MB   disk free {disk:5.1f} GB')
" 2>/dev/null || echo "  unavailable"
}

show_queues() {
    section "QUEUE DEPTHS (top 12)"
    mgmt_get "/queues/$VHOST" | python3 -c "
import sys, json
try:
    queues = json.load(sys.stdin)
except Exception:
    print('  unavailable'); raise SystemExit
queues.sort(key=lambda q: q.get('messages', 0), reverse=True)
print(f\"  {'QUEUE':<24}{'TOTAL':>7}{'READY':>7}{'UNACK':>7}{'CONS':>6}  TYPE\")
for q in queues[:12]:
    print(f\"  {q['name'][:24]:<24}\"
          f\"{q.get('messages', 0):>7}\"
          f\"{q.get('messages_ready', 0):>7}\"
          f\"{q.get('messages_unacknowledged', 0):>7}\"
          f\"{q.get('consumers', 0):>6}  {q.get('type', '?')}\")
" 2>/dev/null || echo "  unavailable"
}

show_consumers() {
    section "CONSUMERS BY QUEUE"
    mgmt_get "/consumers/$VHOST" | python3 -c "
import sys, json
from collections import Counter
try:
    consumers = json.load(sys.stdin)
except Exception:
    print('  unavailable'); raise SystemExit
counts = Counter(c.get('queue', {}).get('name', 'unknown') for c in consumers)
for queue, count in sorted(counts.items()):
    print(f'  {queue:<28} {count} consumer(s)')
print(f'  {\"TOTAL\":<28} {len(consumers)}')
" 2>/dev/null || echo "  unavailable"
}

show_rates() {
    section "THROUGHPUT"
    mgmt_get "/overview" | python3 -c "
import sys, json
try:
    overview = json.load(sys.stdin)
except Exception:
    print('  unavailable'); raise SystemExit
totals = overview.get('queue_totals', {})
stats = overview.get('message_stats', {})
def rate(key):
    return (stats.get(key) or {}).get('rate', 0.0)
print(f\"  Ready:          {totals.get('messages_ready', 0)}\")
print(f\"  Unacknowledged: {totals.get('messages_unacknowledged', 0)}\")
print(f'  Publish rate:   {rate(\"publish_details\"):.1f} msg/s')
print(f'  Deliver rate:   {rate(\"deliver_get_details\"):.1f} msg/s')
print(f'  Ack rate:       {rate(\"ack_details\"):.1f} msg/s')
" 2>/dev/null || echo "  unavailable"
}

printf "${GREEN}ShopFlow monitor — press q to quit${RESET}\n"
sleep 1

while true; do
    clear
    printf "${CYAN}ShopFlow — %s${RESET}\n" "$(date '+%Y-%m-%d %H:%M:%S')"
    show_cluster
    show_queues
    show_consumers
    show_rates
    printf "\n${CYAN}Refreshing in %ss — Enter to refresh now, q to quit${RESET}\n" "$INTERVAL"
    if read -r -t "$INTERVAL" -n 1 key; then
        case "$key" in
            q | Q) printf "\n"; exit 0 ;;
        esac
    fi
done
