#!/usr/bin/env bash
# Health check script - verify all services are operational
set -e

RESET='\033[0m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'

echo -e "${YELLOW}=== ShopFlow Health Check ===${RESET}\n"

check_service() {
    local name=$1
    local url=$2
    local expected_code=$3
    
    if [ -z "$expected_code" ]; then
        expected_code=200
    fi
    
    local response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    
    if [ "$response" = "$expected_code" ]; then
        echo -e "${GREEN}✓${RESET} $name ($url) - $response"
        return 0
    else
        echo -e "${RED}✗${RESET} $name ($url) - Expected $expected_code, got $response"
        return 1
    fi
}

check_docker() {
    local service=$1
    if docker compose ps "$service" 2>/dev/null | grep -q "Up"; then
        echo -e "${GREEN}✓${RESET} $service - Running"
        return 0
    else
        echo -e "${RED}✗${RESET} $service - Not running or unhealthy"
        return 1
    fi
}

# Check Docker services
echo "🐳 Docker Services:"
check_docker "rabbit1"
check_docker "rabbit2"
check_docker "rabbit3"
check_docker "haproxy"
check_docker "producer_api"
check_docker "chaos_service"
check_docker "frontend"
check_docker "payment_consumer_1"
check_docker "inventory_consumer_1"
check_docker "email_consumer"
check_docker "sms_consumer"
check_docker "push_consumer"

# Check HTTP endpoints
echo -e "\n🌐 HTTP Endpoints:"
check_service "Producer API" "http://localhost:8090/health" 200
check_service "Chaos Service" "http://localhost:8080/health" 200
check_service "Frontend" "http://localhost:3000" 200
check_service "RabbitMQ Mgmt" "http://localhost:15672/api/overview" 401

# Check RabbitMQ API (with credentials)
echo -e "\n🐰 RabbitMQ Status:"
NODES=$(curl -s -u admin:shopflow123 http://localhost:15672/api/nodes | python3 -c "import sys, json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
if [ "$NODES" = "3" ]; then
    echo -e "${GREEN}✓${RESET} 3-node cluster healthy"
else
    echo -e "${RED}✗${RESET} Cluster has $NODES nodes (expected 3)"
fi

QUEUES=$(curl -s -u admin:shopflow123 "http://localhost:15672/api/queues/shopflow" | python3 -c "import sys, json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
echo -e "${GREEN}✓${RESET} $QUEUES queues declared"

# Check HAProxy
echo -e "\n⚖️  HAProxy:"
BACKENDS=$(curl -s http://localhost:8404/stats | grep -c "rabbit" || echo "0")
if [ "$BACKENDS" -gt 0 ]; then
    echo -e "${GREEN}✓${RESET} $BACKENDS RabbitMQ nodes in load balancer"
else
    echo -e "${RED}✗${RESET} HAProxy backend nodes not found"
fi

echo -e "\n${GREEN}=== Health Check Complete ===${RESET}"
