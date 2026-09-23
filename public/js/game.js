// What this file does:
// This is the main frontend controller for the live chess match screen (/play).
// It connects the user's browser with the server via WebSockets (Socket.io).
// 
// Main jobs:
// 1. Manages game state (using chess.js for rules and move validation).
// 2. Handles mouse clicks when selecting and moving pieces on the board.
// 3. Listens to server events (match started, opponent moved, game over).
// 4. Updates UI indicators (whose turn it is, captured pieces, move history).
// 5. Handles live in-game chat and resign/draw buttons.
// -------------------------------------------------------------------------

import { getSocket, emitMove, emitChatMessage, emitRequestEndGame, emitRespondEndGame, emitResign } from './modules/socketClient.js';
import { renderBoard } from './modules/boardRenderer.js';
import { updateMoveLedger, updateMaterialBalance } from './modules/moveLedger.js';
import { showWaitingModal, showEndGameModal, showGameOverModal, showToast } from './modules/editorialModals.js';

document.addEventListener('DOMContentLoaded', () => {
    // Connect to WebSocket server and initialize chess rule engine
    const socket = getSocket();
    const chess = new Chess();

    // Element Selectors
    const boardElement = document.querySelector('#chessboard');
    const ledgerContainer = document.querySelector('#ledger-container');
    const whiteCapturedEl = document.querySelector('#white-captured-pieces');
    const blackCapturedEl = document.querySelector('#black-captured-pieces');
    const materialBalanceEl = document.querySelector('#material-balance');

    const playerNameEl = document.querySelector('#player-name');
    const opponentNameEl = document.querySelector('#opponent-name');
    const playerColorIndicator = document.querySelector('#player-color-indicator');
    const opponentColorIndicator = document.querySelector('#opponent-color-indicator');
    const turnBadge = document.querySelector('#turn-badge');
    const gamePhaseBadge = document.querySelector('#game-phase-badge');

    const endGameBtn = document.querySelector('#end-game-btn');
    const resignBtn = document.querySelector('#resign-btn');
    const acceptEndGameBtn = document.querySelector('#accept-end-game');
    const declineEndGameBtn = document.querySelector('#decline-end-game');

    const dispatchMessages = document.querySelector('#dispatch-messages');
    const dispatchForm = document.querySelector('#dispatch-form');
    const dispatchInput = document.querySelector('#dispatch-input');
    const cannedButtons = document.querySelectorAll('.btn-canned');

    // -------------------------------------------------------------
    // Active Match State
    // -------------------------------------------------------------
    let playerRole = null;       // 'w' for White, 'b' for Black, or null if spectating/waiting
    let selectedSquare = null;   // The board square currently clicked by user { row, col, name }
    let possibleMoves = [];      // Array of valid destination squares for the selected piece
    let lastMove = null;         // The most recent move played (used to highlight squares)
    let isMatchConcluded = false;// True once checkmate, draw, or resignation occurs

    // Updates the top status bar (e.g. "YOUR TURN", "CHECK", "CHECKMATE")
    function updateMatchStatus() {
        if (!turnBadge) return;

        if (!playerRole) {
            turnBadge.textContent = 'SPECTATING / QUEUED';
            return;
        }

        const isWhiteTurn = chess.turn() === 'w';
        const activeTurnName = isWhiteTurn ? 'WHITE' : 'BLACK';
        const isMyTurn = (playerRole === 'w' && isWhiteTurn) || (playerRole === 'b' && !isWhiteTurn);

        let statusText = isMyTurn ? `● YOUR TURN (${activeTurnName})` : `○ OPPONENT THINKING (${activeTurnName})`;

        // Check game conditions
        const isCheckmate = typeof chess.in_checkmate === 'function' ? chess.in_checkmate() : (typeof chess.isCheckmate === 'function' ? chess.isCheckmate() : false);
        const isDraw = typeof chess.in_draw === 'function' ? chess.in_draw() : (typeof chess.isDraw === 'function' ? chess.isDraw() : false);
        const isCheck = typeof chess.in_check === 'function' ? chess.in_check() : (typeof chess.isCheck === 'function' ? chess.isCheck() : false);

        if (isCheckmate) {
            statusText = `CHECKMATE &bull; ${chess.turn() === 'w' ? 'BLACK' : 'WHITE'} VICTORIOUS`;
        } else if (isDraw) {
            statusText = 'DRAW DECLARED';
        } else if (isCheck) {
            statusText += ' &bull; CHECK!';
        }

        turnBadge.innerHTML = statusText;
    }

    // Redraws the board, piece positions, move history list, and material score
    function refreshUI() {
        renderBoard({
            boardElement,
            chess,
            playerRole,
            selectedSquare,
            possibleMoves,
            lastMove,
            onSquareClick: handleSquareClick
        });

        updateMoveLedger(chess.history({ verbose: true }), ledgerContainer);
        updateMaterialBalance(chess, whiteCapturedEl, blackCapturedEl, materialBalanceEl);
        updateMatchStatus();
    }

    // Handles what happens when a player clicks on any square of the chessboard
    function handleSquareClick(row, col, squareName, square) {
        // Ignore clicks if the game hasn't assigned a role yet
        if (!playerRole) return;

        const isMyTurn = (playerRole === 'w' && chess.turn() === 'w') ||
            (playerRole === 'b' && chess.turn() === 'b');

        // Case 1: Player already selected a piece and now clicked a destination square to move it
        if (selectedSquare) {
            const moveAttempt = possibleMoves.find(m => m.to === squareName);

            if (moveAttempt) {
                if (!isMyTurn) {
                    showToast("Wait for opponent's move.");
                    return;
                }

                // Send the move to the server via WebSocket
                emitMove({
                    from: selectedSquare.name,
                    to: squareName,
                    promotion: moveAttempt.promotion || 'q' // Auto-promote to Queen if pawn reaches end
                });

                // Clear selection highlight after making the move
                selectedSquare = null;
                possibleMoves = [];
                refreshUI();
                return;
            }
        }

        // Case 2: Player clicked on one of their own pieces to select it
        if (square && square.color === playerRole) {
            // If clicking the same piece twice, unselect it
            if (selectedSquare && selectedSquare.row === row && selectedSquare.col === col) {
                selectedSquare = null;
                possibleMoves = [];
            } else {
                // Select piece and find all valid legal moves it can make
                selectedSquare = { row, col, name: squareName };
                possibleMoves = chess.moves({ square: squareName, verbose: true });
            }
            refreshUI();
            return;
        }

        // Case 3: Clicked an empty square or opponent's piece without a valid move -> clear selection
        selectedSquare = null;
        possibleMoves = [];
        refreshUI();
    }

    // -------------------------------------------------------------
    // WebSocket Event Listeners (Incoming messages from server)
    // -------------------------------------------------------------

    // 1. Waiting for another player to join matchmaking
    socket.on('waitingForOpponent', () => {
        isMatchConcluded = false;
        showWaitingModal(true);
        const gameOverModal = document.querySelector('#game-over-modal');
        if (gameOverModal) gameOverModal.classList.add('hidden');
        const endGameModal = document.querySelector('#end-game-modal');
        if (endGameModal) endGameModal.classList.add('hidden');

        chess.reset();
        lastMove = null;
        selectedSquare = null;
        possibleMoves = [];
        playerRole = null;

        // Dim board until match starts
        if (boardElement) boardElement.classList.add('opacity-40', 'pointer-events-none');
        if (endGameBtn) endGameBtn.classList.add('hidden');
        if (resignBtn) resignBtn.classList.add('hidden');
        if (turnBadge) turnBadge.textContent = 'QUEUED // AWAITING OPPONENT';

        refreshUI();
    });

    // 2. Both players matched -> start playing
    socket.on('startGame', () => {
        isMatchConcluded = false;
        showWaitingModal(false);
        const gameOverModal = document.querySelector('#game-over-modal');
        if (gameOverModal) gameOverModal.classList.add('hidden');
        const endGameModal = document.querySelector('#end-game-modal');
        if (endGameModal) endGameModal.classList.add('hidden');

        // Enable board interactions
        if (boardElement) boardElement.classList.remove('opacity-40', 'pointer-events-none');
        if (endGameBtn) endGameBtn.classList.remove('hidden');
        if (resignBtn) resignBtn.classList.remove('hidden');
        showToast('Opponent connected. Match initiated.');
    });

    // 3. Server tells us whether we are playing White ('w') or Black ('b')
    socket.on('playerRole', (role) => {
        playerRole = role;

        if (playerRole === 'w') {
            if (playerNameEl) playerNameEl.textContent = 'WHITE (YOU)';
            if (opponentNameEl) opponentNameEl.textContent = 'BLACK (OPPONENT)';
            if (playerColorIndicator) playerColorIndicator.className = 'player-role-indicator white';
            if (opponentColorIndicator) opponentColorIndicator.className = 'player-role-indicator black';
        } else {
            if (playerNameEl) playerNameEl.textContent = 'BLACK (YOU)';
            if (opponentNameEl) opponentNameEl.textContent = 'WHITE (OPPONENT)';
            if (playerColorIndicator) playerColorIndicator.className = 'player-role-indicator black';
            if (opponentColorIndicator) opponentColorIndicator.className = 'player-role-indicator white';
        }

        refreshUI();
    });

    // 4. Initial board state synchronization
    socket.on('boardState', (fen) => {
        if (chess.history().length === 0) {
            chess.load(fen);
            refreshUI();
        }
    });

    // 5. Opponent or server broadcasted a verified move
    socket.on('move', (move) => {
        const result = chess.move(move);
        if (result) {
            lastMove = move;
            refreshUI();
        }
    });

    // 6. Move rejected by server rules
    socket.on('invalidMove', () => {
        showToast('Invalid move according to standard FIDE rules.');
        refreshUI();
    });

    // 7. Game ended (checkmate, draw, or resignation)
    socket.on('gameOver', (data) => {
        isMatchConcluded = true;
        const reason = (typeof data === 'object' && data.reason) ? data.reason : data;
        const finalPgn = (typeof data === 'object' && data.pgn) ? data.pgn : chess.pgn();

        showGameOverModal(reason);
        if (boardElement) boardElement.classList.add('pointer-events-none');
        if (endGameBtn) endGameBtn.classList.add('hidden');
        if (resignBtn) resignBtn.classList.add('hidden');

        // Save game history to browser session so Review page (/review) can analyze it
        try {
            sessionStorage.setItem('chessyy_review_pgn', finalPgn);
        } catch (e) {}
    });

    // 8. Opponent navigated away to the analysis/review page
    socket.on('opponentLeftRoom', () => {
        showToast('Opponent navigated to review.');
    });

    // 9. Opponent disconnected notification
    socket.on('opponentDisconnected', () => {
        showToast('Opponent disconnected from the match.');
    });

    // 10. Draw / Rematch negotiation events
    socket.on('opponentRequestedEndGame', () => {
        showEndGameModal(true);
    });

    socket.on('endGameDeclined', () => {
        showToast('Opponent declined the draw/reset offer.');
    });

    socket.on('gameEnded', (msg) => {
        showEndGameModal(false);
        chess.reset();
        lastMove = null;
        selectedSquare = null;
        possibleMoves = [];
        showToast(msg);
        refreshUI();
    });

    // -------------------------------------------------------------
    // Live In-Game Chat System
    // -------------------------------------------------------------

    // Appends a new chat bubble to the message box
    function appendChatMessage(sender, message, timestamp) {
        if (!dispatchMessages) return;

        const isSelf = (playerRole === 'w' && sender === 'White') ||
            (playerRole === 'b' && sender === 'Black');

        const msgEl = document.createElement('div');
        msgEl.classList.add('dispatch-msg');
        if (isSelf) msgEl.classList.add('self');

        msgEl.innerHTML = `
            <div class="dispatch-msg-header">
                <span class="font-bold">${sender.toUpperCase()}</span>
                <span>${timestamp}</span>
            </div>
            <div>${escapeHtml(message)}</div>
        `;

        dispatchMessages.appendChild(msgEl);
        dispatchMessages.scrollTop = dispatchMessages.scrollHeight; // Auto-scroll to bottom
    }

    // Security helper: prevents script injection (XSS) in chat
    function escapeHtml(str) {
        return str.replace(/[&<>'"]/g, tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag));
    }

    // Receive chat message sent from opponent
    socket.on('receiveChatMessage', (data) => {
        appendChatMessage(data.sender, data.message, data.timestamp);
    });

    // Chat form submit listener
    if (dispatchForm && dispatchInput) {
        dispatchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = dispatchInput.value.trim();
            if (text) {
                emitChatMessage(text);
                dispatchInput.value = '';
            }
        });
    }

    // Pre-made quick reaction chat buttons (e.g. "Good luck!", "Nice move!")
    cannedButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const msg = btn.dataset.msg;
            if (msg) {
                emitChatMessage(msg);
            }
        });
    });

    // -------------------------------------------------------------
    // Match Controls: Resign, Draw, and Review
    // -------------------------------------------------------------

    if (endGameBtn) {
        endGameBtn.addEventListener('click', () => {
            emitRequestEndGame();
            showToast('Draw/Reset proposal dispatched to opponent.');
        });
    }

    if (resignBtn) {
        resignBtn.addEventListener('click', () => {
            if (confirm('Are you sure you wish to resign this match?')) {
                emitResign();
            }
        });
    }

    if (acceptEndGameBtn) {
        acceptEndGameBtn.addEventListener('click', () => {
            emitRespondEndGame(true);
            showEndGameModal(false);
        });
    }

    if (declineEndGameBtn) {
        declineEndGameBtn.addEventListener('click', () => {
            emitRespondEndGame(false);
            showEndGameModal(false);
        });
    }

    // Button to open the Post-Match Stockfish + Gemini Analysis screen
    const reviewGameBtn = document.querySelector('#review-game-btn');
    if (reviewGameBtn) {
        reviewGameBtn.addEventListener('click', () => {
            try {
                const storedPgn = sessionStorage.getItem('chessyy_review_pgn');
                if (!storedPgn || !storedPgn.trim()) {
                    const clientPgn = chess.pgn();
                    if (clientPgn && clientPgn.trim()) {
                        sessionStorage.setItem('chessyy_review_pgn', clientPgn);
                    }
                }
            } catch (e) {}
            window.location.href = '/review';
        });
    }

    // -------------------------------------------------------------
    // Initial Setup: Waiting state before players connect
    // -------------------------------------------------------------
    showWaitingModal(true);
    if (boardElement) boardElement.classList.add('opacity-40', 'pointer-events-none');
    if (endGameBtn) endGameBtn.classList.add('hidden');
    if (resignBtn) resignBtn.classList.add('hidden');
    if (turnBadge) turnBadge.textContent = 'QUEUED // AWAITING OPPONENT';

    // Initial render of empty/starting board
    refreshUI();
});
