import { useState, useRef, useEffect } from 'react';
import { Chess } from 'chess.js';
import ChessBoard from '../board/ChessBoard';
import { getRandomPuzzle } from '../../data/puzzlesData';
import { fetchDynamicPuzzle } from '../../services/puzzleService';
import { useSound } from '../../context/SoundContext';
import SoundToggleButton from '../common/SoundToggleButton';

// Interactive chess puzzle widget for the homepage
export default function PuzzleWidget() {
  const {
    playMoveSound,
    playCaptureSound,
    playCheckSound,
    playCastleSound,
    playPromoteSound,
    playGameOverSound,
  } = useSound();

  const [currentPuzzle, setCurrentPuzzle] = useState(() => getRandomPuzzle());
  const [chessGame, setChessGame] = useState(() => new Chess(currentPuzzle.fen));

  const [selectedSquare, setSelectedSquare] = useState(null);
  const [possibleMoves, setPossibleMoves] = useState([]);
  const [lastMove, setLastMove] = useState(() => currentPuzzle?.lastMove || null);
  const [stepIndex, setStepIndex] = useState(0); // Current move in the puzzle solution sequence
  const [status, setStatus] = useState('idle'); // 'idle', 'wrong', or 'solved'
  const [isOpponentMoving, setIsOpponentMoving] = useState(false);
  const [streak, setStreak] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [isLoadingNew, setIsLoadingNew] = useState(false);

  // References to active timers and interaction lifecycle
  const opponentTimerRef = useRef(null);
  const victoryTimerRef = useRef(null);
  const isMountedRef = useRef(true);
  const hasUserInteractedRef = useRef(false);

  const clearPendingTimers = () => {
    if (opponentTimerRef.current) {
      clearTimeout(opponentTimerRef.current);
      opponentTimerRef.current = null;
    }
    if (victoryTimerRef.current) {
      clearTimeout(victoryTimerRef.current);
      victoryTimerRef.current = null;
    }
  };

  // Clean up any pending timeouts on unmount and track mount state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearPendingTimers();
    };
  }, []);

  // Fetch fresh dynamic daily puzzle on load (falls back cleanly if offline)
  useEffect(() => {
    fetchDynamicPuzzle()
      .then((dynamicPuzzle) => {
        // Only override if component is mounted and user hasn't already started solving initial puzzle
        if (isMountedRef.current && dynamicPuzzle && !hasUserInteractedRef.current) {
          initPuzzle(dynamicPuzzle);
        }
      })
      .catch(() => {});
  }, []);

  // Helper to play exactly one appropriate sound effect based on move priority
  const playSfxForMove = (moveResult, chessInstance, isSelf = true) => {
    if (!moveResult) return;
    const inCheck = typeof chessInstance.inCheck === 'function'
      ? chessInstance.inCheck()
      : (typeof chessInstance.in_check === 'function' ? chessInstance.in_check() : false);
    const isCapture = Boolean(moveResult.captured);
    const isCastle = Boolean(moveResult.flags && (moveResult.flags.includes('k') || moveResult.flags.includes('q')));
    const isPromotion = Boolean(moveResult.promotion);

    if (inCheck) {
      playCheckSound();
    } else if (isCapture) {
      playCaptureSound();
    } else if (isCastle) {
      playCastleSound();
    } else if (isPromotion) {
      playPromoteSound();
    } else {
      playMoveSound(isSelf);
    }
  };

  // Load a new puzzle and reset board state
  const initPuzzle = (puzzle) => {
    clearPendingTimers();
    setCurrentPuzzle(puzzle);
    setChessGame(new Chess(puzzle.fen));
    setSelectedSquare(null);
    setPossibleMoves([]);
    setLastMove(puzzle.lastMove || null);
    setStepIndex(0);
    setStatus('idle');
    setIsOpponentMoving(false);
    setShowHint(false);
  };

  // Reset the current puzzle back to the starting position
  const handleReset = () => {
    clearPendingTimers();
    setChessGame(new Chess(currentPuzzle.fen));
    setSelectedSquare(null);
    setPossibleMoves([]);
    setLastMove(currentPuzzle.lastMove || null);
    setStepIndex(0);
    setStatus('idle');
    setIsOpponentMoving(false);
    setShowHint(false);
  };

  // Skip to another dynamic or random puzzle
  const handleNextPuzzle = async () => {
    if (isLoadingNew) return;
    clearPendingTimers();
    setIsLoadingNew(true);
    hasUserInteractedRef.current = false;
    try {
      const next = await fetchDynamicPuzzle(currentPuzzle.id);
      if (isMountedRef.current) {
        initPuzzle(next);
      }
    } catch {
      if (isMountedRef.current) {
        initPuzzle(getRandomPuzzle(currentPuzzle.id));
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingNew(false);
      }
    }
  };

  // Handle square clicks: select piece, calculate legal moves, and execute move
  const handleSquareClick = (rowIndex, colIndex, squareName, square) => {
    if (status !== 'idle' || isOpponentMoving) return;
    hasUserInteractedRef.current = true;

    const playerColor = currentPuzzle.turn;

    // 1. No square selected yet: select clicked piece if it matches player's turn
    if (!selectedSquare) {
      if (square && square.color === playerColor) {
        const moves = chessGame.moves({ square: squareName, verbose: true });
        setSelectedSquare({ row: rowIndex, col: colIndex, squareName });
        setPossibleMoves(moves);
      }
      return;
    }

    // 2. Clicked the same square: deselect
    if (selectedSquare.squareName === squareName) {
      setSelectedSquare(null);
      setPossibleMoves([]);
      return;
    }

    // 3. Clicked another friendly piece: switch selection
    if (square && square.color === playerColor) {
      const moves = chessGame.moves({ square: squareName, verbose: true });
      setSelectedSquare({ row: rowIndex, col: colIndex, squareName });
      setPossibleMoves(moves);
      return;
    }

    // 4. Validate if target square is in legal moves
    const targetMove = possibleMoves.find(m => m.to === squareName);
    if (!targetMove) {
      setSelectedSquare(null);
      setPossibleMoves([]);
      return;
    }

    // Resolve expected move and dynamically extract promotion piece (e.g. underpromotion =N, =R, =B)
    const expectedMove = currentPuzzle.solution[stepIndex] || '';
    let promoPiece = 'q';
    const promoMatch = expectedMove.match(/=([qrbn])/i);
    if (promoMatch) {
      promoPiece = promoMatch[1].toLowerCase();
    }

    // Execute move on chess clone
    const nextGame = new Chess(chessGame.fen());
    let executedMove = null;
    try {
      executedMove = nextGame.move({
        from: selectedSquare.squareName,
        to: squareName,
        promotion: promoPiece
      });
    } catch {
      executedMove = null;
    }

    if (!executedMove) {
      setSelectedSquare(null);
      setPossibleMoves([]);
      return;
    }

    // Play single appropriate sound effect (prevents overlapping/glitched audio)
    playSfxForMove(executedMove, nextGame, true);

    setChessGame(nextGame);
    setLastMove({ from: executedMove.from, to: executedMove.to });
    setSelectedSquare(null);
    setPossibleMoves([]);

    // Check if move matches the puzzle's expected solution
    const isCorrect =
      executedMove.san === expectedMove ||
      executedMove.san.replace(/[+#]/g, '') === expectedMove.replace(/[+#]/g, '') ||
      (executedMove.from + executedMove.to === expectedMove) ||
      (executedMove.lan === expectedMove);

    if (isCorrect) {
      const nextStep = stepIndex + 1;

      if (nextStep >= currentPuzzle.solution.length) {
        // Complete puzzle solved
        setStatus('solved');
        setStreak(s => s + 1);
        victoryTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            playGameOverSound();
          }
        }, 350);
      } else {
        // Opponent plays auto-reply move after short delay
        setIsOpponentMoving(true);
        setStepIndex(nextStep);

        opponentTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;

          const opponentMoveSan = currentPuzzle.solution[nextStep];
          let oppExecuted = null;
          const oppGame = new Chess(nextGame.fen());

          try {
            oppExecuted = oppGame.move(opponentMoveSan, { sloppy: true });
          } catch {
            if (typeof opponentMoveSan === 'string' && opponentMoveSan.length >= 4) {
              try {
                oppExecuted = oppGame.move({
                  from: opponentMoveSan.slice(0, 2),
                  to: opponentMoveSan.slice(2, 4),
                  promotion: opponentMoveSan.slice(4) || 'q',
                });
              } catch {}
            }
          }

          if (oppExecuted) {
            playSfxForMove(oppExecuted, oppGame, false);
            setChessGame(oppGame);
            setLastMove({ from: oppExecuted.from, to: oppExecuted.to });
          }

          const subsequentStep = nextStep + 1;
          setStepIndex(subsequentStep);
          setIsOpponentMoving(false);

          if (subsequentStep >= currentPuzzle.solution.length) {
            setStatus('solved');
            setStreak(s => s + 1);
            victoryTimerRef.current = setTimeout(() => {
              if (isMountedRef.current) {
                playGameOverSound();
              }
            }, 350);
          }
        }, 420);
      }
    } else {
      // Wrong move played
      setStatus('wrong');
    }
  };

  const isWhiteTurn = currentPuzzle.turn === 'w';

  return (
    <div className="puzzle-widget-card" id="home-puzzle-card">
      {/* Widget Header Banner */}
      <div className="puzzle-widget-header">
        <div className="puzzle-header-meta">
          <span className="puzzle-pill-tag">
            PUZZLE BOARD
          </span>
          {currentPuzzle.rating && (
            <span className="puzzle-rating-badge" title="Tactical Rating">
              ★ {currentPuzzle.rating}
            </span>
          )}
        </div>

        <div className="puzzle-header-controls">
          <div className={`puzzle-turn-badge ${isWhiteTurn ? 'white-turn' : 'black-turn'}`}>
            <span className="turn-dot" />
            <span className="turn-label">{isWhiteTurn ? 'WHITE TO MOVE' : 'BLACK TO MOVE'}</span>
          </div>

          <button
            type="button"
            className="puzzle-skip-btn"
            title="Load another puzzle"
            onClick={handleNextPuzzle}
            disabled={isLoadingNew}
            aria-label="Skip to new puzzle"
          >
            {isLoadingNew ? 'LOADING...' : 'NEW ↻'}
          </button>
        </div>
      </div>

      {/* Interactive Board Viewport */}
      <div className={`puzzle-board-container ${status === 'wrong' ? 'shake-board' : ''}`}>
        <ChessBoard
          chess={chessGame}
          playerRole={currentPuzzle.turn}
          selectedSquare={selectedSquare}
          possibleMoves={possibleMoves}
          lastMove={lastMove}
          onSquareClick={handleSquareClick}
          className="puzzle-chessboard"
        />

        {/* Floating overlays for solved / wrong status */}
        {status === 'solved' && (
          <div className="puzzle-overlay solved-overlay" id="puzzle-solved-banner">
            <div className="puzzle-overlay-content">
              <div className="overlay-badge">CONGRATS, PUZZLE SOLVED!</div>
              <button
                type="button"
                className="btn-editorial btn-editorial-solid puzzle-cta-btn"
                onClick={handleNextPuzzle}
                id="puzzle-next-btn"
              >
                <span>WANT ANOTHER?</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Widget Bottom Status Bar */}
      <div className="puzzle-widget-footer">
        {status === 'idle' && (
          <>
            <div className="puzzle-footer-status">
              <div className="puzzle-status-left">
                <span className="status-indicator-dot pulsing" />
                <span className="puzzle-prompt-text">
                  {isOpponentMoving ? 'Opponent responding...' : 'Find the best move'}
                </span>
              </div>

              {!showHint ? (
                <button
                  type="button"
                  className="puzzle-hint-toggle-btn"
                  onClick={() => setShowHint(true)}
                  id="puzzle-show-hint-btn"
                >
                  SHOW HINT
                </button>
              ) : (
                <button
                  type="button"
                  className="puzzle-hint-toggle-btn active"
                  onClick={() => setShowHint(false)}
                  title="Hide hint"
                >
                  HIDE HINT
                </button>
              )}
            </div>

            {showHint && (
              <div className="puzzle-revealed-hint" id="puzzle-hint-text">
                <span className="hint-tag">HINT:</span> {currentPuzzle.hint}
              </div>
            )}
          </>
        )}

        {status === 'wrong' && (
          <div className="puzzle-footer-status status-error">
            <span className="error-text">INCORRECT MOVE - TRY AGAIN</span>
            <button
              type="button"
              className="puzzle-retry-btn"
              onClick={handleReset}
              id="puzzle-retry-btn"
            >
              RESET
            </button>
          </div>
        )}

        {status === 'solved' && (
          <div className="puzzle-footer-status status-success">
            <span className="success-text">PUZZLE SOLVED</span>
            <button
              type="button"
              className="puzzle-next-link"
              onClick={handleNextPuzzle}
            >
              PLAY NEXT ↻
            </button>
          </div>
        )}
        
        <div className="puzzle-footer-meta">
          <span className="puzzle-source-stamp">
            {currentPuzzle.theme ? `${currentPuzzle.theme} / ` : ''}{currentPuzzle.source}
          </span>
          <SoundToggleButton id="puzzle-sound-toggle-btn" className="puzzle-sound-toggle-btn" />
        </div>
      </div>
    </div>
  );
}

