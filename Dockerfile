FROM node:20-bookworm-slim

# Install system dependencies: Python3, venv, and Stockfish engine
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    stockfish \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Install Node.js backend dependencies
COPY package*.json ./
RUN npm install --omit=dev

# 2. Install React frontend dependencies & build static bundle (/client/dist)
COPY client/package*.json ./client/
RUN npm --prefix client install
COPY client/ ./client/
RUN npm --prefix client run build && rm -rf ./client/node_modules

# 3. Setup Python virtual environment & install microservice dependencies
COPY ai_service/requirements.txt ./ai_service/
RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir -r ./ai_service/requirements.txt

# 4. Copy remaining application source (server code, assets, scripts)
COPY . .

# Ensure start.sh has Unix line endings and executable permissions
RUN sed -i 's/\r$//' ./start.sh && chmod +x ./start.sh

# Environment defaults
ENV NODE_ENV=production
ENV PYTHON_SERVICE_URL=http://127.0.0.1:8000
ENV STOCKFISH_PATH=/usr/games/stockfish
ENV PATH="/opt/venv/bin:$PATH"
ENV PORT=3000

EXPOSE 3000

CMD ["./start.sh"]
