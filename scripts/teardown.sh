#!/usr/bin/env bash
set -e
docker compose down -v --remove-orphans
rm -f logs/*.log logs/*.jsonl
echo "ShopFlow torn down."
