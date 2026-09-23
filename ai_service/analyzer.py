# What this file does:
# This is the chess analysis brain.
# It runs Stockfish to evaluate every move played in a game.
# It calculates:
# 1. Who is winning and by how much (eval score in pawns).
# 2. Winning probability (chance of winning from 0% to 100%).
# 3. Accuracy percentage for each player (like Chess.com CAPS score).
# 4. Move badges: Brilliant, Best, Mistake, Blunder, etc.
# 5. Data points to draw the evaluation graph on the screen.
# -------------------------------------------------------------------------

import io
import math
from typing import Any, Dict, List, Optional, Tuple
import chess
import chess.engine
import chess.pgn

from engine_manager import engine_manager

# Evaluation limits (in centipawns):
# Note: 'centipawn' (cp) is the unit chess engines use.
# 100 centipawns = 1 full pawn advantage.
# 10000 cp represents a forced checkmate.
MATE_SCORE_CP = 10000.0

# 1000 cp = 10 pawns. We cap the visual graph here so it doesn't break UI layout.
MAX_DISPLAY_CP = 1000.0


def eval_to_win_prob(eval_cp: float) -> float:
    """
    Converts a Stockfish centipawn score into a winning probability (0.0 to 1.0).
    
    Formula explanation:
    - 0 centipawns (equal game) = 0.50 (50% chance to win).
    - +400 centipawns (+4 pawns lead) = ~0.90 (90% chance to win).
    - -400 centipawns (-4 pawns behind) = ~0.10 (10% chance to win).
    """
    # Keep the score within safe math limits to prevent overflow
    clamped_cp = max(-MATE_SCORE_CP, min(MATE_SCORE_CP, eval_cp))
    try:
        return 1.0 / (1.0 + math.pow(10.0, -clamped_cp / 400.0))
    except OverflowError:
        return 0.0 if clamped_cp < 0 else 1.0


def calculate_move_accuracy(win_prob_before: float, win_prob_after: float) -> float:
    """
    Calculates move accuracy percentage (0% to 100%) based on how much winning chance was lost.
    
    If you played the best move, win probability drop (delta_p) is 0, so accuracy is ~100%.
    If you made a blunder and dropped your winning chance from 80% to 20%, accuracy drops sharply.
    This uses the standard exponential curve similar to Chess.com's CAPS system.
    """
    # delta_p = loss in winning chance (never negative)
    delta_p = max(0.0, win_prob_before - win_prob_after)
    delta_pct = delta_p * 100.0

    raw_acc = 103.1668 * math.exp(-0.04354 * delta_pct) - 3.1668
    return max(0.0, min(100.0, round(raw_acc, 1)))


def extract_material_balance(board: chess.Board) -> int:
    """
    Counts total piece values on the board:
    Pawn = 1, Knight/Bishop = 3, Rook = 5, Queen = 9.
    
    Returns:
    - Positive number if White has more pieces.
    - Negative number if Black has more pieces.
    - 0 if material is equal.
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
    Tags a move with a badge (e.g. BEST, BLUNDER, BRILLIANT).
    
    Terms:
    - ply: A half-move (Move 1 by White is ply 1, Move 1 by Black is ply 2).
    - delta_p: How much winning chance dropped after this move.
    
    Returns:
    - badge_name: string label for the move.
    - is_turning_point: True if this move changed the course of the match.
    """
    delta_p = max(0.0, win_prob_before - win_prob_after)

    # 1. Book Moves: Standard recognized opening moves in the first 4 plies (first 2 full turns).
    if ply <= 4 and delta_p < 0.04:
        return "BOOK", False

    # 2. Brilliant: Player sacrificed material on purpose, but still kept a winning advantage!
    if is_sacrifice and delta_p <= 0.03 and win_prob_after >= 0.58:
        return "BRILLIANT", True

    # 3. Best: Played the exact move recommended by Stockfish or lost virtually no winning chance.
    if move_played == best_engine_move or delta_p <= 0.015:
        return "BEST", False

    # 4. Excellent: Very close to the best move, lost less than 4% winning chance.
    if delta_p <= 0.04:
        return "EXCELLENT", False

    # 5. Good: Decent move, lost under 8% winning chance.
    if delta_p <= 0.08:
        return "GOOD", False

    # 6. Inaccuracy: Small slip, lost between 8% and 16% winning chance.
    if delta_p < 0.16:
        return "INACCURACY", False

    # 7. Mistake: Significant error that hurts the position (flagged as turning point).
    if delta_p < 0.30:
        return "MISTAKE", True

    # 8. Blunder: Game-losing mistake, threw away a big advantage (flagged as turning point).
    return "BLUNDER", True


def analyze_game(pgn_str: str, depth: int = 12) -> Dict[str, Any]:
    """
    Main analysis pipeline:
    1. Reads the match moves (PGN string).
    2. Runs Stockfish engine at search depth 12 (searches 12 moves ahead).
    3. Evaluates every position before and after each move.
    4. Computes accuracy, badges, and evaluation curve.
    
    Returns complete report ready for the web UI.
    """
    pgn_io = io.StringIO(pgn_str.strip())
    game = chess.pgn.read_game(pgn_io)
    if game is None:
        raise ValueError("Invalid PGN: Unable to parse game.")

    board = game.board()
    moves_to_analyze = list(game.mainline_moves())

    # Return default 100% scores if game had no moves
    if not moves_to_analyze:
        return {
            "whiteAccuracy": 100.0,
            "blackAccuracy": 100.0,
            "evalGraph": [0.0],
            "moves": [],
        }

    # Start a Stockfish engine instance
    engine = engine_manager.spawn_engine()

    try:
        analyzed_moves: List[Dict[str, Any]] = []
        eval_graph: List[float] = [0.2]  # Initial starting board has tiny +0.2 white advantage
        white_accuracies: List[float] = []
        black_accuracies: List[float] = []

        ply = 1

        for move in moves_to_analyze:
            is_white = board.turn == chess.WHITE
            mover_color = "white" if is_white else "black"

            # Check material balance before the move
            material_before = extract_material_balance(board)

            # Step A: Ask Stockfish what the best move is BEFORE this move is played
            info_before = engine.analyse(board, chess.engine.Limit(depth=depth))
            best_engine_move = info_before["pv"][0] if "pv" in info_before and info_before["pv"] else move

            # Score before move from the active player's viewpoint
            score_mover_before = info_before["score"].relative.score(mate_score=MATE_SCORE_CP)
            if score_mover_before is None:
                score_mover_before = MATE_SCORE_CP if info_before["score"].relative.is_mate() else 0.0

            win_prob_before = eval_to_win_prob(score_mover_before)

            # Pre-compute standard chess move text (SAN, like 'Nf3') before applying move
            best_move_san = board.san(best_engine_move) if best_engine_move in board.legal_moves else best_engine_move.uci()
            san_str = board.san(move)

            # Copy board to remember position before move
            board_prior = board.copy()

            # Play the move on the board
            board.push(move)

            # Step B: Check if player gave away a piece without capturing one back (Sacrifice)
            material_after = extract_material_balance(board)
            material_diff = (material_after - material_before) if is_white else (material_before - material_after)
            is_sacrifice = material_diff < 0 and not board.is_capture(move)

            # Step C: Ask Stockfish to evaluate the position AFTER the move
            info_after = engine.analyse(board, chess.engine.Limit(depth=depth))

            # Centipawns from White's perspective (used to plot the evaluation graph)
            score_white = info_after["score"].white().score(mate_score=MATE_SCORE_CP)
            if score_white is None:
                score_white = MATE_SCORE_CP if info_after["score"].white().is_mate() else 0.0

            # Convert centipawns to pawns for display (e.g. +150 cp becomes +1.5 pawns)
            eval_pawns = round(max(-MAX_DISPLAY_CP, min(MAX_DISPLAY_CP, score_white)) / 100.0, 2)
            eval_graph.append(eval_pawns)

            # Score after move from the mover's viewpoint
            # Note: because board.push() flipped the turn to opponent, relative score is inverted
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

        # Calculate average overall match accuracy for each player
        white_acc = round(sum(white_accuracies) / len(white_accuracies), 1) if white_accuracies else 100.0
        black_acc = round(sum(black_accuracies) / len(black_accuracies), 1) if black_accuracies else 100.0

        return {
            "whiteAccuracy": white_acc,
            "blackAccuracy": black_acc,
            "evalGraph": eval_graph,
            "moves": analyzed_moves,
        }

    finally:
        # Always close Stockfish engine process to free CPU and RAM
        engine.quit()
