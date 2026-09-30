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

  // Reset scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // URL Parameters
  const tcParam = searchParams.get('tc') || 'rapid_10_0';
  const roomParam = searchParams.get('room') ? searchParams.get('room').trim().toUpperCase() : null;
  const roleParam = searchParams.get('role') ? searchParams.get('role').trim().toLowerCase() : null; // 'host' | 'guest'

  const tcConfig = TC_PRESETS[tcParam] || TC_PRESETS.rapid_10_0;
  const isTimedMatch = tcConfig.initialMs > 0;

  // Chess Game State
  const [chess] = useState(() => new Chess());
  const [, setBoardRevision] = useState(0); // Forces re-render on chess state change
  const [playerRole, setPlayerRole] = useState(null); // 'w' | 'b' | null

  const [opponentHandle, setOpponentHandle] = useState('OPPONENT');
  const [matchPlayers, setMatchPlayers] = useState({ white: 'WHITE', black: 'BLACK' });
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [possibleMoves, setPossibleMoves] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [pendingPromotion, setPendingPromotion] = useState(null);

  // Clocks
  const [clocks, setClocks] = useState({
    isTimed: isTimedMatch,
    whiteMs: tcConfig.initialMs,
    blackMs: tcConfig.initialMs,
    activeTurn: null,
  });
  const lowTimeTickRef = useRef(0);

  // Modals & Status
  const [isWaiting, setIsWaiting] = useState(() => {
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

  // Grace period countdown ticker when opponent is disconnected
  useEffect(() => {
    if (reconnectGraceSeconds === null || reconnectGraceSeconds <= 0) return;
    const timer = setInterval(() => {
      setReconnectGraceSeconds((prev) => (prev > 1 ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(timer);
  }, [reconnectGraceSeconds]);

  const triggerRender = useCallback(() => {
    setBoardRevision((v) => v + 1);
  }, []);

  // Update captured pieces for HUD
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

  // Audio trigger helper
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

  // Stable references for socket handlers to prevent ANY infinite re-render loops
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

  // Socket Lifecycle & Matchmaking (Runs ONCE per socket connection session)
  useEffect(() => {
    if (!socket || !isConnected) return;

    const safeHandle = (myHandleRef.current || 'ANONYMOUS').toUpperCase().substring(0, 10);

    // Helper: Standard queue/room join
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

    //Check for existing active session in sessionStorage (from refresh or network drop)
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

    // Waiting for opponent in random queue
    const handleWaitingForOpponent = () => {
      setIsWaiting(true);
    };

    // Private Room Creation Acknowledged
    const handlePrivateCreated = (data) => {
      setPrivateRoomInfo({
        isPrivate: true,
        roomCode: data.roomCode,
        expiresAt: data.expiresAt,
      });
      setIsWaiting(true);
    };

    // Private Room Expired
    const handlePrivateExpired = (data) => {
      showToastRef.current(data.message || 'Room code expired.');
      navigateRef.current('/');
    };

    //Room Error
    const handlePrivateError = (data) => {
      showToastRef.current(data.message || 'Room connection failed.');
      navigateRef.current('/');
    };

    // Match Started (emitted to both players)
    const handleStartGame = (data) => {
      setIsWaiting(false);
      setReconnectGraceSeconds(null);
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
      setIsWaiting(false);
      showToastRef.current(`Match started! You are ${role === 'w' ? 'WHITE' : 'BLACK'}.`);
    };

    // Initial Board State Sync
    const handleBoardState = (fen) => {
      if (chessRef.current.history().length === 0) {
        chessRef.current.load(fen);
        triggerRenderRef.current();
        updateCapturedPiecesRef.current();
      }
    };

    // Reconnected to Existing Live Game Snapshot
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

      if (data.fen) {
        chessRef.current.load(data.fen);
      }

      if (Array.isArray(data.history) && data.history.length > 0) {
        const last = data.history[data.history.length - 1];
        setLastMove({ from: last.from, to: last.to });
      }

      if (data.clocks) {
        setClocks({
          isTimed: Boolean(data.clocks.isTimed),
          whiteMs: data.clocks.whiteMs,
          blackMs: data.clocks.blackMs,
          activeTurn: data.clocks.activeTurn,
        });
      }

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
        sessionStorage.setItem('chessyy_review_pgn', data.pgn || chessRef.current.pgn());
      } catch {}

      showToastRef.current('Reconnected to live match!');
    };

    // Reconnect Failed (Game ended or token expired)
    const handleReconnectFailed = (err) => {
      console.log('[Socket] Reconnect failed:', err?.message);
      try {
        sessionStorage.removeItem('chessyy_active_game');
      } catch {}
      setIsWaiting(true);
      showToastRef.current(err?.message || 'Previous session expired. Entering matchmaking...');
      joinStandardMatch();
    };

    // Opponent Disconnected Grace Window
    const handleOpponentDisconnectedGrace = (data) => {
      const sec = data?.graceSeconds || 30;
      setReconnectGraceSeconds(sec);
      showToastRef.current(`Opponent disconnected! Waiting up to ${sec}s for reconnection...`);
    };

    // Opponent Reconnected
    const handleOpponentReconnected = (data) => {
      setReconnectGraceSeconds(null);
      showToastRef.current(`Opponent (${data?.name || 'Opponent'}) reconnected! Resuming match.`);
    };

    // Opponent Left Finished Room
    const handleOpponentLeftRoom = () => {
      setReconnectGraceSeconds(null);
      showToastRef.current('Opponent left the room.');
    };

    // Verified Move from Server
    const handleMove = (move) => {
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
    };

    // Invalid Move Alert
    const handleInvalidMove = () => {
      showToastRef.current('Invalid move according to standard FIDE rules.');
      triggerRenderRef.current();
    };

    // Clock Synchronization
    const handleClockSync = (data) => {
      setClocks({
        isTimed: data.activeTurn !== null,
        whiteMs: data.whiteMs,
        blackMs: data.blackMs,
        activeTurn: data.activeTurn,
      });
    };

    // In-game Chat Message Received
    const handleReceiveChatMessage = (chatEntry) => {
      setChatMessages((prev) => [
        ...prev,
        {
          sender: chatEntry.sender || 'PLAYER',
          senderLabel: chatEntry.senderName || chatEntry.sender,
          text: chatEntry.message,
          timestamp: chatEntry.timestamp,
          isSelf: chatEntry.senderName === safeHandle,
        },
      ]);
    };

    // Draw / Rematch Proposals
    const handleOpponentRequestedEndGame = () => {
      setIsDrawOfferOpen(true);
    };

    const handleEndGameDeclined = () => {
      showToastRef.current('Opponent declined the draw offer.');
    };

    // Game Concluded
    const handleGameOver = (data) => {
      try {
        sessionStorage.removeItem('chessyy_active_game');
      } catch {}
      setReconnectGraceSeconds(null);
      setIsGameOver(true);
      setClocks((prev) => ({ ...prev, activeTurn: null }));
      playGameOverSoundRef.current();

      const reason = typeof data === 'object' && data.reason ? data.reason : data;
      const finalPgn = typeof data === 'object' && data.pgn ? data.pgn : chessRef.current.pgn();
      const playersRoster = typeof data === 'object' && data.players ? data.players : matchPlayersRef.current;

      setGameOverReason(reason);

      try {
        sessionStorage.setItem('chessyy_review_pgn', finalPgn);
        sessionStorage.setItem('chessyy_review_players', JSON.stringify(playersRoster));
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

  // Local Clock Ticker (runs every 100ms for zero-drift sub-second display)
  useEffect(() => {
    if (!clocks.activeTurn || isGameOver || isWaiting || !clocks.isTimed) return;

    const interval = setInterval(() => {
      setClocks((prev) => {
        if (!prev.activeTurn || !prev.isTimed) return prev;
        const key = prev.activeTurn === 'w' ? 'whiteMs' : 'blackMs';
        const updatedMs = Math.max(0, prev[key] - 100);

        // Low time tick audio
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

  // Click square handler
  const handleSquareClick = (rowIndex, colIndex, squareName, pieceOnSquare) => {
    if (isGameOver || isWaiting || !playerRole) return;
    if (chess.turn() !== playerRole) return; // Not your turn!

    // If no piece is currently selected:
    if (!selectedSquare) {
      if (pieceOnSquare && pieceOnSquare.color === playerRole) {
        const moves = chess.moves({ square: squareName, verbose: true });
        setSelectedSquare({ row: rowIndex, col: colIndex, squareName });
        setPossibleMoves(moves);
      }
      return;
    }

    // If clicking another piece of player's own color: switch selection
    if (pieceOnSquare && pieceOnSquare.color === playerRole) {
      if (selectedSquare.squareName === squareName) {
        // Deselect
        setSelectedSquare(null);
        setPossibleMoves([]);
      } else {
        const moves = chess.moves({ square: squareName, verbose: true });
        setSelectedSquare({ row: rowIndex, col: colIndex, squareName });
        setPossibleMoves(moves);
      }
      return;
    }

    // Clicking a destination square:
    const targetMove = possibleMoves.find((m) => m.to === squareName);
    if (!targetMove) {
      setSelectedSquare(null);
      setPossibleMoves([]);
      return;
    }

    // Check for Pawn Promotion (White moving to 8th rank or Black to 1st rank)
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

  const handleSendMessage = (text) => {
    socket?.emit('sendChatMessage', { message: text });
  };

  const handlePlayAgain = () => {
    try {
      sessionStorage.removeItem('chessyy_active_game');
    } catch {}
    setIsGameOver(false);
    navigate(0); // Refresh match screen
  };

  // Status ticker text calculation
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
            <span className="panel-title">02 / PROTOCOL &amp; DISPATCH</span>
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
              OFFER DRAW / RESET &rarr;
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
      />

      <Footer />
    </>
  );
}
