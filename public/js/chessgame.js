const socket = io();
const chess = new Chess();

const boardElement = document.querySelector("#chessboard");
const waitingMessage = document.querySelector("#waiting-message");
const endGameBtn = document.querySelector("#end-game-btn");
const endGameModal = document.querySelector("#end-game-modal");
const acceptEndGameBtn = document.querySelector("#accept-end-game");
const declineEndGameBtn = document.querySelector("#decline-end-game");
const gameOverModal = document.querySelector("#game-over-modal");
const gameOverReason = document.querySelector("#game-over-reason");
const notification = document.querySelector("#notification");
const notificationText = document.querySelector("#notification-text");
const statusElement = document.querySelector("#status");

let draggedPiece = null;
let draggedSource = null;
let playerRole = null;

//render board
const renderBoard = () => {
    // Update HUD names based on role
    const playerNameEl = document.querySelector("#player-name");
    const opponentNameEl = document.querySelector("#opponent-name");

    if (playerNameEl && opponentNameEl) {
        if (playerRole === 'b') {
            playerNameEl.innerText = "Black";
            opponentNameEl.innerText = "White";
        } else {
            playerNameEl.innerText = "White";
            opponentNameEl.innerText = "Black";
        }
    }

    const board = chess.board();
    boardElement.innerHTML = "";

    if (playerRole === 'b') {
        boardElement.classList.add("flipped");
    } else {
        boardElement.classList.remove("flipped");
    }

    board.forEach((row, rowIndex) => {
        row.forEach((square, squareIndex) => {
            const squareElement = document.createElement("div");
            squareElement.classList.add("square");
            squareElement.classList.add((rowIndex + squareIndex) % 2 === 0 ? "light" : "dark");
            squareElement.dataset.row = rowIndex;
            squareElement.dataset.col = squareIndex;

            // Highlight selected square
            if (selectedSquare && selectedSquare.row === rowIndex && selectedSquare.col === squareIndex) {
                squareElement.classList.add("selected");
            }

            // Show legal moves
            const move = possibleMoves.find(m => m.to === `${String.fromCharCode(97 + squareIndex)}${8 - rowIndex}`);
            if (move) {
                const indicator = document.createElement("div");
                // Check if it's a capture or en passant
                if (move.flags.includes('c') || move.flags.includes('e')) {
                    indicator.classList.add("available-move-capture");
                } else {
                    indicator.classList.add("available-move");
                }
                squareElement.appendChild(indicator);
            }

            // Click handler for move/select
            squareElement.addEventListener("click", (e) => {
                // prevent propagating to parent if any
                e.stopPropagation();
                handleSquareClick(rowIndex, squareIndex);
            });


            if (square) {
                const pieceElement = document.createElement("div");
                pieceElement.classList.add("piece",
                    square.color === "w" ? "white" : "black");

                pieceElement.textContent = getPieceUnicode(square.type);
                // No draggable attribute or events
                squareElement.appendChild(pieceElement);
            }

            boardElement.appendChild(squareElement);
        });
    });

    updateStatus();
    // updateCapturedPieces(); // Evaluation logic removed
}

let selectedSquare = null;
let possibleMoves = [];

const handleSquareClick = (row, col) => {
    // Only allow interaction if it's our role
    if (!playerRole) return;

    // Convert click to algebraic
    const targetSquareNotation = `${String.fromCharCode(97 + col)}${8 - row}`;

    // IF we have a selected piece, check if this click is a valid move
    if (selectedSquare) {
        // Find if this target is in possible moves
        const move = possibleMoves.find(m => m.to === targetSquareNotation);
        if (move) {
            // It is a valid move! Execute it.
            socket.emit("move", move);
            selectedSquare = null;
            possibleMoves = [];
            // Optimistic UI update or wait for server? Wait for server is safer for consistency.
            // renderBoard(); // Optional, server update comes fast usually
            return;
        }
    }

    // If not a move, check if we are selecting a piece
    const board = chess.board();
    const piece = board[row][col];

    if (piece && piece.color === playerRole) {
        // It's our piece, select it
        if (selectedSquare && selectedSquare.row === row && selectedSquare.col === col) {
            // Deselect if clicking same piece (toggle)
            selectedSquare = null;
            possibleMoves = [];
        } else {
            selectedSquare = { row, col };
            // Calculate legal moves for this piece
            const fromSquare = `${String.fromCharCode(97 + col)}${8 - row}`;
            possibleMoves = chess.moves({ square: fromSquare, verbose: true });
        }
        renderBoard();
    } else {
        // Clicked empty square or opponent piece (and not a valid move)
        selectedSquare = null;
        possibleMoves = [];
        renderBoard();
    }
}

// handleMove function removed as it was only used for drag-drop

const getPieceUnicode = (piece) => {
    const unicodePieces = {
        p: '♙', r: '♖', n: '♘', b: '♗', q: '♕', k: '♔',
        P: '♙', R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔',
    };
    return unicodePieces[piece.type || piece] || "";
}

// updateCapturedPieces function removed as evaluation logic is no longer needed.

const showNotification = (message, duration = 3000) => {
    if (!notification || !notificationText) return;
    notificationText.textContent = message;
    notification.classList.remove("hidden");
    setTimeout(() => {
        notification.classList.add("hidden");
    }, duration);
};

const updateStatus = () => {
    if (!statusElement) return;
    if (!playerRole) {
        statusElement.textContent = "Spectating / Waiting";
        return;
    }
    const turn = chess.turn() === 'w' ? "White" : "Black";
    statusElement.textContent = `Role: ${playerRole === 'w' ? "White" : "Black"} | Turn: ${turn}`;

    if (chess.isCheckmate()) {
        statusElement.textContent += " | CHECKMATE!";
    } else if (chess.isDraw()) {
        statusElement.textContent += " | DRAW!";
    } else if (chess.isCheck()) {
        statusElement.textContent += " | CHECK!";
    }
}

// Socket Events

socket.on("waitingForOpponent", () => {
    waitingMessage.classList.remove("hidden");
    boardElement.classList.add("opacity-50", "pointer-events-none");
    endGameBtn.classList.add("hidden");
    statusElement.textContent = "Waiting for opponent...";
});

socket.on("startGame", () => {
    waitingMessage.classList.add("hidden");
    boardElement.classList.remove("opacity-50", "pointer-events-none");
    endGameBtn.classList.remove("hidden");
});

socket.on("playerRole", function (role) {
    playerRole = role;
    renderBoard();
});

socket.on("spectator", function () {
    playerRole = null;
    renderBoard();
});

socket.on("boardState", function (fen) {
    chess.load(fen);
    renderBoard();
});

socket.on("move", function (move) {
    chess.move(move);
    renderBoard();
});

socket.on("invalidMove", function (move) {
    // Optionally alert user or just snap back (renderBoard handles snap back by re-rendering state)
    renderBoard();
});

// End Game Logic
endGameBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to propose ending the game?")) {
        socket.emit("requestEndGame");
        showNotification("End game request sent.");
    }
});

socket.on("opponentRequestedEndGame", () => {
    endGameModal.classList.remove("hidden");
});

acceptEndGameBtn.addEventListener("click", () => {
    socket.emit("respondEndGame", true);
    endGameModal.classList.add("hidden");
});

declineEndGameBtn.addEventListener("click", () => {
    socket.emit("respondEndGame", false);
    endGameModal.classList.add("hidden");
});

socket.on("endGameDeclined", () => {
    alert("Your opponent doesn't want the game to end");
});

socket.on("gameEnded", (message) => {
    alert(message);
    // Board state is usually reset by server sending new FEN, but we can clear local highlighting if any
});

socket.on("opponentDisconnected", () => {
    alert("Opponent disconnected. Refresh to find a new game.");
    boardElement.classList.add("opacity-50", "pointer-events-none");
});

socket.on("gameOver", (reason) => {
    gameOverReason.textContent = reason;
    gameOverModal.classList.remove("hidden");
    boardElement.classList.add("pointer-events-none");
});

renderBoard();