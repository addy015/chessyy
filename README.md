# Chessyy ♟️

A real-time multiplayer chess platform with a high-contrast editorial aesthetic, 30-second reconnection grace period, Stockfish move evaluation, and AI post-match coaching powered by Google Gemini.

---

## Features

- **Multiplayer & Private Rooms**: Quick matchmaking across Bullet, Blitz, and Rapid time controls, plus custom private rooms for friends.
- **30-Second Reconnection Grace Period**: Match state, clocks, and chat survive page refreshes and momentary network drops without immediate abandonment.
- **Stockfish Engine Review**: Move-by-move evaluation, accuracy ratings, eval graph, and blunder/mistake classification.
- **AI Coach (Google Gemini)**: Post-match turning point analysis and tactical feedback.
- **Export & Share**: 1-click official `.pgn` export and downloadable 1200×675 match summary card for Twitter/X, Discord, and WhatsApp.
- **In-Game Chat**: Ephemeral, RAM-only live chat with quick reaction shortcuts.

---

## Tech Stack

- **Frontend**: React 18, Vite, Vanilla CSS (Editorial Design System), `chess.js`.
- **Backend**: Node.js, Express, Socket.io (WebSocket game loop & clocks).
- **AI Microservice**: Python 3.11+, FastAPI, Uvicorn, `python-chess`, `google-genai`.
- **Engine**: Stockfish UCI binary.
- **Deployment**: Unified Docker container running Node and Python on Render.com (`render.yaml`).

---

## Quickstart

### 1. Prerequisites
- **Node.js** (v18+)
- **Python** (v3.11+)
- **Stockfish** (Installed on PATH or system binary)
- **Gemini API Key** (From [Google AI Studio](https://aistudio.google.com/))

### 2. Install Dependencies

```bash
# Node backend & React frontend
npm install
npm --prefix client install

# Python AI microservice
cd ai_service
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

### 3. Environment Variables
Create a `.env` in the root:

```env
PORT=3000
GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. Run Locally

```bash
npm run dev:all
```

- Web App: `http://localhost:5173` (Vite dev) or `http://localhost:3000` (Node)
- AI Service: `http://127.0.0.1:8000`

---

## Docker Deployment (Render.com)

Ready for 1-click deployment on Render using Docker:

```bash
docker build -t chessyy .
docker run -p 3000:3000 -e GEMINI_API_KEY=your_key chessyy
```

---

## License
ISC