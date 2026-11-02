FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ingest ./ingest

# Runs once and exits; compose starts the API only after this succeeds.
CMD ["python", "-m", "ingest.main"]
