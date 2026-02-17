const express = require('express');
const socket = require('socket.io');
const http = require('http');
const { Chess } = require('chess.js');
const path = require('path');
require('dotenv').config();

const app = express();

const server = http.createServer(app);
const io = socket(server);

// Store active games
let games = {};
let waitingPlayer = null;

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.render('index', { title: "Chess Game" });
});

io.on('connection', (socket) => {
    // Matchmaking Logic
    if (!waitingPlayer) {
        waitingPlayer = socket;
        socket.emit("waitingForOpponent");
    } else {
        const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const whiteSocket = waitingPlayer;
        const blackSocket = socket;

        waitingPlayer = null;

        const chess = new Chess();

        games[gameId] = {
            chess: chess,
            white: whiteSocket.id,
            black: blackSocket.id,
            sockets: {
                [whiteSocket.id]: whiteSocket,
                [blackSocket.id]: blackSocket
            }
        };

        whiteSocket.join(gameId);
        blackSocket.join(gameId);

        io.to(gameId).emit("startGame", null);

        whiteSocket.emit("playerRole", "w");
        blackSocket.emit("playerRole", "b");

        io.to(gameId).emit("boardState", chess.fen());
    }

    socket.on('disconnect', () => {
        if (waitingPlayer === socket) {
            waitingPlayer = null;
        } else {
            const gameId = Object.keys(games).find(id =>
                games[id].white === socket.id || games[id].black === socket.id
            );

            if (gameId) {
                io.to(gameId).emit("opponentDisconnected");
                delete games[gameId];
            }
        }
    });

    socket.on("move", (move) => {
        const gameId = Object.keys(games).find(id =>
            games[id].white === socket.id || games[id].black === socket.id
        );

        if (!gameId) return;

        const game = games[gameId];
        const chess = game.chess;

        try {
            if (chess.turn() === "w" && game.white !== socket.id) return;
            if (chess.turn() === "b" && game.black !== socket.id) return;

            const result = chess.move(move);
            if (result) {
                io.to(gameId).emit("move", move);
                io.to(gameId).emit("boardState", chess.fen());

                if (chess.isGameOver()) {
                    let reason = "";
                    if (chess.isCheckmate()) {
                        reason = `Checkmate! ${chess.turn() === "w" ? "Black" : "White"} wins.`;
                    } else if (chess.isDraw()) {
                        reason = "Game ended in a draw.";
                    } else if (chess.isStalemate()) {
                        reason = "Game ended in a stalemate.";
                    } else {
                        reason = "Game over.";
                    }
                    io.to(gameId).emit("gameOver", reason);
                }
            } else {
                console.log("Invalid move: ", move);
                socket.emit("invalidMove", move);
            }
        } catch (error) {
            console.log(error);
            socket.emit("invalidMove", move);
        }
    });

    socket.on("requestEndGame", () => {
        const gameId = Object.keys(games).find(id =>
            games[id].white === socket.id || games[id].black === socket.id
        );
        if (gameId) {
            socket.to(gameId).emit("opponentRequestedEndGame");
        }
    });

    socket.on("respondEndGame", (response) => {
        const gameId = Object.keys(games).find(id =>
            games[id].white === socket.id || games[id].black === socket.id
        );

        if (!gameId) return;

        if (response) {
            const game = games[gameId];
            const chess = new Chess();
            game.chess = chess;
            io.to(gameId).emit("gameEnded", "Game ended by mutual agreement. Board reset.");
            io.to(gameId).emit("boardState", chess.fen());
        } else {
            socket.to(gameId).emit("endGameDeclined");
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, function () {
    console.log(`listening on port: ${PORT}`);
});
