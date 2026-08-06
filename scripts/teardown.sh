#!/usr/bin/env bash
# Complete reset: removes ShopFlow's containers, volumes and log files.
#
# Also the correct first step when upgrading RabbitMQ - a 4.x node will not
# boot on data written by 3.13.
set -uo pipefail

RESET='\033[0m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'

cd "$(dirname "$0")/.." || exit 1

printf "${YELLOW}=== ShopFlow teardown ===${RESET}\n"
printf "This removes every ShopFlow container, its named volumes (including all\n"
printf "queued messages and cluster state) and the contents of logs/.\n"
printf "${RED}This cannot be undone.${RESET}\n\n"

if [ "${1:-}" != "--yes" ]; then
    read -r -p "Type YES to proceed: " confirm
    if [ "$confirm" != "YES" ]; then
        echo "Cancelled."
        exit 0
    fi
fi

printf "\n${YELLOW}Stopping containers and removing volumes...${RESET}\n"
# `down -v` already removes this project's named volumes. A global
# `docker volume prune` would also delete unrelated projects' volumes.
docker compose down -v --remove-orphans

printf "${YELLOW}Clearing local logs...${RESET}\n"
find logs -type f ! -name '.gitkeep' -delete 2>/dev/null || true
mkdir -p logs && touch logs/.gitkeep

printf "${YELLOW}Verifying...${RESET}\n"
project=$(basename "$PWD")
remaining=$(docker ps -a --filter "label=com.docker.compose.project=$project" -q 2>/dev/null | wc -l)

if [ "$remaining" -eq 0 ]; then
    printf "${GREEN}  All ShopFlow containers removed.${RESET}\n"
else
    printf "${RED}  %s container(s) still present.${RESET}\n" "$remaining"
fi

printf "\n${GREEN}=== Teardown complete ===${RESET}\n"
printf "To start again: docker compose up --build -d\n"
