#!/usr/bin/env bash
# Quick "is everything up?" check. Prints a per-service report and exits
# non-zero if anything is unhealthy.
set -uo pipefail

RESET='\033[0m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'

RABBIT_USER="${RABBITMQ_USER:-admin}"
RABBIT_PASS="${RABBITMQ_PASS:-shopflow123}"
VHOST="${RABBITMQ_VHOST:-shopflow}"
MGMT="http://localhost:${RABBIT1_MGMT_PORT:-15672}/api"

problems=0

ok()   { printf "${GREEN}  ok${RESET}    %s\n" "$1"; }
bad()  { printf "${RED}  FAIL${RESET}  %s\n" "$1"; problems=$((problems + 1)); }

ALL_SERVICES=(
    rabbit1 rabbit2 rabbit3 haproxy producer_api chaos_service frontend
    payment_consumer_1 payment_consumer_2
    inventory_consumer_1 inventory_consumer_2
    email_consumer sms_consumer push_consumer
    log_error_consumer log_info_consumer
    notif_email_consumer notif_sms_consumer notif_audit_consumer
    eu_processor us_processor xml_legacy_consumer dead_letter_consumer
)

printf "${YELLOW}=== ShopFlow health check ===${RESET}\n\nContainers:\n"
for service in "${ALL_SERVICES[@]}"; do
    state=$(docker compose ps --format '{{.State}}' "$service" 2>/dev/null | head -1)
    case "$state" in
        running) ok "$service" ;;
        "")      bad "$service (not found)" ;;
        *)       bad "$service ($state)" ;;
    esac
done

printf "\nHTTP endpoints:\n"
check_http() {
    local name=$1 url=$2 expected=${3:-200}
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" 2>/dev/null || echo 000)
    if [ "$code" = "$expected" ]; then
        ok "$name ($code)"
    else
        bad "$name — expected $expected, got $code — $url"
    fi
}

check_http "Producer API"          "http://localhost:${PRODUCER_API_PORT:-8090}/health"
check_http "Chaos Service"         "http://localhost:${CHAOS_SERVICE_PORT:-8080}/health"
check_http "Dashboard"             "http://localhost:${FRONTEND_PORT:-3000}"
check_http "Dashboard API proxy"   "http://localhost:${FRONTEND_PORT:-3000}/api/mgmt/overview"
check_http "HAProxy liveness"      "http://localhost:${HAPROXY_STATS_PORT:-8404}/healthz"
# Unauthenticated management API must reject, which proves auth is on.
check_http "RabbitMQ management"   "$MGMT/overview" 401

printf "\nCluster:\n"
nodes=$(curl -s -u "$RABBIT_USER:$RABBIT_PASS" --max-time 5 "$MGMT/nodes" \
    | python3 -c "import sys,json; print(sum(1 for n in json.load(sys.stdin) if n['running']))" 2>/dev/null || echo 0)
[ "$nodes" = "3" ] && ok "3 of 3 nodes running" || bad "$nodes of 3 nodes running"

queues=$(curl -s -u "$RABBIT_USER:$RABBIT_PASS" --max-time 5 "$MGMT/queues/$VHOST" \
    | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
[ "$queues" = "14" ] && ok "14 queues declared" || bad "$queues queues declared (expected 14)"

consumers=$(curl -s -u "$RABBIT_USER:$RABBIT_PASS" --max-time 5 "$MGMT/consumers/$VHOST" \
    | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
[ "$consumers" -ge 16 ] 2>/dev/null && ok "$consumers consumers subscribed" \
    || bad "$consumers consumers subscribed (expected at least 16)"

# The stats page is behind basic auth; the CSV export is easiest to parse.
backends=$(curl -s --max-time 5 -u "$RABBIT_USER:$RABBIT_PASS" \
    "http://localhost:${HAPROXY_STATS_PORT:-8404}/stats;csv" \
    | awk -F, '$1=="amqp_cluster" && $2 ~ /^rabbit[123]$/ && $18=="UP"' | wc -l)
[ "$backends" = "3" ] && ok "3 of 3 HAProxy backends UP" \
    || bad "$backends of 3 HAProxy backends UP"

printf "\n"
if [ "$problems" -eq 0 ]; then
    printf "${GREEN}=== Everything healthy ===${RESET}\n"
    exit 0
fi
printf "${RED}=== %d problem(s) found ===${RESET}\n" "$problems"
printf "Try: docker compose logs --tail=50\n"
exit 1
