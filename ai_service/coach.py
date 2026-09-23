# What this file does:
# After a chess match ends, this code reviews the game.
# It looks for blunders and asks Google Gemini to act
# like a friendly chess coach who explains what went wrong in simple terms.
# If Gemini is offline or there is no API key, it has a backup system
# (fallback) so the app never crashes.
# -------------------------------------------------------------------------

import json
import os
from pathlib import Path
from typing import Dict, List, Optional
from dotenv import load_dotenv
from google import genai
from google.genai import types

# Load secret keys (like GEMINI_API_KEY) from .env files.
# Checks both this folder (ai_service/) and the main project root folder.
load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _get_gemini_client() -> Optional[genai.Client]:
    """
    Connects to Google's Gemini AI service.
    
    Checks if an API key exists in your environment settings.
    If no key is found, it returns None (meaning- AI is not available).
    """
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return None
    try:
        # Create and return the official Google GenAI client
        return genai.Client(api_key=api_key)
    except Exception as e:
        print(f"[Coach] Error initializing Gemini client: {e}")
        return None


def _build_rule_based_fallback(turning_points: List[dict], white_acc: float, black_acc: float) -> dict:
    """
    Backup coach (Safety net):
    Used when Gemini AI cannot be reached (e.g., no internet, no API key, or quota limit).
    Instead of crashing or showing an empty screen, it generates simple template
    tips using the numbers and moves Stockfish calculated.
    """
    tp_explanations = {}
    
    for tp in turning_points:
        # 'ply' means a single half-move (e.g., White move 1 is ply 1, Black move 1 is ply 2).
        ply = str(tp.get("ply"))
        color = tp.get("color", "").capitalize()
        # 'san' is the standard chess notation text, like 'Nf3' or 'e4'.
        san = tp.get("san", "")
        badge = tp.get("badge", "MISTAKE")
        best = tp.get("bestMove", "")
        
        tp_explanations[ply] = (
            f"{color} played {san}, marked as {badge}. Engine recommends {best} to preserve tactical balance."
        )

    # Simple advice based on overall player accuracy score (percentage)
    white_tip = (
        "Strong positional discipline maintained throughout."
        if white_acc >= 80 else
        "Look for defensive threats before committing tactical attacks."
    )
    black_tip = (
        "Solid counter-play and piece activity demonstrated."
        if black_acc >= 80 else
        "Watch King safety and avoid unprotected tactical squares in the opening."
    )

    return {
        "turningPoints": tp_explanations,
        "coachSummary": {
            "whiteTip": white_tip,
            "blackTip": black_tip
        }
    }


def generate_coach_review(
    pgn: str,
    moves_data: List[dict],
    white_acc: float,
    black_acc: float
) -> dict:
    """
    Main function called by Node.js server.
    
    Takes:
      - pgn: complete match history text (Portable Game Notation)
      - moves_data: list of all moves with Stockfish scores and badges
      - white_acc / black_acc: accuracy percentage for each player (0 to 100%)
      
    Returns:
      A dictionary with coaching tips for key mistakes and summary advice for both players.
    """
    # 1. Filter out only the critical moments where a player made a serious mistake or blunder.
    turning_points = [
        m for m in moves_data
        if m.get("isTurningPoint") or m.get("badge") in ("BLUNDER", "MISTAKE")
    ]

    # 2. Check if Gemini AI is connected. If not, use our backup template tips immediately.
    client = _get_gemini_client()
    if not client:
        return _build_rule_based_fallback(turning_points, white_acc, black_acc)

    # 3. Prepare a summary of up to 6 big mistakes so we don't overload the AI prompt.
    tp_summary_lines = []
    for tp in turning_points[:6]:
        tp_summary_lines.append(
            f"- Ply {tp['ply']} ({tp['color'].upper()}): played {tp['san']} [{tp['badge']}]. "
            f"Stockfish evaluation: {tp.get('eval', 0.0):+.2f}. Best alternative was {tp.get('bestMove', 'unknown')}."
        )
    tp_context = "\n".join(tp_summary_lines) if tp_summary_lines else "No major blunders detected."

    # 4. Instructions sent to Gemini: keep explanations brief, direct, and return clean JSON.
    prompt = f"""You are an elite Grandmaster Chess Coach for CHESSYY. Your tone is direct, sharp, and easy to understand. No fluff, no robotic filler.

Match PGN:
{pgn}

Stockfish Match Accuracies:
- White Accuracy: {white_acc:.1f}%
- Black Accuracy: {black_acc:.1f}%

Critical Turning Points:
{tp_context}

Task:
1. For each turning point, explain in 1-2 simple, punchy sentences:
   - Exactly what went wrong (e.g., hanging piece, missed fork, pin, lost tempo, or weakened king).
   - Why the best move works better.
2. Give one practical, actionable tip for White (whiteTip) and Black (blackTip).

Return strictly valid JSON conforming to this schema:
{{
  "turningPoints": {{
    "<ply_number>": "1-2 sentence tactical breakdown"
  }},
  "coachSummary": {{
    "whiteTip": "Actionable strategic lesson for White.",
    "blackTip": "Actionable strategic lesson for Black."
  }}
}}
"""

    # 5. List of current Gemini models to try in order
    models_to_try = [
        "gemini-3.8-flash",
        "gemini-3.5-flash-lite",
        "gemini-flash-latest"
    ]
    for model in models_to_try:
        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.2,
                )
            )
            raw_text = response.text.strip()
            data = json.loads(raw_text)
            if "turningPoints" in data and "coachSummary" in data:
                return data
        except Exception as e:
            print(f"[Coach] Model {model} attempt failed: {e}")
            continue

    # 6. If all AI models fail or time out, fall back safely to our local rule-based tips
    return _build_rule_based_fallback(turning_points, white_acc, black_acc)
