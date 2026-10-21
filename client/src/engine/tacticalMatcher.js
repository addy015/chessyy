import { Chess } from 'chess.js';

// Converts UCI move string (e.g. 'e2e4') to standard SAN notation (e.g. 'e4')
export function uciToSan(fen, uci) {
  if (!fen || !uci || uci.length < 4) return uci || '—';
  try {
    const game = new Chess(fen);
    const from = uci.substring(0, 2);
    const to = uci.substring(2, 4);
    const promotion = uci.length > 4 ? uci.substring(4, 5) : undefined;
    const m = game.move({ from, to, promotion });
    return m ? m.san : uci;
  } catch (e) {
    return uci;
  }
}

// Standard piece values for material calculation
const PIECE_VALUES = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

// Converts Stockfish centipawn score into winning probability (0.0 to 1.0)
// Matches Python analyzer.py eval_to_win_prob
export function evalToWinProb(evalCp) {
  const clamped = Math.max(-10000, Math.min(10000, evalCp));
  return 1.0 / (1.0 + Math.pow(10.0, -clamped / 400.0));
}

// Converts win probability drop into move accuracy percentage (0% to 100%)
// Standard exponential CAPS model matching Python analyzer.py
export function calculateMoveAccuracy(winProbBefore, winProbAfter) {
  const deltaP = Math.max(0.0, winProbBefore - winProbAfter);
  const deltaPct = deltaP * 100.0;
  const rawAcc = 103.1668 * Math.exp(-0.04354 * deltaPct) - 3.1668;
  return Math.max(0, Math.min(100, Math.round(rawAcc * 10) / 10));
}

// Legacy helper for backward compatibility
export function evalToWinPercent(pawns) {
  return evalToWinProb(pawns * 100) * 100;
}

// Checks if a piece sacrifice occurred (used to detect Brilliant moves)
function isSacrifice(prevFen, playedMove, currentEval, prevEval, isWhiteTurn) {
  if (!playedMove) return false;

  const isPositiveAdvantage = isWhiteTurn ? currentEval >= 1.0 : currentEval <= -1.0;
  if (!isPositiveAdvantage) return false;

  // Eval must not have dropped noticeably
  const evalDelta = isWhiteTurn ? currentEval - prevEval : prevEval - currentEval;
  if (evalDelta < -0.3) return false;

  // Check if player sacrificed a major or minor piece
  const pieceType = playedMove.piece ? playedMove.piece.toLowerCase() : '';
  const pieceVal = PIECE_VALUES[pieceType] || 0;

  // Sacrificed a knight, bishop, rook, or queen
  return pieceVal >= 3;
}

// Checks if the played move left a piece hanging (undefended)
function detectHangingPiece(playedMove, enginePvMove) {
  if (!playedMove) return false;
  // If opponent's immediate engine response captures on the destination square
  if (enginePvMove && enginePvMove.includes(playedMove.to)) {
    return true;
  }
  return false;
}

// Classifies move quality and generates humanized tactical explanation
// Exactly matches Python analyzer.py classification logic & thresholds
export function classifyMove({
  ply,
  move,
  prevEval,
  currEval,
  bestMoveSan,
  bestMoveUci,
  pvLine = [],
  prevFen,
}) {
  const isWhiteTurn = ply % 2 !== 0;

  // Stockfish scores from active mover's perspective (in centipawns)
  const moverCpBefore = isWhiteTurn ? prevEval * 100 : -prevEval * 100;
  const moverCpAfter = isWhiteTurn ? currEval * 100 : -currEval * 100;

  const winProbBefore = evalToWinProb(moverCpBefore);
  const winProbAfter = evalToWinProb(moverCpAfter);

  const deltaP = Math.max(0.0, winProbBefore - winProbAfter);
  const moveAccuracy = calculateMoveAccuracy(winProbBefore, winProbAfter);
  const cpl = Math.max(0, (moverCpBefore - moverCpAfter) / 100);

  // Check for engine best move
  const playedSan = (move.san || '').trim();
  const playedUci = `${move.from || ''}${move.to || ''}`.toLowerCase();
  const cleanBestUci = (bestMoveUci || '').toLowerCase();
  const isEngineTopMove = Boolean(
    (bestMoveSan && playedSan === bestMoveSan.trim()) ||
    (cleanBestUci && (playedUci === cleanBestUci || playedSan === cleanBestUci))
  );

  // 1. Checkmate delivered
  if (playedSan.includes('#')) {
    return {
      ply,
      san: playedSan,
      from: move.from,
      to: move.to,
      color: isWhiteTurn ? 'white' : 'black',
      eval: isWhiteTurn ? 10.0 : -10.0,
      bestMove: playedSan,
      badge: 'BEST',
      cpl: 0,
      accuracy: 100,
      explanation: 'Checkmate! Decisive finish.',
      pv: pvLine,
      isTurningPoint: false,
    };
  }

  // 2. Immediate checkmate allowed
  let allowsMateIn1 = false;
  let opponentMatingMove = '';
  if (prevFen && move) {
    try {
      const g = new Chess(prevFen);
      const mResult = g.move({ from: move.from, to: move.to, promotion: move.promotion });
      if (mResult) {
        const legalMoves = g.moves({ verbose: true });
        for (const opMove of legalMoves) {
          if (opMove.san && opMove.san.includes('#')) {
            allowsMateIn1 = true;
            opponentMatingMove = opMove.san;
            break;
          }
        }
      }
    } catch (e) {}
  }

  if (allowsMateIn1 || (pvLine[0] && pvLine[0].includes('#'))) {
    return {
      ply,
      san: playedSan,
      from: move.from,
      to: move.to,
      color: isWhiteTurn ? 'white' : 'black',
      eval: isWhiteTurn ? -10.0 : 10.0,
      bestMove: bestMoveSan || 'a defensive move',
      badge: 'BLUNDER',
      cpl: 10.0,
      accuracy: 0,
      explanation: opponentMatingMove
        ? `Critical blunder! Allows opponent an immediate forced checkmate with ${opponentMatingMove}.`
        : 'Critical blunder! Allows opponent an immediate forced checkmate.',
      pv: pvLine,
      isTurningPoint: true,
    };
  }

  // 3. Exact matching of Python analyzer.py thresholds
  let badge = 'GOOD';
  let isTurningPoint = false;
  let explanation = '';

  const sacrificed = isSacrifice(prevFen, move, currEval, prevEval, isWhiteTurn);

  if (ply <= 4 && deltaP < 0.04) {
    badge = 'BOOK';
    isTurningPoint = false;
    explanation = 'Standard opening book theory.';
  } else if (sacrificed && deltaP <= 0.03 && winProbAfter >= 0.58) {
    badge = 'BRILLIANT';
    isTurningPoint = true;
    explanation = 'Brilliant move! A piece sacrifice that keeps winning pressure.';
  } else if (isEngineTopMove || deltaP <= 0.015) {
    badge = 'BEST';
    isTurningPoint = false;
    explanation = 'Best move. Finds the most accurate engine continuation.';
  } else if (deltaP <= 0.04) {
    badge = 'EXCELLENT';
    isTurningPoint = false;
    explanation = 'Excellent move. Keeps position sharp and balanced.';
  } else if (deltaP <= 0.08) {
    badge = 'GOOD';
    isTurningPoint = false;
    explanation = 'Solid move. Preserves steady play.';
  } else if (deltaP < 0.16) {
    badge = 'INACCURACY';
    isTurningPoint = false;
    explanation = `Inaccuracy. Slightly loosens position. Preferred was ${bestMoveSan || 'an alternative'}.`;
  } else if (deltaP < 0.30) {
    badge = 'MISTAKE';
    isTurningPoint = true;
    explanation = `Mistake. Concedes ground to opponent. Recommended was ${bestMoveSan || 'an alternative'}.`;
  } else {
    badge = 'BLUNDER';
    isTurningPoint = true;
    if (detectHangingPiece(move, pvLine[0])) {
      const pieceName = move.piece ? move.piece.toUpperCase() : 'piece';
      explanation = `Blunder. Leaves the ${pieceName} on ${move.to} vulnerable to capture. Better was ${bestMoveSan || 'an alternative'}.`;
    } else {
      explanation = `Blunder. Concedes decisive advantage. Better was ${bestMoveSan || 'an alternative'}.`;
    }
  }

  return {
    ply,
    san: playedSan,
    from: move.from,
    to: move.to,
    color: isWhiteTurn ? 'white' : 'black',
    eval: currEval,
    bestMove: bestMoveSan || bestMoveUci || '—',
    badge,
    cpl: Number(cpl.toFixed(2)),
    accuracy: Math.round(moveAccuracy),
    explanation,
    pv: pvLine,
    isTurningPoint,
  };
}

// Analyzes the full game evaluation list and returns complete review metrics
export function buildMatchAnalysis({ parsedMoves = [], evaluations = [], fens = [] }) {
  if (parsedMoves.length === 0 || evaluations.length === 0) {
    return {
      whiteAccuracy: '—',
      blackAccuracy: '—',
      evalGraph: [0.0],
      moves: [],
      turningPoints: [],
    };
  }

  const movesCount = parsedMoves.length;
  const classifiedMoves = [];
  const evalGraph = [0.0];

  let whiteAccSum = 0;
  let whiteAccCount = 0;
  let blackAccSum = 0;
  let blackAccCount = 0;

  for (let i = 0; i < movesCount; i++) {
    const move = parsedMoves[i];
    const prevEvalObj = evaluations[i] || { eval: 0.0 };
    const currEvalObj = evaluations[i + 1] || { eval: prevEvalObj.eval };
    const positionFen = prevEvalObj.fen || (fens && fens[i]) || '';

    const ply = i + 1;
    const isWhite = ply % 2 !== 0;

    const bestUci = prevEvalObj.bestMove || '';
    const bestSan = uciToSan(positionFen, bestUci);

    const classified = classifyMove({
      ply,
      move,
      prevEval: prevEvalObj.eval,
      currEval: currEvalObj.eval,
      bestMoveSan: bestSan,
      bestMoveUci: bestUci,
      pvLine: prevEvalObj.pv,
      prevFen: positionFen,
    });

    classifiedMoves.push(classified);
    evalGraph.push(Number(currEvalObj.eval.toFixed(2)));

    if (isWhite) {
      whiteAccSum += classified.accuracy;
      whiteAccCount++;
    } else {
      blackAccSum += classified.accuracy;
      blackAccCount++;
    }
  }

  const whiteAccuracy = whiteAccCount > 0 ? (whiteAccSum / whiteAccCount).toFixed(1) : '—';
  const blackAccuracy = blackAccCount > 0 ? (blackAccSum / blackAccCount).toFixed(1) : '—';

  // Identify top turning point moves (blunders, mistakes, missed wins) for coach review
  const turningPoints = classifiedMoves
    .filter((m) => ['BLUNDER', 'MISTAKE', 'MISSED_WIN', 'BRILLIANT'].includes(m.badge))
    .slice(0, 4);

  const coachSummary = {
    gameNarrative: `Match concluded with ${movesCount} moves. Both sides fought for the initiative.`,
    whiteTip: whiteAccuracy !== '—' && Number(whiteAccuracy) < 80
      ? 'Focus on developing minor pieces early and guarding key outposts.'
      : 'Solid precision. Maintain tactical awareness when initiating central pawn breaks.',
    blackTip: blackAccuracy !== '—' && Number(blackAccuracy) < 80
      ? 'Look out for early opponent queen incursions and keep your king safe.'
      : 'Strong tactical awareness. Continue punishing opponent inaccuracies efficiently.',
  };

  return {
    whiteAccuracy,
    blackAccuracy,
    evalGraph,
    moves: classifiedMoves,
    turningPoints,
    coachSummary,
  };
}
