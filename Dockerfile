FROM node:20-bookworm-slim

# Install system dependencies: Python3, venv, and Stockfish engine
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    stockfish \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Install Node.js dependencies
COPY package*.json ./
RUN npm install --omit=dev

# 2. Setup Python virtual environment & install microservice dependencies
COPY ai_service/requirements.txt ./ai_service/
RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir -r ./ai_service/requirements.txt

# 3. Copy application source
COPY . .

# Ensure start.sh has Unix line endings and executable permissions
RUN sed -i 's/\r$//' ./start.sh && chmod +x ./start.sh

# Environment defaults
ENV PYTHON_SERVICE_URL=http://127.0.0.1:8000
ENV STOCKFISH_PATH=/usr/games/stockfish
ENV PATH="/opt/venv/bin:$PATH"
ENV PORT=3000

EXPOSE 3000

CMD ["./start.sh"]
