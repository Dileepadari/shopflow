# =============================================================================
#  ShopFlow - Chaos Control Panel image
#  Builds from the repository root so it can share src/ with the other services.
#  That sharing is deliberate: this service used to reimplement connection,
#  config and message-building logic because it could not import src/.
# =============================================================================
FROM python:3.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    LOG_DIR=/app/logs

COPY requirements.txt ./requirements.txt
COPY chaos_service/requirements.txt ./chaos-requirements.txt
RUN pip install --no-cache-dir -r requirements.txt -r chaos-requirements.txt

COPY src/           ./src/
COPY chaos_service/ ./chaos_service/

RUN mkdir -p /app/logs

EXPOSE 8080

CMD ["uvicorn", "chaos_service.main:app", "--host", "0.0.0.0", "--port", "8080"]
