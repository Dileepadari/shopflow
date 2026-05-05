#!/usr/bin/env bash
# Production teardown script - complete system reset with safety checks
set -e

RESET='\033[0m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'

echo -e "${YELLOW}=== ShopFlow Teardown ===${RESET}"
echo -e "${YELLOW}This will PERMANENTLY delete all containers, volumes, and logs.${RESET}"
echo -e "${RED}WARNING: Data loss - cannot recover after this step.${RESET}"
read -p "Are you sure? (type 'YES' to proceed): " confirm

if [ "$confirm" != "YES" ]; then
    echo "Teardown cancelled."
    exit 0
fi

echo -e "${YELLOW}Stopping all containers...${RESET}"
docker compose down -v --remove-orphans 2>/dev/null || true

echo -e "${YELLOW}Removing logs and data files...${RESET}"
rm -rf logs/*.log logs/*.jsonl logs/*.txt 2>/dev/null || true
mkdir -p logs && touch logs/.gitkeep

echo -e "${YELLOW}Pruning Docker resources...${RESET}"
docker volume prune -f --filter label!=keep 2>/dev/null || true

echo -e "${YELLOW}Verifying cleanup...${RESET}"
REMAINING=$(docker ps -a --filter "label=com.docker.compose.project=shopflow" -q 2>/dev/null | wc -l)

if [ "$REMAINING" -eq 0 ]; then
    echo -e "${GREEN}✓ All ShopFlow containers removed${RESET}"
else
    echo -e "${RED}✗ Warning: $REMAINING containers still running${RESET}"
fi

echo -e "${GREEN}=== Teardown Complete ===${RESET}"
echo "To restart: docker compose up --build"
