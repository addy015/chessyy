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

const DEMO_PGN = "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#";

function parsePositionsFromPgn(pgn) {
  const game = new Chess();
  const fens = [game.fen()];
  const moves = [];

  if (!pgn || !pgn.trim()) {
    return { fens, moves };
  }

  let loaded = false;
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

  if (!loaded || game.history().length === 0) {
    const cleanPgn = pgn.replace(/\[.*?\]/g, '').replace(/\{.*?\}/g, '');
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
            moves.push({ from: m.from, to: m.to, san: m.san });
          }
        } catch (e) {}
      }
    });
  } else {
    const historyMoves = game.history({ verbose: true });
    game.reset();
    fens.length = 0;
    fens.push(game.fen());
    moves.length = 0;
    historyMoves.forEach((m) => {
      game.move(m);
      fens.push(game.fen());
      moves.push({ from: m.from, to: m.to, san: m.san });
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

  // Ephemeral match roster
  const [players] = useState(() => {
    try {
      const stored = sessionStorage.getItem('chessyy_review_players');
      return stored ? JSON.parse(stored) : { white: 'WHITE', black: 'BLACK' };
    } catch (e) {
      return { white: 'WHITE', black: 'BLACK' };
    }
  });

  const [activePgn] = useState(() => {
    try {
      const stored = sessionStorage.getItem('chessyy_review_pgn');
      if (stored !== null) return stored.trim();
      return DEMO_PGN;
    } catch (e) {
      return '';
    }
  });

  const parsedData = useMemo(() => {
    return parsePositionsFromPgn(activePgn);
  }, [activePgn]);

  const { fens, moves: parsedMoves } = parsedData;

  const [currentPly, setCurrentPly] = useState(fens.length - 1);
  const [isFlipped, setIsFlipped] = useState(() => {
    const black = (players?.black || '').toUpperCase().trim();
    return Boolean(myHandle && black && black === myHandle.toUpperCase().trim());
  });

  // Stockfish analysis state
  const [analysisData, setAnalysisData] = useState(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  // Official PGN download handler
  const handleDownloadPgn = useCallback(() => {
    downloadMatchPgn(activePgn, players, analysisData);
  }, [activePgn, players, analysisData]);

  // Anti-abuse retry state
  const [retryCount, setRetryCount] = useState(0);
  const [retryCooldown, setRetryCooldown] = useState(0);
  const MAX_RETRIES = 3;

  useEffect(() => {
    if (retryCooldown <= 0) return;
    const timer = setInterval(() => {
      setRetryCooldown((v) => Math.max(0, v - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [retryCooldown]);

  // Sync board wrapper height to eval bar
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

  // Play sound on stepping moves
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

  // Core fetch function for analysis
  const executeAnalysisFetch = useCallback(async (isRetry = false) => {
    if (parsedMoves.length === 0) {
      setIsLoadingAnalysis(false);
      setIsOffline(false);
      setAnalysisData({
        whiteAccuracy: '—',
        blackAccuracy: '—',
        evalGraph: [0.0],
        moves: [],
        coachSummary: {
          whiteTip: 'No moves were played in this match.',
          blackTip: 'No moves were played in this match.',
        },
      });
      return;
    }

    setIsLoadingAnalysis(true);
    setIsOffline(false);

    try {
      const response = await fetch('/api/game/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pgn: activePgn }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      setAnalysisData(data);
      setIsOffline(false);
    } catch (err) {
      console.error('[ReviewPage] Analysis fetch error:', err);
      if (!isRetry) {
        setTimeout(() => {
          executeAnalysisFetch(true);
        }, 1200);
        return;
      }
      setIsOffline(true);
    } finally {
      setIsLoadingAnalysis(false);
    }
  }, [activePgn, parsedMoves.length]);

  // Initial fetch on mount
  useEffect(() => {
    executeAnalysisFetch();
  }, [executeAnalysisFetch]);

  // User-triggered Retry Evaluation with Anti-Abuse Rate-Limiting
  const handleRetryAnalysis = useCallback(() => {
    if (isLoadingAnalysis || retryCooldown > 0 || retryCount >= MAX_RETRIES) return;

    setRetryCount((prev) => prev + 1);
    setRetryCooldown(10); // 10-second strict cooldown to prevent spamming
    executeAnalysisFetch(true);
  }, [isLoadingAnalysis, retryCooldown, retryCount, executeAnalysisFetch]);

  // Display chess instance for current ply FEN
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

  const currentMoveInfo = analysisData?.moves?.[currentPly - 1] || null;

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

  const handleFlip = () => {
    setIsFlipped((prev) => !prev);
  };

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
        <main className="board-and-eval-container">
          <EvalBar evalScore={currentEval} height={boardHeight} />

          <div className="review-board-area">
            <div className="board-wrapper" ref={boardWrapperRef}>
              <ChessBoard
                chess={displayChess}
                playerRole={isFlipped ? 'b' : 'w'}
                selectedSquare={null}
                possibleMoves={[]}
                lastMove={lastMove}
                onSquareClick={null}
              />
            </div>

            <StepperControls
              currentPly={currentPly}
              maxPly={fens.length - 1}
              onFirst={handleStepFirst}
              onPrev={handleStepPrev}
              onNext={handleStepNext}
              onLast={handleStepLast}
              onFlip={handleFlip}
            />
          </div>
        </main>

        {/* Right Column: Move Journal, Engine Suggestion, AI Coach */}
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
          />

          <CoachCard
            coachSummary={analysisData?.coachSummary}
            isOffline={isOffline}
          />
        </aside>
      </div>

      <Footer />
    </>
  );
}
