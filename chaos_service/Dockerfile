FROM python:3.11-slim
WORKDIR /app

# Copy parent structure - we need /app/chaos_service/main.py for import to work
COPY . ./chaos_service/

# Set PYTHONPATH so absolute imports like 'from chaos_service...' work
ENV PYTHONPATH=/app:$PYTHONPATH

RUN cd ./chaos_service && \
    pip install --no-cache-dir -r requirements.txt && \
    mkdir -p /app/logs

EXPOSE 8080

# Run from the parent directory so that 'from chaos_service...' imports work
WORKDIR /app
CMD ["uvicorn", "chaos_service.main:app", "--host", "0.0.0.0", "--port", "8080"]
