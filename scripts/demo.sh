#!/usr/bin/env bash
# Demo script - triggers all 7 chaos scenarios via the APIs
CHAOS="http://localhost:8080/chaos"
ORDERS="http://localhost:8090/orders"
PAUSE=8

c() { curl -s -X POST "${CHAOS}/$1" -H "Content-Type: application/json" -d "$2" | python3 -m json.tool; }
o() { curl -s -X POST "${ORDERS}/$1" -H "Content-Type: application/json" -d "$2" | python3 -m json.tool; }

echo "=== STEP 1: Publish 10 orders across all exchanges ==="
o "batch" '{"count":10,"region":"US"}'
sleep $PAUSE

echo "=== STEP 2: Stop payment_consumer_1 - queue accumulates ==="
c "consumer/stop" '{"service":"payment_consumer_1"}'
o "batch" '{"count":20}'
echo "  Waiting 10s - watch dashboard queue depth..."
sleep 10
c "consumer/start" '{"service":"payment_consumer_1"}'
sleep $PAUSE

echo "=== STEP 3: Kill email_consumer - heartbeat timeout → requeue ==="
c "consumer/kill" '{"service":"email_consumer"}'
o "batch" '{"count":10}'
sleep 15
c "consumer/start" '{"service":"email_consumer"}'
sleep $PAUSE

echo "=== STEP 4: Inject poison messages → DLX ==="
c "queue/poison" '{"queue":"payment_queue","count":5}'
sleep $PAUSE

echo "=== STEP 5: Broker crash → HA failover ==="
c "broker/stop" '{"node":"rabbit2"}'
o "batch" '{"count":20}'
sleep 10
c "broker/start" '{"node":"rabbit2"}'
sleep $PAUSE

echo "=== STEP 6: Flood 500 messages ==="
c "queue/flood" '{"exchange":"order.events","count":500}'
sleep $PAUSE

echo "=== STEP 7: Restore all ==="
c "restore-all" '{}'
echo "Demo complete. Open http://localhost:3000"
