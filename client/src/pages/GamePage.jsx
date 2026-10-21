import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Chess } from 'chess.js';
import Masthead from '../components/common/Masthead';
import Footer from '../components/common/Footer';
import ChessBoard from '../components/board/ChessBoard';
import PromotionModal from '../components/board/PromotionModal';
import PlayerHUD from '../components/game/PlayerHUD';
import MatchLedger from '../components/game/MatchLedger';
import LiveChat from '../components/game/LiveChat';
import WaitingModal from '../components/game/WaitingModal';
import EndGameModal from '../components/game/EndGameModal';
import GameOverModal from '../components/game/GameOverModal';
import SoundToggleButton from '../components/common/SoundToggleButton';
import { useUser } from '../context/UserContext';
import { useSocket } from '../context/SocketContext';
import { useSound } from '../context/SoundContext';
import { useToast } from '../context/ToastContext';

// Standard time control presets with initial clock and increment times in ms
const TC_PRESETS = {
  bullet_1_0: { id: 'bullet_1_0', label: '1 MIN BULLET', initialMs: 60 * 1000, incMs: 0 },
  blitz_3_0: { id: 'blitz_3_0', label: '3 MIN BLITZ', initialMs: 3 * 60 * 1000, incMs: 0 },
  blitz_3_2: { id: 'blitz_3_2', label: '3+2 BLITZ', initialMs: 3 * 60 * 1000, incMs: 2000 },
  rapid_5_0: { id: 'rapid_5_0', label: '5 MIN RAPID', initialMs: 5 * 60 * 1000, incMs: 0 },
  rapid_10_0: { id: 'rapid_10_0', label: '10 MIN RAPID', initialMs: 10 * 60 * 1000, incMs: 0 },
  unlimited: { id: 'unlimited', label: 'UNLIMITED PACE', initialMs: 0, incMs: 0 },
};

export default function GamePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { handle: myHandle } = useUser();
  const { socket, isConnected } = useSocket();
  const { showToast } = useToast();
  const {
    playMoveSound,
    playCaptureSound,
    playCheckSound,
    playCastleSound,
    playPromoteSound,
    playGameOverSound,
    playLowTimeTickSound,
  } = useSound();

  // Scroll to top when game page loads
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Match parameters from query string (like: ?tc=blitz_3_0&room=ABCDEF&role=host)
  const tcParam = searchParams.get('tc') || 'rapid_10_0';
  const roomParam = searchParams.get('room') ? searchParams.get('room').trim().toUpperCase() : null;
  const roleParam = searchParams.get('role') ? searchParams.get('role').trim().toLowerCase() : null; // 'host' | 'guest'

  const tcConfig = TC_PRESETS[tcParam] || TC_PRESETS.rapid_10_0;
  const isTimedMatch = tcConfig.initialMs > 0;

  // Local chess engine instance and board state
  const [chess] = useState(() => new Chess());
  const [, setBoardRevision] = useState(0); // Counter to trigger re-renders after mutating chess engine
  const [playerRole, setPlayerRole] = useState(null); // 'w', 'b', or null (Spectator)

  // Match participant names and interaction states
  const [opponentHandle, setOpponentHandle] = useState('OPPONENT');
  const [matchPlayers, setMatchPlayers] = useState({ white: 'WHITE', black: 'BLACK' });
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [possibleMoves, setPossibleMoves] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [pendingPromotion, setPendingPromotion] = useState(null);

  // Player clocks: stores remaining time in ms and tracks whose timer is active
  const [clocks, setClocks] = useState({
    isTimed: isTimedMatch,
    whiteMs: tcConfig.initialMs,
    blackMs: tcConfig.initialMs,
    activeTurn: null,
  });
  const lowTimeTickRef = useRef(0);

  // Match status and popup modal controls
  const [isWaiting, setIsWaiting] = useState(() => {
    // If active session token exists in sessionStorage, skip waiting modal
    try {
      const stored = sessionStorage.getItem('chessyy_active_game');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.gameId && parsed.playerToken) return false;
      }
    } catch {}
    return true;
  });
  const [reconnectGraceSeconds, setReconnectGraceSeconds] = useState(null);
  const [privateRoomInfo, setPrivateRoomInfo] = useState({
    isPrivate: Boolean(roomParam),
    roomCode: roomParam || '',
    expiresAt: 0,
  });
  const [isDrawOfferOpen, setIsDrawOfferOpen] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [gameOverReason, setGameOverReason] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [capturedPieces, setCapturedPieces] = useState({ white: [], black: [] });

  // 1-second interval ticker for opponent reconnection grace period
  useEffect(() => {
    if (reconnectGraceSeconds === null || reconnectGraceSeconds <= 0) return;
    const timer = setInterval(() => {
      setReconnectGraceSeconds((prev) => (prev > 1 ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(timer);
  }, [reconnectGraceSeconds]);

  // Forces component re-render when chess engine state updates
  const triggerRender = useCallback(() => {
    setBoardRevision((v) => v + 1);
  }, []);

  // Tally missing pieces by comparing the board against the standard 16-piece set
  const updateCapturedPieces = useCallback(() => {
    const piecesOnBoard = { p: 0, r: 0, n: 0, b: 0, q: 0, P: 0, R: 0, N: 0, B: 0, Q: 0 };
    chess.board().forEach((row) => {
      row.forEach((sq) => {
        if (sq) {
          const key = sq.color === 'w' ? sq.type.toUpperCase() : sq.type.toLowerCase();
          piecesOnBoard[key] = (piecesOnBoard[key] || 0) + 1;
        }
      });
    });

    const initial = { p: 8, r: 2, n: 2, b: 2, q: 1, P: 8, R: 2, N: 2, B: 2, Q: 1 };
    const capturedWhite = []; // Black pieces captured by White
    const capturedBlack = []; // White pieces captured by Black

    for (const [k, count] of Object.entries(initial)) {
      const remaining = piecesOnBoard[k] || 0;
      const lost = Math.max(0, count - remaining);
      for (let i = 0; i < lost; i++) {
        if (k === k.toUpperCase()) {
          capturedBlack.push(k.toLowerCase());
        } else {
          capturedWhite.push(k);
        }
      }
    }
    setCapturedPieces({ white: capturedWhite, black: capturedBlack });
  }, [chess]);


  // Selects appropriate sound effect based on move consequences (check, capture, castle, or promotion)
  const playSfxForMove = useCallback((moveResult, isSelf) => {
    if (!moveResult) return;
    const inCheck = typeof chess.inCheck === 'function' ? chess.inCheck() : (typeof chess.in_check === 'function' ? chess.in_check() : false);
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
  }, [chess, playCheckSound, playCaptureSound, playCastleSound, playPromoteSound, playMoveSound]);

  // Keep latest state in refs so socket event listeners remain stable without rebinding
  const myHandleRef = useRef(myHandle);
  const matchPlayersRef = useRef(matchPlayers);
  const playerRoleRef = useRef(playerRole);
  const chessRef = useRef(chess);
  const playSfxRef = useRef(playSfxForMove);
  const playGameOverSoundRef = useRef(playGameOverSound);
  const showToastRef = useRef(showToast);
  const navigateRef = useRef(navigate);
  const triggerRenderRef = useRef(triggerRender);
  const updateCapturedPiecesRef = useRef(updateCapturedPieces);

  useEffect(() => { myHandleRef.current = myHandle; }, [myHandle]);
  useEffect(() => { matchPlayersRef.current = matchPlayers; }, [matchPlayers]);
  useEffect(() => { playerRoleRef.current = playerRole; }, [playerRole]);
  useEffect(() => { playSfxRef.current = playSfxForMove; }, [playSfxForMove]);
  useEffect(() => { playGameOverSoundRef.current = playGameOverSound; }, [playGameOverSound]);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);
  useEffect(() => { navigateRef.current = navigate; }, [navigate]);
  useEffect(() => { triggerRenderRef.current = triggerRender; }, [triggerRender]);
  useEffect(() => { updateCapturedPiecesRef.current = updateCapturedPieces; }, [updateCapturedPieces]);

  // Socket Lifecycle & Matchmaking: handles room joins, move replication, clocks, and chat
  useEffect(() => {
    if (!socket || !isConnected) return;

    const safeHandle = (myHandleRef.current || 'ANONYMOUS').toUpperCase().substring(0, 10);

    // Join random queue or private room based on URL params
    const joinStandardMatch = () => {
      if (roomParam && roleParam === 'host') {
        socket.emit('hostPrivateRoom', {
          roomCode: roomParam,
          timeControl: tcParam,
          playerName: safeHandle,
        });
      } else if (roomParam) {
        socket.emit('joinPrivateRoom', {
          roomCode: roomParam,
          playerName: safeHandle,
        });
      } else {
        socket.emit('joinRandomQueue', {
          timeControl: tcParam,
          playerName: safeHandle,
        });
      }
    };

    // Check for existing session token in sessionStorage to recover from page reload
    let activeSession = null;
    try {
      const stored = sessionStorage.getItem('chessyy_active_game');
      if (stored) {
        activeSession = JSON.parse(stored);
      }
    } catch {}

    if (activeSession && activeSession.gameId && activeSession.playerToken) {
      console.log('[Socket] Active session found. Attempting match reconnection...', activeSession.gameId);
      socket.emit('reconnectGame', {
        gameId: activeSession.gameId,
        playerToken: activeSession.playerToken,
      });
    } else {
      joinStandardMatch();
    }

    // Queue waiting indicator
    const handleWaitingForOpponent = () => {
      setIsWaiting(true);
    };

    // Private room created on server
    const handlePrivateCreated = (data) => {
      setPrivateRoomInfo({
        isPrivate: true,
        roomCode: data.roomCode,
        expiresAt: data.expiresAt,
      });
      setIsWaiting(true);
    };

    // Room code timed out
    const handlePrivateExpired = (data) => {
      showToastRef.current(data.message || 'Room code expired.');
      navigateRef.current('/');
    };

    // Room join failed
    const handlePrivateError = (data) => {
      showToastRef.current(data.message || 'Room connection failed.');
      navigateRef.current('/');
    };

    // Match initiated: reset board state, clocks, and prepare arena
    const handleStartGame = (data) => {
      setIsWaiting(false);
      setReconnectGraceSeconds(null);
      chessRef.current.reset();
      setLastMove(null);
      setSelectedSquare(null);
      setPossibleMoves([]);
      setPendingPromotion(null);
      setChatMessages([]);
      setCapturedPieces({ white: [], black: [] });
      setIsGameOver(false);
      setGameOverReason('');
      triggerRenderRef.current();

      if (data && data.clocks) {
        setClocks({
          isTimed: Boolean(data.clocks.isTimed),
          whiteMs: data.clocks.whiteMs,
          blackMs: data.clocks.blackMs,
          activeTurn: data.clocks.activeTurn || 'w',
        });
      }
      if (data && data.players) {
        const roster = {
          white: data.players.white || 'WHITE',
          black: data.players.black || 'BLACK',
        };
        setMatchPlayers(roster);
        try {
          sessionStorage.setItem('chessyy_review_players', JSON.stringify(roster));
          sessionStorage.setItem('chessyy_review_pgn', '');
        } catch {}
      }
      showToastRef.current('Opponent connected. Match initiated.');
    };

    // Role Assigned & Identities Synced
    const handlePlayerRole = (data) => {
      let role = data;
      let selfName = safeHandle;
      let oppName = 'OPPONENT';

      if (typeof data === 'object' && data !== null) {
        role = data.role;
        if (data.playerName) selfName = data.playerName;
        if (data.opponentName) oppName = data.opponentName;

        // Persist session token to survive F5 page refresh
        if (data.gameId && data.playerToken) {
          try {
            sessionStorage.setItem(
              'chessyy_active_game',
              JSON.stringify({
                gameId: data.gameId,
                playerToken: data.playerToken,
                role: role,
                timeControl: tcParam,
              })
            );
          } catch {}
        }
      }

      setPlayerRole(role);
      setOpponentHandle(oppName);
      const roster = {
        white: role === 'w' ? selfName : oppName,
        black: role === 'b' ? selfName : oppName,
      };
      setMatchPlayers(roster);
      try {
        sessionStorage.setItem('chessyy_review_role', role);
        sessionStorage.setItem('chessyy_review_players', JSON.stringify(roster));
      } catch {}
      setIsWaiting(false);
      showToastRef.current(`Match started! You are ${role === 'w' ? 'WHITE' : 'BLACK'}.`);
    };

    // Load initial board state if game has no prior history
    const handleBoardState = (fen) => {
      if (chessRef.current.history().length === 0) {
        chessRef.current.load(fen);
        triggerRenderRef.current();
        updateCapturedPiecesRef.current();
      }
    };

    // Reconstruct full game state when rejoining after a disconnect or page refresh
    const handleGameReconnected = (data) => {
      console.log('[Socket] Reconnected to match successfully:', data.gameId);
      setIsWaiting(false);
      setReconnectGraceSeconds(null);
      const role = data.role;
      setPlayerRole(role);

      const roster = data.players || { white: 'WHITE', black: 'BLACK' };
      setMatchPlayers(roster);
      const oppName = role === 'w' ? roster.black : roster.white;
      setOpponentHandle(oppName);

      // Restore moves from PGN or history replay (avoids wiping move ledger with load(fen))
      let loaded = false;
      if (data.pgn && data.pgn.trim()) {
        try {
          chessRef.current.loadPgn(data.pgn);
          loaded = true;
        } catch (err) {
          console.warn('[Socket] Failed to load PGN, trying history replay:', err);
          loaded = false;
        }
      }

      if (!loaded && Array.isArray(data.history) && data.history.length > 0) {
        try {
          chessRef.current.reset();
          for (const m of data.history) {
            chessRef.current.move(m);
          }
          loaded = true;
        } catch (err) {
          console.warn('[Socket] Failed to replay history, falling back to FEN:', err);
          loaded = false;
        }
      }

      if (!loaded && data.fen) {
        chessRef.current.load(data.fen);
      }

      // Re-highlight the last executed move on the board
      if (data.lastMove && data.lastMove.from && data.lastMove.to) {
        setLastMove(data.lastMove);
      } else {
        const hist = chessRef.current.history({ verbose: true });
        if (hist.length > 0) {
          const last = hist[hist.length - 1];
          setLastMove({ from: last.from, to: last.to });
        } else {
          setLastMove(null);
        }
      }

      // Sync remaining clock times
      if (data.clocks) {
        setClocks({
          isTimed: Boolean(data.clocks.isTimed),
          whiteMs: data.clocks.whiteMs,
          blackMs: data.clocks.blackMs,
          activeTurn: data.clocks.activeTurn,
        });
      }

      // Rehydrate chat message history
      if (Array.isArray(data.chat)) {
        setChatMessages(
          data.chat.map((c) => ({
            sender: c.sender || 'PLAYER',
            senderLabel: c.senderName || c.sender,
            text: c.message,
            timestamp: c.timestamp,
            isSelf: c.senderName === safeHandle,
          }))
        );
      }

      triggerRenderRef.current();
      updateCapturedPiecesRef.current();

      try {
        sessionStorage.setItem('chessyy_review_players', JSON.stringify(roster));
        sessionStorage.setItem('chessyy_review_pgn', chessRef.current.pgn() || data.pgn || '');
      } catch {}

      showToastRef.current('Reconnected to live match!');
    };

    // Session expired or match ended while disconnected
    const handleReconnectFailed = (err) => {
      console.log('[Socket] Reconnect failed:', err?.message);
      try {
        sessionStorage.removeItem('chessyy_active_game');
      } catch {}
      setIsWaiting(true);
      showToastRef.current(err?.message || 'Previous session expired. Entering matchmaking...');
      joinStandardMatch();
    };

    // Start 30s countdown waiting for disconnected opponent to return
    const handleOpponentDisconnectedGrace = (data) => {
      const sec = data?.graceSeconds || 30;
      setReconnectGraceSeconds(sec);
      showToastRef.current(`Opponent disconnected! Waiting up to ${sec}s for reconnection...`);
    };

    // Opponent successfully reconnected
    const handleOpponentReconnected = (data) => {
      setReconnectGraceSeconds(null);
      showToastRef.current(`Opponent (${data?.name || 'Opponent'}) reconnected! Resuming match.`);
    };

    // Opponent exited post-game lobby
    const handleOpponentLeftRoom = () => {
      setReconnectGraceSeconds(null);
      showToastRef.current('Opponent left the room.');
    };

    // Incoming move verified by server
    const handleMove = (move) => {
      try {
        const historyVerbose = chessRef.current.history({ verbose: true });
        const lastApplied = historyVerbose.length > 0 ? historyVerbose[historyVerbose.length - 1] : null;

        // Skip if this client already applied the move optimistically
        if (
          lastApplied &&
          lastApplied.from === move.from &&
          lastApplied.to === move.to &&
          (!move.promotion || lastApplied.promotion === move.promotion)
        ) {
          return;
        }

        const res = chessRef.current.move(move);
        if (res) {
          setLastMove(move);
          triggerRenderRef.current();
          updateCapturedPiecesRef.current();
          const isSelf = playerRoleRef.current === res.color;
          playSfxRef.current(res, isSelf);
          try {
            sessionStorage.setItem('chessyy_review_pgn', chessRef.current.pgn());
          } catch {}
        }
      } catch (err) {
        console.warn('[Socket] Error applying incoming move:', err);
      }
    };

    // Illegal move rejected by server validation
    const handleInvalidMove = () => {
      showToastRef.current('Invalid move according to standard FIDE rules.');
      triggerRenderRef.current();
    };

    // Clock sync from server
    const handleClockSync = (data) => {
      setClocks({
        isTimed: data.activeTurn !== null,
        whiteMs: data.whiteMs,
        blackMs: data.blackMs,
        activeTurn: data.activeTurn,
      });
    };

    // Incoming chat message from opponent
    const handleReceiveChatMessage = (chatEntry) => {
      setChatMessages((prev) => {
        // Prevent duplicate messages if already rendered
        if (chatEntry.clientMsgId && prev.some((m) => m.id === chatEntry.clientMsgId)) {
          return prev;
        }
        return [
          ...prev,
          {
            id: chatEntry.id || chatEntry.clientMsgId || ('srv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
            sender: chatEntry.sender || 'PLAYER',
            senderLabel: chatEntry.senderName || chatEntry.sender,
            text: chatEntry.message,
            timestamp: chatEntry.timestamp,
            isSelf: chatEntry.senderName === safeHandle,
          },
        ];
      });
    };

    // Draw offer received from opponent
    const handleOpponentRequestedEndGame = () => {
      setIsDrawOfferOpen(true);
    };

    // Opponent rejected draw offer
    const handleEndGameDeclined = () => {
      showToastRef.current('Opponent declined the draw offer.');
    };

    // Match concluded: clean active session and cache PGN for Review page
    const handleGameOver = (data) => {
      try {
        sessionStorage.removeItem('chessyy_active_game');
      } catch {}
      setReconnectGraceSeconds(null);
      setIsGameOver(true);
      setIsWaiting(false);
      setClocks((prev) => ({ ...prev, activeTurn: null }));
      playGameOverSoundRef.current();

      const reason = typeof data === 'object' && data.reason ? data.reason : data;
      const finalPgn = typeof data === 'object' && data.pgn ? data.pgn : chessRef.current.pgn();
      const playersRoster = typeof data === 'object' && data.players ? data.players : matchPlayersRef.current;

      setGameOverReason(reason);

      try {
        if (finalPgn && finalPgn.trim()) {
          sessionStorage.setItem('chessyy_review_pgn', finalPgn);
        }
        sessionStorage.setItem('chessyy_review_players', JSON.stringify(playersRoster));
        if (playerRoleRef.current) {
          sessionStorage.setItem('chessyy_review_role', playerRoleRef.current);
        }
      } catch {}
    };


    const handleOpponentDisconnect = () => {
      showToastRef.current('Opponent disconnected from the match.');
    };

    socket.on('waitingForOpponent', handleWaitingForOpponent);
    socket.on('privateRoomCreated', handlePrivateCreated);
    socket.on('privateRoomExpired', handlePrivateExpired);
    socket.on('privateRoomError', handlePrivateError);
    socket.on('startGame', handleStartGame);
    socket.on('playerRole', handlePlayerRole);
    socket.on('boardState', handleBoardState);
    socket.on('move', handleMove);
    socket.on('invalidMove', handleInvalidMove);
    socket.on('clockSync', handleClockSync);
    socket.on('receiveChatMessage', handleReceiveChatMessage);
    socket.on('opponentRequestedEndGame', handleOpponentRequestedEndGame);
    socket.on('endGameDeclined', handleEndGameDeclined);
    socket.on('gameOver', handleGameOver);
    socket.on('opponentDisconnected', handleOpponentDisconnect);
    socket.on('opponentDisconnectedGrace', handleOpponentDisconnectedGrace);
    socket.on('opponentReconnected', handleOpponentReconnected);
    socket.on('opponentLeftRoom', handleOpponentLeftRoom);
    socket.on('gameReconnected', handleGameReconnected);
    socket.on('reconnectFailed', handleReconnectFailed);

    return () => {
      socket.off('waitingForOpponent', handleWaitingForOpponent);
      socket.off('privateRoomCreated', handlePrivateCreated);
      socket.off('privateRoomExpired', handlePrivateExpired);
      socket.off('privateRoomError', handlePrivateError);
      socket.off('startGame', handleStartGame);
      socket.off('playerRole', handlePlayerRole);
      socket.off('boardState', handleBoardState);
      socket.off('move', handleMove);
      socket.off('invalidMove', handleInvalidMove);
      socket.off('clockSync', handleClockSync);
      socket.off('receiveChatMessage', handleReceiveChatMessage);
      socket.off('opponentRequestedEndGame', handleOpponentRequestedEndGame);
      socket.off('endGameDeclined', handleEndGameDeclined);
      socket.off('gameOver', handleGameOver);
      socket.off('opponentDisconnected', handleOpponentDisconnect);
      socket.off('opponentDisconnectedGrace', handleOpponentDisconnectedGrace);
      socket.off('opponentReconnected', handleOpponentReconnected);
      socket.off('opponentLeftRoom', handleOpponentLeftRoom);
      socket.off('gameReconnected', handleGameReconnected);
      socket.off('reconnectFailed', handleReconnectFailed);
    };
  }, [
    socket,
    isConnected,
    roomParam,
    roleParam,
    tcParam,
  ]); // ZERO dynamic state in dependencies! Rock solid socket lifecycle!

  // Local clock ticker: decrements active player's clock every 100ms and sounds low-time tick under 10s
  useEffect(() => {
    if (!clocks.activeTurn || isGameOver || isWaiting || !clocks.isTimed) return;

    const interval = setInterval(() => {
      setClocks((prev) => {
        if (!prev.activeTurn || !prev.isTimed) return prev;
        const key = prev.activeTurn === 'w' ? 'whiteMs' : 'blackMs';
        const updatedMs = Math.max(0, prev[key] - 100);

        // Low time tick audio warning when 10 seconds or less remain
        if (updatedMs <= 10000 && updatedMs > 0) {
          const nowSec = Math.floor(updatedMs / 1000);
          if (lowTimeTickRef.current !== nowSec) {
            lowTimeTickRef.current = nowSec;
            playLowTimeTickSound();
          }
        }

        return { ...prev, [key]: updatedMs };
      });
    }, 100);

    return () => clearInterval(interval);
  }, [clocks.activeTurn, clocks.isTimed, isGameOver, isWaiting, playLowTimeTickSound]);

  // Handle board square interaction: select piece, calculate legal destinations, or make move
  const handleSquareClick = (rowIndex, colIndex, squareName, pieceOnSquare) => {
    if (isGameOver || isWaiting || !playerRole) return;
    if (chess.turn() !== playerRole) return; // Prevent moving out of turn

    // Step 1: No piece selected yet -> select piece if it matches player color
    if (!selectedSquare) {
      if (pieceOnSquare && pieceOnSquare.color === playerRole) {
        const moves = chess.moves({ square: squareName, verbose: true });
        setSelectedSquare({ row: rowIndex, col: colIndex, squareName });
        setPossibleMoves(moves);
      }
      return;
    }

    // Step 2: Clicking another piece of own color -> switch or toggle selection
    if (pieceOnSquare && pieceOnSquare.color === playerRole) {
      if (selectedSquare.squareName === squareName) {
        // Deselect when clicking same square
        setSelectedSquare(null);
        setPossibleMoves([]);
      } else {
        const moves = chess.moves({ square: squareName, verbose: true });
        setSelectedSquare({ row: rowIndex, col: colIndex, squareName });
        setPossibleMoves(moves);
      }
      return;
    }

    // Step 3: Validate if target square is in legal moves list
    const targetMove = possibleMoves.find((m) => m.to === squareName);
    if (!targetMove) {
      setSelectedSquare(null);
      setPossibleMoves([]);
      return;
    }

    // Check for Pawn Promotion (moving to the opponent's back rank)
    const isPawn = selectedSquare && chess.get(selectedSquare.squareName)?.type === 'p';
    const isPromotionRank =
      (playerRole === 'w' && squareName.endsWith('8')) ||
      (playerRole === 'b' && squareName.endsWith('1'));

    if (isPawn && isPromotionRank) {
      setPendingPromotion({ from: selectedSquare.squareName, to: squareName });
      return;
    }

    // Standard move execution
    const moveObj = { from: selectedSquare.squareName, to: squareName };
    const result = chess.move(moveObj);
    if (result) {
      setLastMove(moveObj);
      setSelectedSquare(null);
      setPossibleMoves([]);
      triggerRender();
      updateCapturedPieces();
      playSfxForMove(result, true);
      try {
        sessionStorage.setItem('chessyy_review_pgn', chess.pgn());
      } catch {}
      socket?.emit('move', moveObj);
    }
  };

  // Promotion choice execution
  const handlePromotionSelect = (promoPiece) => {
    if (!pendingPromotion) return;
    const moveObj = { ...pendingPromotion, promotion: promoPiece };
    setPendingPromotion(null);

    const result = chess.move(moveObj);
    if (result) {
      setLastMove(moveObj);
      setSelectedSquare(null);
      setPossibleMoves([]);
      triggerRender();
      updateCapturedPieces();
      playPromoteSound();
      try {
        sessionStorage.setItem('chessyy_review_pgn', chess.pgn());
      } catch {}
      socket?.emit('move', moveObj);
    }
  };

  // Match control actions
  const handleOfferDraw = () => {
    socket?.emit('requestEndGame');
    showToast('Draw offer sent to opponent.');
  };

  const handleResign = () => {
    socket?.emit('resign');
  };

  const handleAcceptDraw = () => {
    setIsDrawOfferOpen(false);
    socket?.emit('respondEndGame', true);
  };

  const handleDeclineDraw = () => {
    setIsDrawOfferOpen(false);
    socket?.emit('respondEndGame', false);
  };

  // Send in-game chat message
  const handleSendMessage = useCallback((text) => {
    if (!text || !text.trim()) return;
    const trimmed = text.trim().slice(0, 200);
    const clientMsgId = 'cmsg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const selfLabel = (myHandleRef.current || 'ANONYMOUS').toUpperCase().substring(0, 10);
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Optimistic instant render (0ms latency for sender)
    setChatMessages((prev) => [
      ...prev,
      {
        id: clientMsgId,
        sender: playerRoleRef.current === 'w' ? 'White' : 'Black',
        senderLabel: selfLabel,
        text: trimmed,
        timestamp: timeStr,
        isSelf: true,
      },
    ]);

    socket?.emit('sendChatMessage', { message: trimmed, clientMsgId });
  }, [socket]);

  // Restart match from beginning
  const handlePlayAgain = () => {
    try {
      sessionStorage.removeItem('chessyy_active_game');
    } catch {}
    setIsGameOver(false);
    navigate(0); // Refresh match screen
  };

  // Save current match PGN and open Review Match page
  const handleReviewMatch = useCallback(() => {
    try {
      if (chessRef.current) {
        const currentPgn = chessRef.current.pgn();
        if (currentPgn && currentPgn.trim()) {
          sessionStorage.setItem('chessyy_review_pgn', currentPgn);
        }
      }
      sessionStorage.setItem('chessyy_review_players', JSON.stringify(matchPlayersRef.current));
      if (playerRoleRef.current) {
        sessionStorage.setItem('chessyy_review_role', playerRoleRef.current);
      }
    } catch (e) {
      console.warn('[GamePage] Error saving review state:', e);
    }
    navigate('/review');
  }, [navigate]);

  // Status ticker text calculation: turn notice, check/checkmate badges, and game phase
  const matchStatus = useMemo(() => {
    if (isWaiting) {
      if (roomParam) {
        return { text: `AWAITING FRIEND // CODE [${roomParam}]`, phase: 'PRIVATE ROOM' };
      }
      return { text: 'QUEUED / AWAITING OPPONENT...', phase: 'QUEUE' };
    }

    if (!playerRole) {
      return { text: 'SPECTATING / QUEUED', phase: 'READY' };
    }

    // Display opponent reconnection countdown ticker if opponent lost connection
    if (reconnectGraceSeconds !== null && reconnectGraceSeconds > 0) {
      return {
        text: `⚠ OPPONENT DISCONNECTED (WAITING ${reconnectGraceSeconds}s)...`,
        phase: 'RECONNECTING',
      };
    }

    const isWhiteTurn = chess.turn() === 'w';
    const activeColorName = isWhiteTurn ? 'WHITE' : 'BLACK';
    const isMyTurn = (playerRole === 'w' && isWhiteTurn) || (playerRole === 'b' && !isWhiteTurn);

    let statusText = isMyTurn ? `● YOUR TURN (${activeColorName})` : `○ OPPONENT THINKING (${activeColorName})`;

    const inCheckmate = typeof chess.inCheckmate === 'function' ? chess.inCheckmate() : (typeof chess.in_checkmate === 'function' ? chess.in_checkmate() : false);
    const inDraw = typeof chess.inDraw === 'function' ? chess.inDraw() : (typeof chess.in_draw === 'function' ? chess.in_draw() : false);
    const inCheck = typeof chess.inCheck === 'function' ? chess.inCheck() : (typeof chess.in_check === 'function' ? chess.in_check() : false);

    if (inCheckmate) {
      statusText = `CHECKMATE • ${chess.turn() === 'w' ? 'BLACK' : 'WHITE'} VICTORIOUS`;
    } else if (inDraw) {
      statusText = 'DRAW DECLARED';
    } else if (inCheck) {
      statusText += ' • CHECK!';
    }

    // Determine phase based on move depth
    const moveCount = chess.history().length;
    let phase = 'OPENING';
    if (moveCount > 30) {
      phase = 'ENDGAME';
    } else if (moveCount > 14) {
      phase = 'MIDDLEGAME';
    }

    return { text: statusText, phase };
  }, [isWaiting, roomParam, playerRole, chess, reconnectGraceSeconds]);


  // Player color orientation
  const localColor = playerRole === 'b' ? 'b' : 'w';
  const oppColor = localColor === 'w' ? 'b' : 'w';

  return (
    <>
      <Masthead />

      <div className="arena-layout">
        {/* Column 1: Match Ledger Record & Material Tally */}
        <MatchLedger chess={chess} history={chess.history()} />

        {/* Column 2: Center Arena (Chessboard & Player HUDs) */}
        <main className="board-arena">
          {/* Opponent HUD (Top Banner) */}
          <PlayerHUD
            color={oppColor}
            handle={opponentHandle}
            timeMs={oppColor === 'w' ? clocks.whiteMs : clocks.blackMs}
            isTurnActive={clocks.activeTurn === oppColor}
            isTimed={clocks.isTimed}
            capturedPieces={oppColor === 'w' ? capturedPieces.black : capturedPieces.white}
            isOpponent={true}
          />

          {/* Chessboard */}
          <div className="board-wrapper">
            <ChessBoard
              chess={chess}
              playerRole={playerRole || 'w'}
              selectedSquare={selectedSquare}
              possibleMoves={possibleMoves}
              lastMove={lastMove}
              onSquareClick={handleSquareClick}
              className={isGameOver || isWaiting ? 'pointer-events-none' : ''}
            />
          </div>

          {/* Local Player HUD (Bottom Banner) */}
          <PlayerHUD
            color={localColor}
            handle={myHandle}
            timeMs={localColor === 'w' ? clocks.whiteMs : clocks.blackMs}
            isTurnActive={clocks.activeTurn === localColor}
            isTimed={clocks.isTimed}
            capturedPieces={localColor === 'w' ? capturedPieces.black : capturedPieces.white}
            isOpponent={false}
          />

          {/* Turn & Status Ticker */}
          <div id="status" className="match-status-ticker">
            <span id="turn-badge">{matchStatus.text}</span>
            <span id="game-phase-badge" className="game-phase-badge">
              {matchStatus.phase}
            </span>
          </div>
        </main>

        {/* Column 3: Controls Panel & Live Chat */}
        <aside className="controls-panel">
          <div className="panel-header">
            <span className="panel-title">LIVE CHAT</span>
            <SoundToggleButton />
          </div>

          {/* Action Buttons: Draw offer & Resign */}
          <div id="controls" className="actions-group">
            <button
              type="button"
              id="end-game-btn"
              className="btn-editorial"
              disabled={isGameOver || isWaiting}
              onClick={handleOfferDraw}
            >
              OFFER DRAW &rarr;
            </button>
            <button
              type="button"
              id="resign-btn"
              className="btn-editorial btn-editorial-danger"
              disabled={isGameOver || isWaiting}
              onClick={handleResign}
            >
              RESIGN MATCH &rarr;
            </button>
          </div>

          {/* Live In-Game Chat */}
          <LiveChat messages={chatMessages} onSendMessage={handleSendMessage} />
        </aside>
      </div>

      {/* Modals & Dialogs */}
      <WaitingModal
        isOpen={isWaiting}
        isPrivate={privateRoomInfo.isPrivate}
        roomCode={privateRoomInfo.roomCode}
        expiresAt={privateRoomInfo.expiresAt}
        timeControl={TC_PRESETS[tcParam]?.label || '10 MIN RAPID'}
      />

      <PromotionModal
        isOpen={Boolean(pendingPromotion)}
        onSelectPiece={handlePromotionSelect}
        onCancel={() => setPendingPromotion(null)}
      />

      <EndGameModal
        isOpen={isDrawOfferOpen}
        onAccept={handleAcceptDraw}
        onDecline={handleDeclineDraw}
      />

      <GameOverModal
        isOpen={isGameOver}
        reason={gameOverReason}
        onPlayAgain={handlePlayAgain}
        onReview={handleReviewMatch}
      />

      <Footer />
    </>
  );
}
