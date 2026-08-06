# =============================================================================
#  ShopFlow - Python base image
#  Used by: cluster_init, all consumers, producer_api
#  Each docker-compose service sets its own `command:` to choose which
#  module to run.
# =============================================================================
FROM python:3.13-slim

# curl is used by the container healthchecks.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Absolute imports like `from src...` resolve against /app.
ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    LOG_DIR=/app/logs

# Install Python deps first so the layer is cached across source changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/          ./src/
COPY scripts/      ./scripts/
COPY producer_api/ ./producer_api/

# Mount point for the shared_logs volume. Left root-owned: the volume is shared
# with the chaos service, which needs the Docker socket and therefore runs as root.
RUN mkdir -p /app/logs

# Each compose service sets its own command.
CMD ["python", "--version"]
