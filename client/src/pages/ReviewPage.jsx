import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Chess } from 'chess.js';
import Masthead from '../components/common/Masthead';
import Footer from '../components/common/Footer';
import ChessBoard from '../components/board/ChessBoard';
import AccuracyHeader from '../components/review/AccuracyHeader';
import EvalBar from '../components/review/EvalBar';
import StepperControls from '../components/review/StepperControls';
import MoveJournal from '../components/review/MoveJournal';
import SuggestionBox from '../components/review/SuggestionBox';
import CoachCard from '../components/review/CoachCard';
import { downloadMatchPgn } from '../utils/matchExport';
import { useUser } from '../context/UserContext';
import { useSound } from '../context/SoundContext';
import { evaluatePgnPositions, terminateStockfish } from '../engine/stockfishClient';
import { buildMatchAnalysis } from '../engine/tacticalMatcher';

// Fallback sample game if user opens review page without playing a match
const DEMO_PGN = "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#";

// Parses PGN to extract every intermediate FEN position and verbose move object
function parsePositionsFromPgn(pgn) {
  const game = new Chess();
  const fens = [game.fen()];
  const moves = [];

  if (!pgn || !pgn.trim()) {
    return { fens, moves };
  }

  let loaded = false;
  // Try standard PGN loader first
  try {
    if (game.load_pgn) {
      loaded = Boolean(game.load_pgn(pgn, { sloppy: true }));
    } else {
      game.loadPgn(pgn);
      loaded = game.history().length > 0;
    }
  } catch (e) {
    loaded = false;
  }

  // Fallback: Manually tokenize move strings if standard parser failed
  if (!loaded || game.history().length === 0) {
    const cleanPgn = pgn.replace(/\[[\s\S]*?\]/g, '').replace(/\{[\s\S]*?\}/g, '');
    const tokens = cleanPgn.replace(/\d+\./g, '').trim().split(/\s+/);
    game.reset();
    fens.length = 0;
    fens.push(game.fen());
    moves.length = 0;

    tokens.forEach((san) => {
      if (san && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(san)) {
        try {
          const m = game.move(san, { sloppy: true });
          if (m) {
            fens.push(game.fen());
            moves.push({ from: m.from, to: m.to, san: m.san, piece: m.piece });
          }
        } catch (e) {}
      }
    });
  } else {
    // Collect every position by stepping through verbose history
    const historyMoves = game.history({ verbose: true });
    game.reset();
    fens.length = 0;
    fens.push(game.fen());
    moves.length = 0;
    historyMoves.forEach((m) => {
      game.move(m);
      fens.push(game.fen());
      moves.push({ from: m.from, to: m.to, san: m.san, piece: m.piece });
    });
  }

  return { fens, moves };
}

export default function ReviewPage() {
  const { handle: myHandle } = useUser();
  const {
    playMoveSound,
    playCaptureSound,
    playCheckSound,
    playCastleSound,
    playPromoteSound,
  } = useSound();

  // Load player roster saved during the match (or fallback to defaults)
  const [players] = useState(() => {
    try {
      const stored = sessionStorage.getItem('chessyy_review_players');
      return stored ? JSON.parse(stored) : { white: 'WHITE', black: 'BLACK' };
    } catch (e) {
      return { white: 'WHITE', black: 'BLACK' };
    }
  });

  // Load completed match PGN from sessionStorage (falls back to DEMO_PGN if empty)
  const [activePgn] = useState(() => {
    try {
      const stored = sessionStorage.getItem('chessyy_review_pgn');
      if (stored && stored.trim().length > 0) return stored.trim();
      return DEMO_PGN;
    } catch (e) {
      return DEMO_PGN;
    }
  });

  // Parse moves and FEN positions once when PGN loads
  const parsedData = useMemo(() => {
    return parsePositionsFromPgn(activePgn);
  }, [activePgn]);

  const { fens, moves: parsedMoves } = parsedData;

  // Track currently viewed ply (starts at the final move of the game)
  const [currentPly, setCurrentPly] = useState(fens.length - 1);

  // Keep current ply updated whenever moves change
  useEffect(() => {
    setCurrentPly(Math.max(0, fens.length - 1));
  }, [fens.length]);

  // Review perspective: automatically matches the player's role in the game
  // If user played as Black -> 'b' (Black at bottom of board & bottom of eval bar)
  // If user played as White -> 'w' (White at bottom of board & bottom of eval bar)
  const perspective = useMemo(() => {
    try {
      const storedRole = sessionStorage.getItem('chessyy_review_role');
      if (storedRole === 'b' || storedRole === 'w') {
        return storedRole;
      }
    } catch (e) {}

    const black = (players?.black || '').toUpperCase().trim();
    const white = (players?.white || '').toUpperCase().trim();
    const me = (myHandle || '').toUpperCase().trim();

    if (me && black && me === black) return 'b';
    if (me && white && me === white) return 'w';
    return 'w';
  }, [players, myHandle]);

  // Stockfish analysis state
  const [analysisData, setAnalysisData] = useState(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  // Export match as a PGN file
  const handleDownloadPgn = useCallback(() => {
    downloadMatchPgn(activePgn, players, analysisData);
  }, [activePgn, players, analysisData]);

  // Anti-abuse retry counter and cooldown timer for engine analysis
  const [retryCount, setRetryCount] = useState(0);
  const [retryCooldown, setRetryCooldown] = useState(0);
  const MAX_RETRIES = 3;

  // 1-second interval ticker for retry cooldown
  useEffect(() => {
    if (retryCooldown <= 0) return;
    const timer = setInterval(() => {
      setRetryCooldown((v) => Math.max(0, v - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [retryCooldown]);

  // Match the vertical evaluation bar height dynamically to the board wrapper
  const boardWrapperRef = useRef(null);
  const [boardHeight, setBoardHeight] = useState(520);

  useEffect(() => {
    const updateHeight = () => {
      if (boardWrapperRef.current) {
        const h = boardWrapperRef.current.offsetHeight;
        if (h > 0) setBoardHeight(h);
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);

    let observer = null;
    if (window.ResizeObserver && boardWrapperRef.current) {
      observer = new ResizeObserver(updateHeight);
      observer.observe(boardWrapperRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateHeight);
      if (observer) observer.disconnect();
    };
  }, []);

  // Play appropriate sound effect based on SAN notation (+, x, O-O, =)
  const playSoundForPly = useCallback(
    (ply) => {
      if (ply <= 0) return;
      try {
        let san = '';
        if (analysisData?.moves?.[ply - 1]) {
          san = analysisData.moves[ply - 1].san || '';
        } else if (parsedMoves?.[ply - 1]) {
          san = parsedMoves[ply - 1].san || '';
        }

        const isWhite = ply % 2 !== 0;
        if (san.includes('+') || san.includes('#')) {
          playCheckSound();
        } else if (san.includes('x')) {
          playCaptureSound();
        } else if (san.includes('O-O')) {
          playCastleSound();
        } else if (san.includes('=')) {
          playPromoteSound();
        } else {
          playMoveSound(isWhite);
        }
      } catch (e) {
        playMoveSound(true);
      }
    },
    [analysisData, parsedMoves, playCheckSound, playCaptureSound, playCastleSound, playPromoteSound, playMoveSound]
  );

  // Runs deep Stockfish engine evaluation and Gemini AI coach review
  const executeAnalysisFetch = useCallback(async () => {
    if (parsedMoves.length === 0) {
      setIsLoadingAnalysis(false);
      setIsOffline(false);
      setAnalysisData({
        whiteAccuracy: '—',
        blackAccuracy: '—',
        evalGraph: [0.0],
        moves: [],
        coachSummary: {
          gameNarrative: 'No moves were played in this match.',
          whiteTip: 'No moves recorded.',
          blackTip: 'No moves recorded.',
        },
      });
      return;
    }

    setIsLoadingAnalysis(true);
    setIsOffline(false);

    try {
      // 1. Fetch server analysis with automatic retry before falling back
      let response = null;
      let lastFetchErr = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await fetch('/api/game/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pgn: activePgn,
              includeCoach: false,
            }),
          });
          if (response.ok) break;
          throw new Error(`Analyze API returned HTTP ${response.status}`);
        } catch (err) {
          lastFetchErr = err;
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 800));
          }
        }
      }

      if (!response || !response.ok) {
        throw lastFetchErr || new Error('Analyze API request failed');
      }

      const serverData = await response.json();

      // Rule-based tactical explanations (free, instant, zero AI token cost)
      const getMoveExplanation = (m) => {
        const san = m.san || '';
        const best = m.bestMove || '';
        if (san.includes('#')) return 'Checkmate! Decisive finish.';
        if (m.badge === 'BOOK') return 'Standard opening book theory.';
        if (m.badge === 'BRILLIANT') return 'Brilliant move! A piece sacrifice that keeps winning pressure.';
        if (m.badge === 'BEST') return 'Best move. Finds the most accurate engine continuation.';
        if (m.badge === 'BLUNDER') return `Blunder. Concedes decisive advantage. Better was ${best || 'an alternative'}.`;
        if (m.badge === 'MISTAKE') return `Mistake. Concedes ground to opponent. Recommended was ${best || 'an alternative'}.`;
        if (m.badge === 'INACCURACY') return `Inaccuracy. Slightly loosens position. Preferred was ${best || 'an alternative'}.`;
        if (m.badge === 'EXCELLENT') return 'Excellent move. Keeps position sharp and balanced.';
        return 'Solid move. Preserves steady play.';
      };

      // Ensure each move has display-ready fields for journal and suggestion box
      const enrichedMoves = (serverData.moves || []).map((m, idx) => ({
        ...m,
        ply: m.ply || idx + 1,
        color: m.color || (idx % 2 === 0 ? 'white' : 'black'),
        san: m.san,
        bestMove: m.bestMove || '—',
        badge: m.badge || 'GOOD',
        explanation: getMoveExplanation(m),
      }));

      const fullAnalysis = {
        whiteAccuracy: serverData.whiteAccuracy !== undefined ? serverData.whiteAccuracy : '—',
        blackAccuracy: serverData.blackAccuracy !== undefined ? serverData.blackAccuracy : '—',
        evalGraph: Array.isArray(serverData.evalGraph) && serverData.evalGraph.length > 0 ? serverData.evalGraph : [0.0],
        moves: enrichedMoves,
        coachSummary: serverData.coachSummary || {},
      };

      setAnalysisData(fullAnalysis);
      setIsLoadingAnalysis(false);

      // 2. Fetch full Grandmaster debrief narrative based on actual match turning points
      const turningPoints = enrichedMoves
        .filter((m) => m.isTurningPoint || ['BLUNDER', 'MISTAKE', 'MISSED_WIN', 'BRILLIANT'].includes(m.badge))
        .map((m) => ({
          ply: m.ply,
          san: m.san,
          badge: m.badge,
          bestMove: m.bestMove,
        }))
        .slice(0, 4);

      try {
        const debriefRes = await fetch('/api/game/debrief', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            whiteHandle: players?.white || 'WHITE',
            blackHandle: players?.black || 'BLACK',
            whiteAccuracy: fullAnalysis.whiteAccuracy,
            blackAccuracy: fullAnalysis.blackAccuracy,
            opening: 'Standard Opening',
            turningPoints,
          }),
        });

        if (debriefRes.ok) {
          const debriefData = await debriefRes.json();
          setAnalysisData((prev) => ({
            ...prev,
            coachSummary: {
              ...prev?.coachSummary,
              ...debriefData,
            },
          }));
        }
      } catch (debriefErr) {
        console.warn('[ReviewPage] Debrief narrative fetch fallback:', debriefErr);
      }
    } catch (serverErr) {
      console.warn('[ReviewPage] Server Stockfish error, falling back to client evaluation:', serverErr);
      try {
        const evaluations = await evaluatePgnPositions(fens, null, 8);
        const localAnalysis = buildMatchAnalysis({
          parsedMoves,
          evaluations,
          fens,
        });

        // Set local analysis immediately so user can review moves
        setAnalysisData(localAnalysis);
        setIsLoadingAnalysis(false);

        // Still attempt to get GM coach debrief narrative from server if reachable
        try {
          const debriefRes = await fetch('/api/game/debrief', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              whiteHandle: players?.white || 'WHITE',
              blackHandle: players?.black || 'BLACK',
              whiteAccuracy: localAnalysis.whiteAccuracy,
              blackAccuracy: localAnalysis.blackAccuracy,
              opening: 'Standard Opening',
              turningPoints: localAnalysis.turningPoints || [],
            }),
          });
          if (debriefRes.ok) {
            const debriefData = await debriefRes.json();
            setAnalysisData((prev) => ({
              ...prev,
              coachSummary: {
                ...prev?.coachSummary,
                ...debriefData,
              },
            }));
          }
        } catch (debriefErr) {
          console.warn('[ReviewPage] Client fallback debrief narrative fetch error:', debriefErr);
        }
      } catch (clientErr) {
        console.error('[ReviewPage] Both server and client evaluation failed:', clientErr);
        setIsOffline(true);
        setIsLoadingAnalysis(false);
      }
    }
  }, [activePgn, fens, parsedMoves, players]);

  // Clean up Stockfish worker thread when user navigates away
  useEffect(() => {
    return () => {
      terminateStockfish();
    };
  }, []);

  // Trigger analysis on mount
  useEffect(() => {
    executeAnalysisFetch();
  }, [executeAnalysisFetch]);

  // Manual retry
  const handleRetryAnalysis = useCallback(() => {
    if (isLoadingAnalysis || retryCooldown > 0 || retryCount >= MAX_RETRIES) return;

    setRetryCount((prev) => prev + 1);
    setRetryCooldown(5); // 5-second cooldown
    executeAnalysisFetch();
  }, [isLoadingAnalysis, retryCooldown, retryCount, executeAnalysisFetch]);

  // Chess instance showing board state for current ply
  const displayChess = useMemo(() => {
    const c = new Chess();
    if (fens[currentPly]) {
      c.load(fens[currentPly]);
    }
    return c;
  }, [fens, currentPly]);


  const lastMove =
    currentPly > 0 && parsedMoves[currentPly - 1]
      ? { from: parsedMoves[currentPly - 1].from, to: parsedMoves[currentPly - 1].to }
      : null;

  // Move list for journal (enriched with badges once analysis arrives)
  const journalMoves = useMemo(() => {
    if (analysisData?.moves) {
      return analysisData.moves;
    }
    return parsedMoves.map((m, idx) => ({
      ply: idx + 1,
      color: idx % 2 === 0 ? 'white' : 'black',
      san: m.san,
      badge: '...',
    }));
  }, [analysisData, parsedMoves]);

  // Current evaluation score in pawns
  const currentEval = useMemo(() => {
    if (analysisData?.evalGraph && analysisData.evalGraph[currentPly] !== undefined) {
      return analysisData.evalGraph[currentPly];
    }
    return 0.0;
  }, [analysisData, currentPly]);

  // Tactical move details and engine recommendation for the currently selected ply
  const currentMoveInfo = useMemo(() => {
    if (currentPly <= 0) return null;
    if (analysisData?.moves && analysisData.moves[currentPly - 1]) {
      return analysisData.moves[currentPly - 1];
    }
    if (parsedMoves && parsedMoves[currentPly - 1]) {
      const pm = parsedMoves[currentPly - 1];
      return {
        ply: currentPly,
        san: pm.san,
        color: currentPly % 2 !== 0 ? 'white' : 'black',
        eval: currentEval,
        bestMove: '—',
        badge: '...',
        explanation: 'Evaluating move with Stockfish...',
      };
    }
    return null;
  }, [currentPly, analysisData, parsedMoves, currentEval]);

  // Stepper navigation handlers
  const handleStepFirst = () => {
    setCurrentPly(0);
  };

  const handleStepPrev = () => {
    if (currentPly > 0) {
      const nextPly = currentPly - 1;
      setCurrentPly(nextPly);
      playSoundForPly(nextPly);
    }
  };

  const handleStepNext = () => {
    if (currentPly < fens.length - 1) {
      const nextPly = currentPly + 1;
      setCurrentPly(nextPly);
      playSoundForPly(nextPly);
    }
  };

  const handleStepLast = () => {
    const lastPly = fens.length - 1;
    setCurrentPly(lastPly);
    playSoundForPly(lastPly);
  };

  // Jump to specific move clicked in the move journal
  const handleSelectPly = (ply) => {
    setCurrentPly(ply);
    playSoundForPly(ply);
  };


  return (
    <>
      <Masthead />

      <div className="review-layout">
        {/* Header with White & Black Accuracy Pills and PGN Export */}
        <AccuracyHeader
          whiteHandle={players?.white || 'WHITE'}
          blackHandle={players?.black || 'BLACK'}
          whiteAccuracy={analysisData?.whiteAccuracy !== undefined ? analysisData.whiteAccuracy : '—'}
          blackAccuracy={analysisData?.blackAccuracy !== undefined ? analysisData.blackAccuracy : '—'}
          onDownloadPgn={handleDownloadPgn}
        />

        {/* Center Stage: Eval Bar + Chessboard + Stepper */}
        {/* Center Stage: Board Row (Eval Bar + Chessboard) + Full-width Stepper & GM Coach Story */}
        <main className="board-and-eval-container">
          <div className="review-stage-column">
            <div className="review-board-row">
              <EvalBar evalScore={currentEval} height={boardHeight} perspective={perspective} />

              <div className="board-wrapper" ref={boardWrapperRef}>
                <ChessBoard
                  chess={displayChess}
                  playerRole={perspective}
                  selectedSquare={null}
                  possibleMoves={[]}
                  lastMove={lastMove}
                  onSquareClick={null}
                />
              </div>
            </div>

            <StepperControls
              currentPly={currentPly}
              maxPly={fens.length - 1}
              onFirst={handleStepFirst}
              onPrev={handleStepPrev}
              onNext={handleStepNext}
              onLast={handleStepLast}
            />

            <CoachCard
              coachSummary={analysisData?.coachSummary}
              isOffline={isOffline}
              isLoading={isLoadingAnalysis}
            />
          </div>
        </main>

        {/* Right Column: Move Journal & Engine Suggestion */}
        <aside className="review-journal-panel">
          <MoveJournal
            moves={journalMoves}
            currentPly={currentPly}
            maxPly={fens.length - 1}
            onSelectPly={handleSelectPly}
            isLoading={isLoadingAnalysis}
            isOffline={isOffline}
            onRetry={handleRetryAnalysis}
            retryCooldown={retryCooldown}
            retryCount={retryCount}
            maxRetries={MAX_RETRIES}
          />

          <SuggestionBox
            currentPly={currentPly}
            moveInfo={currentMoveInfo}
            maxPly={fens.length - 1}
            currentFen={fens[Math.max(0, currentPly - 1)]}
          />
        </aside>
      </div>
    </>
  );
}
