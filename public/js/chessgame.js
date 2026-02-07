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
    const board = chess.board();
    boardElement.innerHTML = "";

    board.forEach((row, rowIndex) => {
        row.forEach((square, squareIndex) => {
            const squareElement = document.createElement("div");
            squareElement.classList.add("square");
            squareElement.classList.add((rowIndex + squareIndex) % 2 === 0 ? "light" : "dark");
            squareElement.dataset.row = rowIndex;
            squareElement.dataset.col = squareIndex;
            if (square) {
                const pieceElement = document.createElement("div");
                pieceElement.classList.add("piece",
                    square.color === "w" ? "white" : "black");

                pieceElement.textContent = getPieceUnicode(square.type);
                // Only draggable if it's your turn and your piece, AND game is active (implied by role)
                pieceElement.draggable = playerRole === square.color;

                //drag start
                pieceElement.addEventListener("dragstart", (e) => {
                    if (pieceElement.draggable) {
                        draggedPiece = pieceElement;
                        draggedSource = { row: rowIndex, col: squareIndex };
                        e.dataTransfer.setData("text/plain", "");
                    }
                });

                // drag end
                pieceElement.addEventListener("dragend", (e) => {
                    draggedPiece = null;
                    draggedSource = null;
                });
                squareElement.appendChild(pieceElement);
            }

            //drag over
            squareElement.addEventListener("dragover", (e) => {
                e.preventDefault();
            });
            //drop
            squareElement.addEventListener("drop", (e) => {
                e.preventDefault();
                if (!draggedPiece) return;
                const targetSquare = { row: rowIndex, col: squareIndex };
                handleMove(draggedSource, targetSquare);
            });
            boardElement.appendChild(squareElement);
        });
    });

    updateStatus();
}

const handleMove = (source, target) => {
    const cols = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const rows = ["8", "7", "6", "5", "4", "3", "2", "1"];

    const from = `${cols[source.col]}${rows[source.row]}`;
    const to = `${cols[target.col]}${rows[target.row]}`;

    const move = {
        from: from,
        to: to,
        promotion: 'q', // defaults to queen
    };

    socket.emit("move", move);
}

const getPieceUnicode = (piece) => {
    const unicodePieces = {
        p: '♙',
        r: '♖',
        n: '♘',
        b: '♗',
        q: '♕',
        k: '♔',
    };
    return unicodePieces[piece] || "";
}

const showNotification = (message, duration = 3000) => {
    notificationText.textContent = message;
    notification.classList.remove("hidden");
    setTimeout(() => {
        notification.classList.add("hidden");
    }, duration);
};

const updateStatus = () => {
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