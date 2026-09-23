# Chessyy ♟️

A real-time multiplayer chess platform with a clean, Swiss-editorial newspaper aesthetic, built-in live chat, Stockfish position evaluations, and post-match coaching powered by Google Gemini.

---

## What is this?

Chessyy is a full-stack chess web app built for people who appreciate thoughtful typography and minimalism just as much as good chess games.

Instead of heavy client-side frameworks, it uses clean server-rendered EJS templates, vanilla JavaScript modules, and WebSockets for instantaneous move synchronization. When the match ends, an isolated Python microservice analyzes the game using the Stockfish chess engine and asks Gemini to write tailored feedback highlighting where things went right or wrong.

---

## Highlights

- **Real-Time Multiplayer**: Instant matchmaking over WebSockets (Socket.io). Room assignments, turns, legal move validation via `chess.js`, and check/checkmate detection handled on the server.
- **In-Game Live Chat**: Ephemeral, RAM-only chat with quick reaction buttons (`GL`, `SHARP`, `GG`, `TENSION`). Messages vanish when the game room closes—no unnecessary database footprint.
- **Post-Game Analysis**:
  - **Stockfish Engine Evaluation**: Calculates overall accuracy scores for both players and tags every single ply (`Brilliant`, `Best`, `Excellent`, `Inaccuracy`, `Mistake`, `Blunder`).
  - **Dynamic Eval Bar**: Real-time visual balance indicator showing positional advantage.
  - **AI Coach (Google Gemini)**: Analyzes the game's turning point and offers concrete tips for White and Black.
  - **Move Replay Stepper**: Step back and forth through the game move-by-move with on-screen controls or keyboard arrow shortcuts.
- **Editorial Design System**: Typography-driven design using Space Grotesk, Inter, and JetBrains Mono, warm newsprint palette, and crisp 1px borders.

---

## Architecture Overview

Chessyy runs as two cooperative services (packaged together in a single container for lightweight hosting):

```text
[ Browser / Client ]
      │
      ├── Socket.io (WebSocket) ──► Node.js / Express Server (Port 3000)
      │                             ├── Matchmaking & Active Game Rooms
      │                             ├── Move Validation (chess.js)
      │                             └── Ephemeral Chat Memory
      │
      └── HTTP /api/game/analyze ──► Python AI Microservice (FastAPI, Port 8000)
                                    ├── Stockfish UCI Engine (Move by Move)
                                    └── Google Gemini (Coach Narrative & Tips)
```

---

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES Modules), HTML5 / EJS, CSS3 (Custom design system).
- **Backend**: Node.js, Express, Socket.io, `chess.js`.
- **AI Microservice**: Python 3.11+, FastAPI, Uvicorn, `python-chess`, `google-genai`.
- **Engine**: Stockfish 17 (UCI binary).
- **Deployment**: Single unified Docker container running both Node and Python under a lightweight startup script.

---

## Local Development Setup

### 1. Prerequisites
- **Node.js** (v18 or higher)
- **Python** (v3.11 or higher)
- **Stockfish**: A Stockfish binary placed in `ai_service/bin/stockfish/` or installed on your system PATH.
- **Gemini API Key**: From [Google AI Studio](https://aistudio.google.com/).

### 2. Clone & Install Node Dependencies
```bash
git clone https://github.com/your-username/chessyy.git
cd chessyy
npm install
```

### 3. Setup Python AI Service
```bash
cd ai_service
python -m venv .venv

# On Windows:
.venv\Scripts\activate
# On Linux / macOS:
source .venv/bin/activate

pip install -r requirements.txt
cd ..
```

### 4. Configure Environment
Create a `.env` file in the root directory:
```env
PORT=3000
AI_SERVICE_URL=http://127.0.0.1:8000
GEMINI_API_KEY=your_gemini_api_key_here
```

### 5. Run Locally
You can run both the Node server and Python AI service concurrently with:
```bash
npm run dev:all
```

Then open `http://localhost:3000` in two browser windows to test multiplayer matchmaking.

---

## Production / Docker Deployment

Chessyy includes a multi-stage `Dockerfile` configured to compile Stockfish from source and run both the Node app and FastAPI service in a single container:

```bash
# Build Docker image
docker build -t chessyy .

# Run container locally
docker run -p 3000:3000 -e GEMINI_API_KEY=your_gemini_api_key_here chessyy
```

---

## License

ISC License. Feel free to tweak, build upon, or learn from the code!