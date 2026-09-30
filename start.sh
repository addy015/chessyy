#!/bin/bash
set -e

echo "[STARTUP] Starting Python AI Microservice (FastAPI + Stockfish) on 127.0.0.1:8000..."
/opt/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --app-dir ai_service &

# Wait briefly for uvicorn to bind port
sleep 2

echo "[STARTUP] Starting Node.js Web Server on port ${PORT:-3000}..."
exec node app.js
