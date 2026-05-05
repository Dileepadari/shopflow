# =============================================================================
#  ShopFlow - Python base image
#  Used by: cluster_init, all consumers, producer_api, locust
#  Each docker-compose service sets its own `command:` to choose which
#  module to run.
# =============================================================================
FROM python:3.11-slim

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set PYTHONPATH so absolute imports like 'from src...' work
ENV PYTHONPATH=/app:$PYTHONPATH

# Install Python deps first (layer-cached)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project source
COPY src/       ./src/
COPY scripts/   ./scripts/
COPY producer_api/ ./producer_api/

# Create logs directory inside container
RUN mkdir -p /app/logs

# Default: nothing - each service sets its own command
CMD ["python", "--version"]
