const express = require('express');
require('dotenv').config();
const socket = require('socket.io');
const http = require('http');
const { Chess } = require('chess.js');
const path = require('path');

const app = express();

const server = http.createServer(app);
const io = socket(server);

// Store active games
let games = {};
// Track the socket waiting for an opponent
let waitingPlayer = null;

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.render('index');
});

io.on('connection', (socket) => {
    console.log('a user connected:', socket.id);

    if (!waitingPlayer) {
        // No one is waiting, so this user waits
        waitingPlayer = socket;
        socket.emit("waitingForOpponent");
    } else {
        // Someone is waiting, match them!
        const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const whiteSocket = waitingPlayer;
        const blackSocket = socket;

        // Reset waiting player
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

        // Join both players to the room
        whiteSocket.join(gameId);
        blackSocket.join(gameId);

        // Notify players that game has started
        io.to(gameId).emit("startGame", null);

        // Assign roles
        whiteSocket.emit("playerRole", "w");
        blackSocket.emit("playerRole", "b");

        io.to(gameId).emit("boardState", chess.fen());
    }

    socket.on('disconnect', () => {
        console.log('user disconnected:', socket.id);

        if (waitingPlayer === socket) {
            waitingPlayer = null;
        } else {
            // Find game the user was in
            const gameId = Object.keys(games).find(id =>
                games[id].white === socket.id || games[id].black === socket.id
            );

            if (gameId) {
                const game = games[gameId];
                // Notify opponent
                io.to(gameId).emit("opponentDisconnected");
                // Clean up game
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
            // Validate turn matching player role ID
            if (chess.turn() === "w" && game.white !== socket.id) return;
            if (chess.turn() === "b" && game.black !== socket.id) return;

            const result = chess.move(move);
            if (result) {
                io.to(gameId).emit("move", move);
                io.to(gameId).emit("boardState", chess.fen());

                // Check for game over conditions
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
            // Emit to the *other* player in the room
            socket.to(gameId).emit("opponentRequestedEndGame");
        }
    });

    socket.on("respondEndGame", (response) => {
        // response is boolean: true (accept), false (decline)
        const gameId = Object.keys(games).find(id =>
            games[id].white === socket.id || games[id].black === socket.id
        );

        if (!gameId) return;

        if (response) {
            // Accepted: Reset game for both
            const game = games[gameId];
            const chess = new Chess();
            game.chess = chess;
            io.to(gameId).emit("gameEnded", "Game ended by mutual agreement. Board reset.");
            io.to(gameId).emit("boardState", chess.fen());
        } else {
            // Declined: Notify the requester
            socket.to(gameId).emit("endGameDeclined");
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, function () {
    console.log(`listening on port: ${PORT}`);
});
