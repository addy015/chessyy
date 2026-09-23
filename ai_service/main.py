# What this file does:
# This is the Python web server (built with FastAPI).
# It listens on port 8000 (internally) and waits for requests from Node.js.
# 
# Main jobs:
# 1. Health check: Makes sure Stockfish is installed and Gemini key is configured.
# 2. Game Analysis endpoint (/api/analyze-game):
#    - Receives the chess match moves (PGN).
#    - Calls analyzer.py to run Stockfish calculations.
#    - Calls coach.py to get Gemini AI explanations for blunders.
#    - Sends the complete result back to Node.js as clean JSON.
# -------------------------------------------------------------------------

import io
import os
import sys
from contextlib import asynccontextmanager
from typing import Dict, List, Optional
from pathlib import Path

# Add this ai_service directory to Python's import search path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import chess
import chess.pgn

from engine_manager import engine_manager
from analyzer import analyze_game as run_engine_analysis
from coach import generate_coach_review

# Load environment variables (.env files) from ai_service/ and project root
load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs automatically when the server boots up.
    Checks whether the Stockfish engine file is found so you see a clear warning
    in logs immediately if something is missing.
    """
    if not engine_manager.is_available():
        print("[WARNING] Stockfish binary was not located. Engine analysis will be disabled.")
    else:
        print(f"[AI Service] Connected to engine: {engine_manager.get_engine_name()}")
    yield


app = FastAPI(
    title="CHESSYY AI Microservice",
    description="Stockfish evaluation & Google Gemini coaching for CHESSYY",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS setup: allows Node.js server or frontend to make API calls without being blocked by browser security
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    )


# -------------------------------------------------------------------------
# Data Models (Pydantic Schemas)
# These define and validate the exact shape of incoming and outgoing JSON data.
# -------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status: str
    engine: str
    gemini_configured: bool


class AnalyzeGameRequest(BaseModel):
    # What Node.js sends us to analyze:
    gameId: str = Field(..., description="Unique match identifier")
    pgn: str = Field(..., description="Full chess game text in standard PGN format")
    includeCoach: bool = Field(default=True, description="True if we should ask Gemini for coaching tips")


class MoveAnalysis(BaseModel):
    # Stockfish results for a single move (ply = half-move):
    ply: int
    color: str
    san: str                   # e.g. 'Nf3' or 'e4'
    eval: float                # Score in pawns (+1.5 = White is ahead by 1.5 pawns)
    bestMove: str              # What Stockfish thinks was the best move
    badge: str                 # Badge label: BRILLIANT, BEST, BLUNDER, etc.
    isTurningPoint: bool       # True if the move swung the winning odds significantly
    coachExplanation: Optional[str] = None  # Friendly 1-2 sentence tip from Gemini


class CoachSummary(BaseModel):
    # Overall summary tips for both players
    whiteTip: Optional[str] = None
    blackTip: Optional[str] = None


class AnalyzeGameResponse(BaseModel):
    # Full response package returned to Node.js
    gameId: str
    whiteAccuracy: float
    blackAccuracy: float
    evalGraph: List[float]
    moves: List[MoveAnalysis]
    coachSummary: Optional[CoachSummary] = None


# -------------------------------------------------------------------------
# API Endpoints
# -------------------------------------------------------------------------

@app.get("/api/health", response_model=HealthResponse)
def health_check():
    """
    Checks if the AI service is ready:
    - Returns 200 OK if Stockfish engine is found and working.
    - Returns 503 error if Stockfish is missing.
    """
    if not engine_manager.is_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "ENGINE_UNAVAILABLE", "detail": "Stockfish binary was not found or failed to start."}
        )

    gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

    return HealthResponse(
        status="ok",
        engine=engine_manager.get_engine_name(),
        gemini_configured=bool(gemini_key),
    )


@app.post("/api/analyze-game", response_model=AnalyzeGameResponse)
def analyze_game(request: AnalyzeGameRequest):
    """
    Main analysis pipeline:
    1. Validates that PGN match text is not empty.
    2. Runs Stockfish engine on every move (search depth 12).
    3. Computes accuracy % and move badges (Blunder, Best, Brilliant).
    4. Optionally asks Gemini AI for friendly tactical coaching explanations.
    5. Returns complete report to Node.js.
    """
    # 1. Reject empty requests
    if not request.pgn or not request.pgn.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "INVALID_PGN", "detail": "PGN string cannot be empty."}
        )

    # 2. Ensure Stockfish is ready
    if not engine_manager.is_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "ENGINE_UNAVAILABLE", "detail": "Stockfish binary was not found or failed to start."}
        )

    # 3. Run Stockfish calculations across all moves
    try:
        analysis_data = run_engine_analysis(request.pgn.strip(), depth=12)
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "INVALID_PGN", "detail": str(ve)}
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "ANALYSIS_FAILED", "detail": str(e)}
        )

    # 4. If requested, generate coaching tips with Google Gemini
    coach_summary_obj = None
    if request.includeCoach:
        try:
            coach_data = generate_coach_review(
                pgn=request.pgn.strip(),
                moves_data=analysis_data["moves"],
                white_acc=analysis_data["whiteAccuracy"],
                black_acc=analysis_data["blackAccuracy"]
            )
            # Attach Gemini's explanations to specific blunder moves
            tp_explanations = coach_data.get("turningPoints", {})
            for m in analysis_data["moves"]:
                ply_str = str(m["ply"])
                if ply_str in tp_explanations:
                    m["coachExplanation"] = tp_explanations[ply_str]

            summary_dict = coach_data.get("coachSummary", {})
            coach_summary_obj = CoachSummary(
                whiteTip=summary_dict.get("whiteTip"),
                blackTip=summary_dict.get("blackTip")
            )
        except Exception as ce:
            # If Gemini fails, provide simple fallback tips so user still gets advice
            print(f"[AI Service] Coach review generation error: {ce}")
            coach_summary_obj = CoachSummary(
                whiteTip="Focus on opening development and central control.",
                blackTip="Guard weak squares and defend against early queen attacks."
            )

    # 5. Format and return clean response
    moves_output = [MoveAnalysis(**m) for m in analysis_data["moves"]]

    return AnalyzeGameResponse(
        gameId=request.gameId,
        whiteAccuracy=analysis_data["whiteAccuracy"],
        blackAccuracy=analysis_data["blackAccuracy"],
        evalGraph=analysis_data["evalGraph"],
        moves=moves_output,
        coachSummary=coach_summary_obj
    )


# Allows running this microservice directly during local development
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
