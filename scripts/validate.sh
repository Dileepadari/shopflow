#!/usr/bin/env bash
# End-to-end validation script — test all ShopFlow features
set -e

RESET='\033[0m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'

total=0
passed=0
failed=0

test_case() {
    local name=$1
    local cmd=$2
    ((total++))
    echo -e "\n${BLUE}Test $total: $name${RESET}"
    if eval "$cmd"; then
        echo -e "${GREEN}✓ PASS${RESET}"
        ((passed++))
    else
        echo -e "${RED}✗ FAIL${RESET}"
        ((failed++))
    fi
}

echo -e "${YELLOW}=== ShopFlow End-to-End Validation ===${RESET}"

# Test 1: Cluster Health
test_case "Cluster has 3 healthy nodes" \
    'curl -s -u admin:shopflow123 http://localhost:15672/api/nodes | python3 -c "import sys, json; nodes = json.load(sys.stdin); exit(0 if len(nodes) == 3 and all(n[\"running\"] for n in nodes) else 1)" 2>/dev/null'

# Test 2: Queue Topology
test_case "All 14 queues declared" \
    'curl -s -u admin:shopflow123 http://localhost:15672/api/queues/shopflow | python3 -c "import sys, json; exit(0 if len(json.load(sys.stdin)) == 14 else 1)" 2>/dev/null'

# Test 3: Exchange Topology
test_case "All 6 exchanges declared" \
    'curl -s -u admin:shopflow123 http://localhost:15672/api/exchanges/shopflow | python3 -c "import sys, json; exits = [e for e in json.load(sys.stdin) if not e[\"name\"].startswith(\"amq.\")]; exit(0 if len(exits) == 6 else 1)" 2>/dev/null'

# Test 4: Producer API Health
test_case "Producer API responds" \
    'curl -s http://localhost:8090/health | python3 -c "import sys, json; exit(0 if json.load(sys.stdin)[\"status\"] == \"ok\" else 1)"'

# Test 5: Chaos Service Health
test_case "Chaos Service responds" \
    'curl -s http://localhost:8080/health | python3 -c "import sys, json; exit(0 if json.load(sys.stdin)[\"status\"] == \"ok\" else 1)"'

# Test 6: Frontend Loads
test_case "Frontend responds with HTML" \
    'curl -s http://localhost:3000 | grep -q "ShopFlow"'

# Test 7: Publish Single Order
test_case "Can publish single order" \
    'curl -s -X POST http://localhost:8090/orders/publish \
        -H "Content-Type: application/json" \
        -d "{\"region\":\"US\",\"format\":\"json\",\"amount\":99.99}" | python3 -c "import sys, json; exit(0 if \"success\" in str(json.load(sys.stdin)).lower() else 1)"'

# Test 8: Publish Batch Orders
test_case "Can publish batch orders" \
    'curl -s -X POST http://localhost:8090/orders/batch \
        -H "Content-Type: application/json" \
        -d "{\"count\":3,\"region\":\"EU\",\"format\":\"json\"}" | python3 -c "import sys, json; exit(0 if \"success\" in str(json.load(sys.stdin)).lower() else 1)"'

# Test 9: Consumer Status
test_case "Consumers are active" \
    'curl -s -u admin:shopflow123 http://localhost:15672/api/consumers/shopflow | python3 -c "import sys, json; consumers = json.load(sys.stdin); exit(0 if len(consumers) > 10 else 1)" 2>/dev/null'

# Test 10: Get Cluster Status
test_case "Can get chaos status" \
    'curl -s http://localhost:8080/chaos/status | python3 -c "import sys, json; status = json.load(sys.stdin); exit(0 if \"consumers\" in status else 1)"'

# Test 11: Stop Consumer
test_case "Can stop consumer via chaos API" \
    'curl -s -X POST http://localhost:8080/chaos/consumer/stop \
        -H "Content-Type: application/json" \
        -d "{\"service\":\"payment_consumer_1\"}" | python3 -c "import sys, json; data = json.load(sys.stdin); exit(0 if \"payment_consumer_1\" in str(data) else 1)"'

sleep 3

# Test 12: Start Consumer
test_case "Can start consumer via chaos API" \
    'curl -s -X POST http://localhost:8080/chaos/consumer/start \
        -H "Content-Type: application/json" \
        -d "{\"service\":\"payment_consumer_1\"}" | python3 -c "import sys, json; data = json.load(sys.stdin); exit(0 if \"payment_consumer_1\" in str(data) else 1)"'

# Test 13: Poison Messages
test_case "Can inject poison messages" \
    'curl -s -X POST http://localhost:8080/chaos/queue/poison \
        -H "Content-Type: application/json" \
        -d "{\"queue\":\"payment_queue\",\"count\":1}" | python3 -c "import sys, json; data = json.load(sys.stdin); exit(0 if \"success\" in str(data).lower() or \"injected\" in str(data).lower() else 1)"'

# Test 14: DLX History
test_case "Can retrieve DLX history" \
    'curl -s "http://localhost:8080/chaos/dlx/history?limit=10" | python3 -c "import sys, json; data = json.load(sys.stdin); exit(0 if \"records\" in data else 1)"'

# Test 15: HAProxy Backend Health
test_case "HAProxy shows healthy backends" \
    'curl -s http://localhost:8404/stats | grep -i "rabbit" | grep -q "UP"'

# Summary
echo -e "\n${YELLOW}=== Validation Summary ===${RESET}"
echo -e "Total: $total | ${GREEN}Passed: $passed${RESET} | ${RED}Failed: $failed${RESET}"

if [ "$failed" -eq 0 ]; then
    echo -e "${GREEN}All tests passed! System is production-ready.${RESET}"
    exit 0
else
    echo -e "${RED}$failed tests failed. Review logs for details.${RESET}"
    exit 1
fi
