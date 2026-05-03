#!/usr/bin/env bash
# Real-time system monitoring — watch metrics and queue depths
# Press Ctrl+C to exit

RESET='\033[0m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'

clear_screen() {
    clear
}

show_header() {
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${RESET}"
    echo -e "${CYAN}║         ShopFlow Real-Time Monitoring Dashboard                ║${RESET}"
    echo -e "${CYAN}║         $(date '+%Y-%m-%d %H:%M:%S')                               ║${RESET}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${RESET}"
}

show_cluster_health() {
    echo -e "\n${YELLOW}=== CLUSTER HEALTH ===${RESET}"
    curl -s -u admin:shopflow123 http://localhost:15672/api/nodes | python3 << 'EOF'
import sys, json
nodes = json.load(sys.stdin)
for node in sorted(nodes, key=lambda x: x['name']):
    name = node['name'].replace('rabbit@', '')
    status = 'UP' if node['running'] else 'DOWN'
    memory = node.get('mem_used', 0) / 1024 / 1024
    print(f"  {name:12} | Memory: {memory:6.1f} MB | {status}")
EOF
}

show_queue_depths() {
    echo -e "\n${YELLOW}=== QUEUE DEPTHS ===${RESET}"
    curl -s -u admin:shopflow123 http://localhost:15672/api/queues/shopflow | python3 << 'EOF'
import sys, json
queues = sorted(json.load(sys.stdin), key=lambda x: x['messages'], reverse=True)
for q in queues[:10]:
    name = q['name'][:25]
    messages = q.get('messages', 0)
    ready = q.get('messages_ready', 0)
    unacked = q.get('messages_unacked', 0)
    consumers = q.get('consumer_details', [])
    print(f"  {name:25} | Total: {messages:5} | Ready: {ready:5} | Unacked: {unacked:5} | Consumers: {len(consumers)}")
EOF
}

show_consumer_status() {
    echo -e "\n${YELLOW}=== ACTIVE CONSUMERS ===${RESET}"
    curl -s -u admin:shopflow123 http://localhost:15672/api/consumers/shopflow | python3 << 'EOF'
import sys, json
consumers = json.load(sys.stdin)
queues = {}
for c in consumers:
    q = c.get('queue', {}).get('name', 'unknown')
    if q not in queues:
        queues[q] = 0
    queues[q] += 1

for q, count in sorted(queues.items()):
    print(f"  {q:30} | {count} active consumer(s)")
EOF
}

show_message_stats() {
    echo -e "\n${YELLOW}=== MESSAGE STATISTICS ===${RESET}"
    curl -s -u admin:shopflow123 http://localhost:15672/api/overview | python3 << 'EOF'
import sys, json
overview = json.load(sys.stdin)
q = overview.get('queue_totals', {})
print(f"  Total Messages Ready: {q.get('messages_ready', 0)}")
print(f"  Total Messages Unacked: {q.get('messages_unacked', 0)}")
print(f"  Total Consumers: {q.get('consumers', 0)}")
print(f"  Message Rate (avg): {overview.get('queue_totals', {}).get('messages_unacked', 0)} msg/sec")
EOF
}

show_help() {
    echo -e "\n${CYAN}Commands:${RESET}"
    echo "  q  — Quit"
    echo "  r  — Refresh now"
    echo "  h  — Show help"
}

# Main loop
echo -e "${GREEN}ShopFlow Monitor Started${RESET}"
echo "Press Ctrl+C to exit, or 'h' for help"
sleep 2

while true; do
    clear_screen
    show_header
    show_cluster_health
    show_queue_depths
    show_consumer_status
    show_message_stats
    
    echo -e "\n${CYAN}Next refresh in 5 seconds... (Press Enter to refresh now, Ctrl+C to exit)${RESET}"
    
    # Simple timeout for user input
    if read -t 5 -n 1 input; then
        case "$input" in
            q|Q) echo -e "${GREEN}Exiting...${RESET}"; exit 0 ;;
            r|R) continue ;;
            h|H) show_help ;;
        esac
    fi
done
