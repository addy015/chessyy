"""
Chess Game Analyzer (Stockfish Engine Integration)

This module evaluates completed chess games move by move:
1. Runs the Stockfish chess engine to calculate position evaluations.
2. Converts centipawn scores into winning probabilities (0% to 100%).
3. Calculates move accuracy using an exponential curve (similar to Chess.com CAPS).
4. Assigns move badges (Book, Brilliant, Best, Excellent, Good, Inaccuracy, Mistake, Blunder).
5. Detects game turning points where advantage shifted significantly.
6. Generates evaluation graph data points for the frontend review interface.
"""

import io
import math
from typing import Any, Dict, List, Optional, Tuple
import chess
import chess.engine
import chess.pgn

from engine_manager import engine_manager

# Evaluation limits in centipawns (cp):
# Note: 100 centipawns = 1 full pawn advantage.
# 10,000 cp represents a forced checkmate.
MATE_SCORE_CP = 10000.0

# Visual graph cap (+10.0 to -10.0 pawns).
# Keeps the UI graph cleanly bounded without extreme outliers breaking the chart layout.
MAX_DISPLAY_CP = 1000.0


def eval_to_win_prob(eval_cp: float) -> float:
    """
    Converts a Stockfish centipawn score into a winning probability from 0.0 to 1.0.

    Probability guide:
    - 0 cp (equal game) = 0.50 (50% win probability)
    - +400 cp (+4 pawns ahead) = ~0.90 (90% win probability)
    - -400 cp (-4 pawns behind) = ~0.10 (10% win probability)
    """
    # Clamp score to safe math limits to prevent numerical overflow
    clamped_cp = max(-MATE_SCORE_CP, min(MATE_SCORE_CP, eval_cp))
    try:
        return 1.0 / (1.0 + math.pow(10.0, -clamped_cp / 400.0))
    except OverflowError:
        return 0.0 if clamped_cp < 0 else 1.0


def calculate_move_accuracy(win_prob_before: float, win_prob_after: float) -> float:
    """
    Calculates move accuracy percentage (0.0% to 100.0%) based on loss in winning chance.

    - If the best move is played, winning probability drop (delta_p) is 0 -> accuracy ~100%.
    - If a mistake is made, accuracy decays exponentially based on how much winning chance was lost.
    Matches the standard CAPS formula used across modern chess platforms.
    """
    # delta_p = loss in win probability for the player making the move
    delta_p = max(0.0, win_prob_before - win_prob_after)
    delta_pct = delta_p * 100.0

    raw_acc = 103.1668 * math.exp(-0.04354 * delta_pct) - 3.1668
    return max(0.0, min(100.0, round(raw_acc, 1)))


def extract_material_balance(board: chess.Board) -> int:
    """
    Calculates the total material balance on the board:
    Pawn = 1, Knight/Bishop = 3, Rook = 5, Queen = 9.

    Returns:
    - Positive integer if White has more material.
    - Negative integer if Black has more material.
    - 0 if material is completely equal.
    """
    piece_values = {
        chess.PAWN: 1,
        chess.KNIGHT: 3,
        chess.BISHOP: 3,
        chess.ROOK: 5,
        chess.QUEEN: 9,
    }
    total = 0
    for piece_type, value in piece_values.items():
        white_count = len(board.pieces(piece_type, chess.WHITE))
        black_count = len(board.pieces(piece_type, chess.BLACK))
        total += value * (white_count - black_count)
    return total


def classify_move(
    board_before: chess.Board,
    move_played: chess.Move,
    best_engine_move: chess.Move,
    win_prob_before: float,
    win_prob_after: float,
    ply: int,
    is_sacrifice: bool,
) -> Tuple[str, bool]:
    """
    Categorizes a chess move into a standard badge and checks if it was a turning point.

    Definitions:
    - ply: Half-move index (e.g. 1.e4 is ply 1, 1...e5 is ply 2).
    - delta_p: Win probability lost on this move.

    Returns:
    - badge_name: String label (e.g. 'BEST', 'BLUNDER', 'BRILLIANT').
    - is_turning_point: True if this move significantly changed the game outcome.
    """
    delta_p = max(0.0, win_prob_before - win_prob_after)

    # 1. Book: Recognized standard opening moves during the first 4 plies (first 2 turns)
    if ply <= 4 and delta_p < 0.04:
        return "BOOK", False

    # 2. Brilliant: Intentional piece sacrifice that maintains a decisive winning advantage
    if is_sacrifice and delta_p <= 0.03 and win_prob_after >= 0.58:
        return "BRILLIANT", True

    # 3. Best: Played the top engine move or lost practically zero winning probability (<= 1.5%)
    if move_played == best_engine_move or delta_p <= 0.015:
        return "BEST", False

    # 4. Excellent: Very close to the top move, lost less than 4% winning probability
    if delta_p <= 0.04:
        return "EXCELLENT", False

    # 5. Good: Solid practical move, lost less than 8% winning probability
    if delta_p <= 0.08:
        return "GOOD", False

    # 6. Inaccuracy: Minor mistake, lost between 8% and 16% winning probability
    if delta_p < 0.16:
        return "INACCURACY", False

    # 7. Mistake: Noticeable error that damages the position (marked as turning point)
    if delta_p < 0.30:
        return "MISTAKE", True

    # 8. Blunder: Critical game-losing blunder (marked as turning point)
    return "BLUNDER", True


def analyze_game(pgn_str: str, depth: int = 12) -> Dict[str, Any]:
    """
    Full game analysis pipeline:
    1. Parses the PGN game text.
    2. Runs Stockfish at search depth 12 (12 half-moves of forward calculation).
    3. Analyzes each position before and after every move.
    4. Computes player accuracies, badges, turning points, and evaluation graph.

    Returns a structured dictionary formatted for the review page UI.
    """
    pgn_io = io.StringIO(pgn_str.strip())
    game = chess.pgn.read_game(pgn_io)
    if game is None:
        raise ValueError("Invalid PGN: Unable to parse game.")

    board = game.board()
    moves_to_analyze = list(game.mainline_moves())

    # Return default 100% scores if the game contains no moves
    if not moves_to_analyze:
        return {
            "whiteAccuracy": 100.0,
            "blackAccuracy": 100.0,
            "evalGraph": [0.0],
            "moves": [],
        }

    # Start an isolated Stockfish engine process
    engine = engine_manager.spawn_engine()

    try:
        analyzed_moves: List[Dict[str, Any]] = []
        eval_graph: List[float] = [0.2]  # Standard starting chess position has a slight +0.2 White edge
        white_accuracies: List[float] = []
        black_accuracies: List[float] = []

        ply = 1

        # Pre-evaluate initial starting board position once
        info_current = engine.analyse(board, chess.engine.Limit(depth=depth))

        for move in moves_to_analyze:
            is_white = board.turn == chess.WHITE
            mover_color = "white" if is_white else "black"

            # Check material balance before the move is played
            material_before = extract_material_balance(board)

            # Step 1: Reuse pre-computed analysis for position BEFORE move is played (avoids duplicate engine call)
            info_before = info_current
            best_engine_move = info_before["pv"][0] if "pv" in info_before and info_before["pv"] else move

            # Score before move from active player's perspective
            score_mover_before = info_before["score"].relative.score(mate_score=MATE_SCORE_CP)
            if score_mover_before is None:
                score_mover_before = MATE_SCORE_CP if info_before["score"].relative.is_mate() else 0.0

            win_prob_before = eval_to_win_prob(score_mover_before)

            # Convert moves to standard algebraic notation (SAN, e.g. 'Nf3') before pushing move
            best_move_san = board.san(best_engine_move) if best_engine_move in board.legal_moves else best_engine_move.uci()
            san_str = board.san(move)

            # Keep a snapshot of board state before move
            board_prior = board.copy()

            # Execute move on the board
            board.push(move)

            # Step 2: Check if player gave up material without capturing back (Sacrifice)
            material_after = extract_material_balance(board)
            material_diff = (material_after - material_before) if is_white else (material_before - material_after)
            is_sacrifice = material_diff < 0 and not board.is_capture(move)

            # Step 3: Run Stockfish evaluation on position AFTER the move
            info_after = engine.analyse(board, chess.engine.Limit(depth=depth))
            info_current = info_after  # Chain forward so the next ply reuses this result

            # Centipawns from White's perspective (used to draw the evaluation graph)
            score_white = info_after["score"].white().score(mate_score=MATE_SCORE_CP)
            if score_white is None:
                score_white = MATE_SCORE_CP if info_after["score"].white().is_mate() else 0.0

            # Convert centipawns to pawns for display (e.g. +150 cp -> +1.5 pawns)
            eval_pawns = round(max(-MAX_DISPLAY_CP, min(MAX_DISPLAY_CP, score_white)) / 100.0, 2)
            eval_graph.append(eval_pawns)

            # Score after move from mover's perspective (inverted because board.push flipped the active turn)
            score_mover_after = -info_after["score"].relative.score(mate_score=MATE_SCORE_CP)
            win_prob_after = eval_to_win_prob(score_mover_after)

            # Calculate move accuracy percentage
            move_acc = calculate_move_accuracy(win_prob_before, win_prob_after)
            if is_white:
                white_accuracies.append(move_acc)
            else:
                black_accuracies.append(move_acc)

            # Assign badge (Brilliant, Best, Mistake, Blunder, etc.)
            badge, is_turning_point = classify_move(
                board_before=board_prior,
                move_played=move,
                best_engine_move=best_engine_move,
                win_prob_before=win_prob_before,
                win_prob_after=win_prob_after,
                ply=ply,
                is_sacrifice=is_sacrifice,
            )

            analyzed_moves.append({
                "ply": ply,
                "color": mover_color,
                "san": san_str,
                "eval": eval_pawns,
                "bestMove": best_move_san,
                "badge": badge,
                "isTurningPoint": is_turning_point,
                "coachExplanation": None,
            })

            ply += 1

        # Calculate average overall match accuracy for White and Black
        white_acc = round(sum(white_accuracies) / len(white_accuracies), 1) if white_accuracies else 100.0
        black_acc = round(sum(black_accuracies) / len(black_accuracies), 1) if black_accuracies else 100.0

        return {
            "whiteAccuracy": white_acc,
            "blackAccuracy": black_acc,
            "evalGraph": eval_graph,
            "moves": analyzed_moves,
        }

    finally:
        # Always terminate the engine process to release CPU and memory
        engine.quit()
