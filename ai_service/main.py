"""
CHESSYY AI Microservice (FastAPI Server)

This server runs the Python backend services on internal port 8000:
1. Health check (/api/health): Verifies Stockfish engine and Gemini API availability.
2. Game analysis (/api/analyze-game): Evaluates PGN moves with Stockfish and attaches Gemini coaching explanations.
3. Match debrief (/api/match-debrief): Creates a high-level Grandmaster story and personalized training tips.
4. Interactive coach (/api/ask-coach): Answers student questions about specific moves or positions.
"""

import io
import os
import sys
from contextlib import asynccontextmanager
from typing import Dict, List, Optional, Union
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
from coach import (
    generate_coach_review,
    generate_match_debrief,
    answer_coach_question,
)

# Load environment variables (.env files) from ai_service/ and project root
load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup & shutdown lifecycle handler:
    Runs automatically when the FastAPI server starts up.
    Verifies that the Stockfish engine executable is available on the machine.
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

# CORS setup: Restrict origins to authorized Node.js server and Vite client ports
allowed_origins_env = os.getenv("ALLOWED_ORIGINS")
if allowed_origins_env:
    allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
else:
    allowed_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5000",
        "http://127.0.0.1:5000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# -------------------------------------------------------------------------
# Data Models (Pydantic Schemas)
# Validates the exact structure and types of incoming and outgoing JSON data.
# -------------------------------------------------------------------------

class HealthResponse(BaseModel):
    # Status report returned by the /api/health endpoint
    status: str
    engine: str
    gemini_configured: bool


class AnalyzeGameRequest(BaseModel):
    # Request payload received from Node.js:
    gameId: str = Field(..., max_length=100, pattern=r"^[a-zA-Z0-9_\-\.]{1,100}$", description="Unique match identifier")
    pgn: str = Field(..., max_length=30000, description="Full chess game text in standard PGN format")
    includeCoach: bool = Field(default=False, description="Whether to include Gemini AI coaching explanations")


class MoveAnalysis(BaseModel):
    # Evaluation metrics for a single half-move (ply):
    ply: int
    color: str
    san: str                   # Standard algebraic notation (e.g. 'Nf3', 'e4')
    eval: float                # Position score in pawns (+1.5 = White is ahead by 1.5 pawns)
    bestMove: str              # Optimal move recommended by Stockfish
    badge: str                 # Move badge: BOOK, BRILLIANT, BEST, EXCELLENT, GOOD, INACCURACY, MISTAKE, BLUNDER
    isTurningPoint: bool       # True if the move swung the winning odds significantly
    coachExplanation: Optional[str] = None  # Concise coaching advice from Gemini


class CoachSummary(BaseModel):
    # General strategic tips for both players
    whiteTip: Optional[str] = None
    blackTip: Optional[str] = None


class AnalyzeGameResponse(BaseModel):
    # Complete match analysis package returned to Node.js
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
    Service health check:
    - Returns 200 OK with engine and Gemini status if Stockfish is available.
    - Returns 503 Service Unavailable if Stockfish is missing or cannot be executed.
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
    Full game analysis endpoint:
    1. Validates incoming PGN match text.
    2. Runs Stockfish evaluation across all moves at search depth 12.
    3. Calculates player accuracies, move badges, and evaluation graph.
    4. Optionally requests Gemini AI tactical explanations for turning points.
    5. Returns the complete analysis object to Node.js.
    """
    # 1. Reject empty requests
    if not request.pgn or not request.pgn.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "INVALID_PGN", "detail": "PGN string cannot be empty."}
        )

    # 2. Verify Stockfish engine readiness
    if not engine_manager.is_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "ENGINE_UNAVAILABLE", "detail": "Stockfish binary was not found or failed to start."}
        )

    # 3. Execute Stockfish engine calculations
    try:
        analysis_data = run_engine_analysis(request.pgn.strip(), depth=12)
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "INVALID_PGN", "detail": str(ve)}
        )
    except Exception as e:
        print(f"[AI Service] Analysis execution error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "ANALYSIS_FAILED", "detail": "An internal error occurred during game evaluation."}
        )

    # 4. Generate coaching explanations with Google Gemini if requested
    coach_summary_obj = None
    if request.includeCoach:
        try:
            coach_data = generate_coach_review(
                pgn=request.pgn.strip(),
                moves_data=analysis_data["moves"],
                white_acc=analysis_data["whiteAccuracy"],
                black_acc=analysis_data["blackAccuracy"]
            )
            # Map Gemini explanations to their corresponding blunder moves
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
            # Fall back gracefully so the review still delivers tips even if Gemini fails
            print(f"[AI Service] Coach review generation error: {ce}")
            coach_summary_obj = CoachSummary(
                whiteTip="Focus on opening development and central control.",
                blackTip="Guard weak squares and defend against early queen attacks."
            )

    # 5. Format and return structured response
    moves_output = [MoveAnalysis(**m) for m in analysis_data["moves"]]

    return AnalyzeGameResponse(
        gameId=request.gameId,
        whiteAccuracy=analysis_data["whiteAccuracy"],
        blackAccuracy=analysis_data["blackAccuracy"],
        evalGraph=analysis_data["evalGraph"],
        moves=moves_output,
        coachSummary=coach_summary_obj
    )


# Schema for match debrief request
class MatchDebriefRequest(BaseModel):
    # Player handles or usernames
    whiteHandle: str = "White"
    blackHandle: str = "Black"
    # Overall match accuracies calculated by Stockfish
    whiteAccuracy: Optional[Union[float, str]] = 80.0
    blackAccuracy: Optional[Union[float, str]] = 80.0
    # Opening name played in the match (e.g. 'Italian Game', 'Scholar Mate')
    opening: str = "standard opening"
    # Top turning points (blunders and mistakes, max 4)
    turningPoints: List[dict] = []


# Schema for match debrief response
class MatchDebriefResponse(BaseModel):
    # 2-3 sentence engaging game narrative summarizing how the match was decided
    gameNarrative: str
    # One actionable training tip for White
    whiteTip: str
    # One actionable training tip for Black
    blackTip: str


# Schema for on-demand "Ask Coach Why" question request
class AskCoachRequest(BaseModel):
    # Board position text in standard FEN notation
    fen: str
    # The actual move played in the game (e.g. 'Nf6')
    playedMove: str
    # The best move suggested by Stockfish (e.g. 'g6')
    bestMove: str
    # Engine follow-up moves (principal variation line)
    enginePv: List[str] = []
    # Question asked by the student (or selected quick-question chip)
    userQuestion: str = "Why is this move a mistake?"


# Schema for "Ask Coach Why" answer response
class AskCoachResponse(BaseModel):
    # Instructive, humanized explanation from the Grandmaster coach
    answer: str


@app.post("/api/match-debrief", response_model=MatchDebriefResponse)
def match_debrief(request: MatchDebriefRequest):
    """
    Match Debrief endpoint:
    Called during match review to generate a concise game narrative and personalized training tips.
    Fast, single-call AI pipeline with automatic rule-based fallback.
    """
    try:
        # Request debrief from coach module via Gemini AI
        result = generate_match_debrief(request.model_dump())
        return MatchDebriefResponse(**result)
    except Exception as e:
        # Fallback narrative if AI service encounters an unexpected issue
        print(f"[AI Service] Match debrief error: {e}")
        return MatchDebriefResponse(
            gameNarrative="Both players contested the board with fighting tactical spirit.",
            whiteTip="Maintain active development and keep king safety secured.",
            blackTip="Look for active counter-play and central piece control."
        )


@app.post("/api/ask-coach", response_model=AskCoachResponse)
def ask_coach(request: AskCoachRequest):
    """
    Interactive Ask Coach endpoint:
    Triggered when a user clicks 'Ask Coach Why' for a specific move.
    Provides a quick, simple 2-3 sentence explanation of the tactical nuance.
    """
    try:
        # Request specific move explanation from coach module
        result = answer_coach_question(request.model_dump())
        return AskCoachResponse(**result)
    except Exception as e:
        # Fallback answer explaining the move difference simply
        print(f"[AI Service] Ask coach error: {e}")
        return AskCoachResponse(
            answer=f"Stockfish prefers {request.bestMove} over {request.playedMove} to keep position balance and dynamic play."
        )


# Allows running this service directly with python main.py during local development
if __name__ == "__main__":
    import uvicorn
    # Start ASGI web server listening on localhost port 8000
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
