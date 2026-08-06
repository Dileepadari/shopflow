#!/usr/bin/env bash
# End-to-end validation. Run after `docker compose up` has settled.
#
# Exits non-zero if any check fails, so it doubles as a smoke test in CI.
set -uo pipefail

RESET='\033[0m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'

RABBIT_USER="${RABBITMQ_USER:-admin}"
RABBIT_PASS="${RABBITMQ_PASS:-shopflow123}"
VHOST="${RABBITMQ_VHOST:-shopflow}"
MGMT="http://localhost:${RABBIT1_MGMT_PORT:-15672}/api"
PRODUCER="http://localhost:${PRODUCER_API_PORT:-8090}"
CHAOS="http://localhost:${CHAOS_SERVICE_PORT:-8080}"
FRONTEND="http://localhost:${FRONTEND_PORT:-3000}"
STATS="http://localhost:${HAPROXY_STATS_PORT:-8404}"

# The topology is defined once in src/core/declarations.py: 13 work queues plus
# dead_letter_queue, and 5 exchanges plus the DLX.
EXPECTED_QUEUES=14
EXPECTED_EXCHANGES=6

total=0
passed=0
failed=0

test_case() {
    local name=$1
    local cmd=$2
    total=$((total + 1))
    printf "\n${BLUE}Test %d: %s${RESET}\n" "$total" "$name"
    if eval "$cmd"; then
        printf "${GREEN}  PASS${RESET}\n"
        passed=$((passed + 1))
    else
        printf "${RED}  FAIL${RESET}\n"
        failed=$((failed + 1))
    fi
}

mgmt_get() { curl -sf -u "$RABBIT_USER:$RABBIT_PASS" "$MGMT$1"; }

printf "${YELLOW}=== ShopFlow end-to-end validation ===${RESET}\n"

test_case "Cluster has 3 running nodes" \
    'mgmt_get "/nodes" | python3 -c "import sys,json; n=json.load(sys.stdin); assert len(n)==3 and all(x[\"running\"] for x in n), n"'

test_case "All $EXPECTED_QUEUES queues declared" \
    "mgmt_get \"/queues/$VHOST\" | python3 -c \"import sys,json; q=json.load(sys.stdin); assert len(q)==$EXPECTED_QUEUES, f'got {len(q)}'\""

test_case "Every queue is a quorum queue" \
    "mgmt_get \"/queues/$VHOST\" | python3 -c \"
import sys, json
bad = [q['name'] for q in json.load(sys.stdin) if q.get('type') != 'quorum']
assert not bad, f'not quorum: {bad}'\""

test_case "All $EXPECTED_EXCHANGES exchanges declared" \
    "mgmt_get \"/exchanges/$VHOST\" | python3 -c \"
import sys, json
ex = [e for e in json.load(sys.stdin) if e['name'] and not e['name'].startswith('amq.')]
assert len(ex)==$EXPECTED_EXCHANGES, f'got {len(ex)}: {[e[\\\"name\\\"] for e in ex]}'\""

# Regression guard for the bug where five queues dead-lettered to a routing key
# that nothing was bound to, so their dead letters were silently discarded.
test_case "Every dead-letter routing key is bound to dead_letter_queue" \
    "python3 -c \"
import base64, json, urllib.request
auth = base64.b64encode(b'$RABBIT_USER:$RABBIT_PASS').decode()
def get(path):
    r = urllib.request.Request('$MGMT' + path)
    r.add_header('Authorization', 'Basic ' + auth)
    return json.load(urllib.request.urlopen(r, timeout=10))
queues = get('/queues/$VHOST')
bindings = get('/bindings/$VHOST')
bound = {b['routing_key'] for b in bindings
         if b.get('destination') == 'dead_letter_queue'
         and b.get('source') == 'dead.letter.exchange'}
missing = []
for q in queues:
    key = (q.get('arguments') or {}).get('x-dead-letter-routing-key')
    if key and key not in bound:
        missing.append((q['name'], key))
assert not missing, f'unbound dead-letter keys: {missing}'
print(f'  {len(bound)} DLX bindings cover every queue')\""

test_case "Producer API is healthy" \
    "curl -sf $PRODUCER/health | python3 -c \"import sys,json; assert json.load(sys.stdin)['status']=='ok'\""

test_case "Chaos Service is healthy" \
    "curl -sf $CHAOS/health | python3 -c \"import sys,json; assert json.load(sys.stdin)['status']=='ok'\""

test_case "Dashboard serves the SPA" \
    "curl -sf $FRONTEND | grep -q 'ShopFlow'"

test_case "Dashboard proxies the management API" \
    "curl -sf $FRONTEND/api/mgmt/overview | python3 -c \"import sys,json; assert 'object_totals' in json.load(sys.stdin)\""

test_case "Can publish a single order" \
    "curl -sf -X POST $PRODUCER/orders/publish -H 'Content-Type: application/json' \
        -d '{\"region\":\"US\",\"format\":\"json\",\"amount\":99.99}' \
        | python3 -c \"import sys,json; d=json.load(sys.stdin); assert d['status']=='published' and d['order_id']\""

test_case "Can publish a batch of orders" \
    "curl -sf -X POST $PRODUCER/orders/batch -H 'Content-Type: application/json' \
        -d '{\"count\":3,\"region\":\"EU\",\"format\":\"json\"}' \
        | python3 -c \"import sys,json; d=json.load(sys.stdin); assert d['count']==3\""

test_case "Invalid region is rejected with 422" \
    "[ \"\$(curl -s -o /dev/null -w '%{http_code}' -X POST $PRODUCER/orders/publish \
        -H 'Content-Type: application/json' -d '{\"region\":\"XX\"}')\" = '422' ]"

test_case "More than 10 consumers are subscribed" \
    "mgmt_get \"/consumers/$VHOST\" | python3 -c \"import sys,json; c=json.load(sys.stdin); assert len(c)>10, f'got {len(c)}'\""

test_case "Chaos status reports consumer states" \
    "curl -sf $CHAOS/chaos/status | python3 -c \"
import sys, json
s = json.load(sys.stdin)
assert 'services' in s and 'consumers' in s and 'cluster' in s, list(s)
assert s['consumers'], 'no consumer states reported'\""

test_case "Scaled consumers are reported as consuming" \
    "curl -sf $CHAOS/chaos/status | python3 -c \"
import sys, json
c = json.load(sys.stdin)['consumers']
for name in ('payment_consumer_1', 'payment_consumer_2'):
    assert c.get(name) == 'consuming', f'{name} is {c.get(name)!r}'\""

test_case "Unknown container is rejected with 400" \
    "[ \"\$(curl -s -o /dev/null -w '%{http_code}' -X POST $CHAOS/chaos/consumer/kill \
        -H 'Content-Type: application/json' -d '{\"service\":\"not_a_shopflow_container\"}')\" = '400' ]"

test_case "Can stop a consumer" \
    "curl -sf -X POST $CHAOS/chaos/consumer/stop -H 'Content-Type: application/json' \
        -d '{\"service\":\"payment_consumer_1\"}' | grep -q payment_consumer_1"

sleep 3

test_case "Can start a consumer" \
    "curl -sf -X POST $CHAOS/chaos/consumer/start -H 'Content-Type: application/json' \
        -d '{\"service\":\"payment_consumer_1\"}' | grep -q payment_consumer_1"

# Wait for it to re-subscribe rather than leaving the system a consumer short -
# a health check run straight after this would otherwise see 15 of 16.
# NB: test_case runs its command with eval in the current shell, so this must
# never call `exit` - that would terminate validate.sh itself and silently skip
# every remaining test.
wait_for_consumer() {
    local name=$1
    for _ in $(seq 1 30); do
        local state
        state=$(curl -sf "$CHAOS/chaos/status" 2>/dev/null \
            | python3 -c "import sys,json; print(json.load(sys.stdin)['consumers'].get('$name'))" 2>/dev/null)
        [ "$state" = "consuming" ] && return 0
        sleep 1
    done
    return 1
}

test_case "Restarted consumer re-subscribes" \
    "wait_for_consumer payment_consumer_1"

test_case "Can inject poison messages" \
    "curl -sf -X POST $CHAOS/chaos/queue/poison -H 'Content-Type: application/json' \
        -d '{\"queue\":\"payment_queue\",\"count\":2}' | grep -qi injected"

test_case "Flooding an unknown queue is rejected with 400" \
    "[ \"\$(curl -s -o /dev/null -w '%{http_code}' -X POST $CHAOS/chaos/queue/flood \
        -H 'Content-Type: application/json' -d '{\"queue\":\"nope\",\"count\":1}')\" = '400' ]"

test_case "Can retrieve DLX history" \
    "curl -sf \"$CHAOS/chaos/dlx/history?limit=10\" | python3 -c \"import sys,json; assert 'records' in json.load(sys.stdin)\""

test_case "HAProxy liveness endpoint responds" \
    "curl -sf $STATS/healthz -o /dev/null"

# The stats page itself is behind basic auth, so credentials are required. The
# CSV export is the stable machine-readable form.
test_case "All 3 HAProxy backends are UP" \
    "curl -sf -u '$RABBIT_USER:$RABBIT_PASS' '$STATS/stats;csv' \
        | awk -F, '\$1==\"amqp_cluster\" && \$2 ~ /^rabbit[123]\$/ && \$18==\"UP\"' \
        | wc -l | grep -q '^3\$'"

printf "\n${YELLOW}=== Summary ===${RESET}\n"
printf "Total: %d | ${GREEN}Passed: %d${RESET} | ${RED}Failed: %d${RESET}\n" "$total" "$passed" "$failed"

if [ "$failed" -eq 0 ]; then
    printf "${GREEN}All checks passed.${RESET}\n"
    exit 0
fi
printf "${RED}%d check(s) failed. Try: docker compose logs --tail=50${RESET}\n" "$failed"
exit 1
