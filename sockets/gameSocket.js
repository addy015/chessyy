// What this file does:
// This is the real-time multiplayer backend.
// It uses Socket.io and chess.js to connect two players and manage their live match.
// 
// Main jobs:
// 1. Matchmaking: Pairs two players into an isolated game room.
// 2. Referee: Server validates every move using chess.js (prevents cheating/illegal moves).
// 3. Ephemeral Chat: Relays live in-game messages between the two players (stored in RAM only).
// 4. Game Over: Detects checkmate, draw, stalemate, or resignation.
// 5. Cleanup: Removes match from memory when players disconnect.
// -------------------------------------------------------------------------

const { Chess } = require('chess.js');

function initGameSocket(io) {
    // Stores active games in server memory (RAM): key = gameId, value = match data
    const games = {};
    
    // Holds the socket of a player currently waiting in matchmaking queue
    let waitingPlayer = null;

    io.on('connection', (socket) => {
        console.log('[Socket] Client connected:', socket.id);

        // ---------------------------------------------------------
        // 1. Matchmaking Queue
        // ---------------------------------------------------------
        if (!waitingPlayer || waitingPlayer.id === socket.id) {
            // First player to join waits in line
            waitingPlayer = socket;
            socket.emit('waitingForOpponent');
        } else {
            // Second player arrives -> match both players together!
            const whiteSocket = waitingPlayer;
            const blackSocket = socket;
            waitingPlayer = null; // Clear queue for next pair

            // Generate unique room ID and fresh chess board
            const gameId = `game_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            const chess = new Chess();

            games[gameId] = {
                chess,
                white: whiteSocket.id,
                black: blackSocket.id,
                sockets: {
                    [whiteSocket.id]: whiteSocket,
                    [blackSocket.id]: blackSocket
                },
                chat: [] // Live chat stored in RAM only
            };

            // Join both players to the same Socket.io room
            whiteSocket.join(gameId);
            blackSocket.join(gameId);

            // Announce match start to both players
            io.to(gameId).emit('startGame', { gameId });

            // Assign colors: first player gets White, second gets Black
            whiteSocket.emit('playerRole', 'w');
            blackSocket.emit('playerRole', 'b');

            // Send starting board position (FEN string)
            io.to(gameId).emit('boardState', chess.fen());
        }

        // ---------------------------------------------------------
        // 2. Move Execution & Turn Validation
        // ---------------------------------------------------------
        socket.on('move', (move) => {
            // Find which game room this socket belongs to
            const gameId = Object.keys(games).find(id =>
                games[id].white === socket.id || games[id].black === socket.id
            );

            if (!gameId) return;

            const game = games[gameId];
            const chess = game.chess;

            try {
                // Ensure only the player whose turn it is can move
                if (chess.turn() === 'w' && game.white !== socket.id) return;
                if (chess.turn() === 'b' && game.black !== socket.id) return;

                // Validate move with server's chess.js instance
                const result = chess.move(move);
                if (result) {
                    // Broadcast verified move to both players
                    io.to(gameId).emit('move', move);

                    // Check if this move ended the game
                    if (chess.isGameOver()) {
                        game.isFinished = true;
                        let reason = 'Game over.';
                        if (chess.isCheckmate()) {
                            reason = `Checkmate! ${chess.turn() === 'w' ? 'Black' : 'White'} wins.`;
                        } else if (chess.isDraw()) {
                            reason = 'Game ended in a draw.';
                        } else if (chess.isStalemate()) {
                            reason = 'Game ended in a stalemate.';
                        }

                        // Broadcast game conclusion with complete PGN history
                        io.to(gameId).emit('gameOver', {
                            reason,
                            pgn: chess.pgn()
                        });
                    }
                } else {
                    socket.emit('invalidMove', move);
                }
            } catch (err) {
                console.error('[Socket] Move error:', err.message);
                socket.emit('invalidMove', move);
            }
        });

        // ---------------------------------------------------------
        // 3. Ephemeral In-Game Chat (RAM only, auto-cleans on teardown)
        // ---------------------------------------------------------
        socket.on('sendChatMessage', (data) => {
            const gameId = Object.keys(games).find(id =>
                games[id].white === socket.id || games[id].black === socket.id
            );

            if (!gameId || !data || typeof data.message !== 'string') return;

            // Trim message and limit length to 200 characters
            const trimmedMsg = data.message.trim().slice(0, 200);
            if (!trimmedMsg) return;

            const game = games[gameId];
            const senderRole = game.white === socket.id ? 'White' : 'Black';
            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const chatEntry = {
                sender: senderRole,
                message: trimmedMsg,
                timestamp
            };

            // Store in temporary memory buffer (capped at 50 messages to save RAM)
            if (!game.chat) game.chat = [];
            game.chat.push(chatEntry);
            if (game.chat.length > 50) game.chat.shift();

            // Broadcast message to both players in the room
            io.to(gameId).emit('receiveChatMessage', chatEntry);
        });

        // ---------------------------------------------------------
        // 4. Resignation
        // ---------------------------------------------------------
        socket.on('resign', () => {
            const gameId = Object.keys(games).find(id =>
                games[id].white === socket.id || games[id].black === socket.id
            );

            if (!gameId) return;

            const game = games[gameId];
            game.isFinished = true;
            const winner = game.white === socket.id ? 'Black' : 'White';
            io.to(gameId).emit('gameOver', {
                reason: `Resignation. ${winner} wins.`,
                pgn: game.chess.pgn()
            });
        });

        // ---------------------------------------------------------
        // 5. Mutual Draw / Reset Negotiation
        // ---------------------------------------------------------
        socket.on('requestEndGame', () => {
            const gameId = Object.keys(games).find(id =>
                games[id].white === socket.id || games[id].black === socket.id
            );
            if (gameId) {
                // Forward the proposal to the opponent
                socket.to(gameId).emit('opponentRequestedEndGame');
            }
        });

        socket.on('respondEndGame', (response) => {
            const gameId = Object.keys(games).find(id =>
                games[id].white === socket.id || games[id].black === socket.id
            );

            if (!gameId) return;

            if (response) {
                // Opponent agreed to draw
                const game = games[gameId];
                game.isFinished = true;
                io.to(gameId).emit('gameOver', {
                    reason: 'Game drawn by mutual agreement.',
                    pgn: game.chess.pgn()
                });
            } else {
                // Opponent declined offer
                socket.to(gameId).emit('endGameDeclined');
            }
        });

        // ---------------------------------------------------------
        // 6. Player Disconnect Handling
        // ---------------------------------------------------------
        socket.on('disconnect', () => {
            console.log('[Socket] Client disconnected:', socket.id);

            // If disconnected player was merely waiting in matchmaking queue
            if (waitingPlayer && waitingPlayer.id === socket.id) {
                waitingPlayer = null;
            } else {
                // Player was inside an active game room
                const gameId = Object.keys(games).find(id =>
                    games[id].white === socket.id || games[id].black === socket.id
                );

                if (gameId) {
                    const game = games[gameId];
                    const isFinished = game.isFinished;
                    const remainingSocketId = game.white === socket.id ? game.black : game.white;
                    const remainingSocket = game.sockets ? game.sockets[remainingSocketId] : null;

                    // Delete match from server memory (RAM)
                    delete games[gameId];

                    if (remainingSocket && remainingSocket.connected) {
                        if (isFinished) {
                            // Match had already ended normally -> let player stay on review screen
                            remainingSocket.emit('opponentLeftRoom');
                        } else {
                            // Player disconnected mid-game -> award victory to remaining player
                            const disconnectedColor = (game.white === socket.id) ? 'White' : 'Black';
                            const winnerColor = (disconnectedColor === 'White') ? 'Black' : 'White';

                            remainingSocket.emit('gameOver', {
                                reason: `${disconnectedColor} disconnected. ${winnerColor} wins by abandonment!`,
                                pgn: game.chess.pgn()
                            });
                        }
                    }
                }
            }
        });
    });
}

module.exports = { initGameSocket };
