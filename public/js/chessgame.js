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

const renderBoard = () => {
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

            if (selectedSquare && selectedSquare.row === rowIndex && selectedSquare.col === squareIndex) {
                squareElement.classList.add("selected");
            }

            const move = possibleMoves.find(m => m.to === `${String.fromCharCode(97 + squareIndex)}${8 - rowIndex}`);
            if (move) {
                const indicator = document.createElement("div");
                if (move.flags.includes('c') || move.flags.includes('e')) {
                    indicator.classList.add("available-move-capture");
                } else {
                    indicator.classList.add("available-move");
                }
                squareElement.appendChild(indicator);
            }

            squareElement.addEventListener("click", (e) => {
                e.stopPropagation();
                handleSquareClick(rowIndex, squareIndex);
            });


            if (square) {
                const pieceElement = document.createElement("div");
                pieceElement.classList.add("piece",
                    square.color === "w" ? "white" : "black");

                pieceElement.textContent = getPieceUnicode(square.type);
                squareElement.appendChild(pieceElement);
            }

            boardElement.appendChild(squareElement);
        });
    });

    updateStatus();
}

let selectedSquare = null;
let possibleMoves = [];

const handleSquareClick = (row, col) => {
    if (!playerRole) return;

    const targetSquareNotation = `${String.fromCharCode(97 + col)}${8 - row}`;

    if (selectedSquare) {
        const move = possibleMoves.find(m => m.to === targetSquareNotation);
        if (move) {
            socket.emit("move", move);
            selectedSquare = null;
            possibleMoves = [];
            return;
        }
    }

    const board = chess.board();
    const piece = board[row][col];

    if (piece && piece.color === playerRole) {
        if (selectedSquare && selectedSquare.row === row && selectedSquare.col === col) {
            selectedSquare = null;
            possibleMoves = [];
        } else {
            selectedSquare = { row, col };
            const fromSquare = `${String.fromCharCode(97 + col)}${8 - row}`;
            possibleMoves = chess.moves({ square: fromSquare, verbose: true });
        }
        renderBoard();
    } else {
        selectedSquare = null;
        possibleMoves = [];
        renderBoard();
    }
}

const getPieceUnicode = (piece) => {
    const unicodePieces = {
        p: '♙', r: '♖', n: '♘', b: '♗', q: '♕', k: '♔',
        P: '♙', R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔',
    };
    return unicodePieces[piece.type || piece] || "";
}

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

// --- Socket Events ---

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
    renderBoard();
});

// --- End Game Logic ---

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