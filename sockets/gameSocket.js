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

    // Stores pending private rooms: key = roomCode, value = { hostSocket, hostId, createdAt, expiresAt }
    const privateRooms = new Map();
    const ROOM_TTL_MS = 10 * 60 * 1000; // 10 minutes

    // Periodic sweep for expired private rooms (runs every 15 seconds)
    setInterval(() => {
        const now = Date.now();
        for (const [code, room] of privateRooms.entries()) {
            if (now > room.expiresAt) {
                if (room.hostSocket && room.hostSocket.connected) {
                    room.hostSocket.emit('privateRoomExpired', { message: 'Room code expired (10 minutes elapsed).' });
                }
                privateRooms.delete(code);
                console.log(`[Socket] Private room ${code} expired and cleaned up.`);
            }
        }
    }, 15000);

    // Helper: Starts a match session between White and Black sockets
    function startGameSession(whiteSocket, blackSocket, gameId) {
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

        // Assign colors: Creator/first gets White ('w'), Joiner/second gets Black ('b')
        whiteSocket.emit('playerRole', 'w');
        blackSocket.emit('playerRole', 'b');

        // Send starting board position (FEN string)
        io.to(gameId).emit('boardState', chess.fen());
    }

    io.on('connection', (socket) => {
        console.log('[Socket] Client connected:', socket.id);

        // ---------------------------------------------------------
        // 1. Random Matchmaking Queue
        // ---------------------------------------------------------
        socket.on('joinRandomQueue', () => {
            if (!waitingPlayer || waitingPlayer.id === socket.id) {
                waitingPlayer = socket;
                socket.emit('waitingForOpponent');
            } else {
                const whiteSocket = waitingPlayer;
                const blackSocket = socket;
                waitingPlayer = null;

                const gameId = `game_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                startGameSession(whiteSocket, blackSocket, gameId);
            }
        });

        // ---------------------------------------------------------
        // 1b. Private Room: Host Creation
        // ---------------------------------------------------------
        socket.on('hostPrivateRoom', (data) => {
            const rawCode = data && data.roomCode ? String(data.roomCode).trim().toUpperCase() : null;
            if (!rawCode || !/^[A-Z0-9_-]{3,16}$/.test(rawCode)) {
                return socket.emit('privateRoomError', { message: 'Invalid room code format.' });
            }

            // Remove socket from random waiting queue if present
            if (waitingPlayer && waitingPlayer.id === socket.id) {
                waitingPlayer = null;
            }

            // Check if code is already active in privateRooms or active games
            if (privateRooms.has(rawCode) || games[rawCode]) {
                return socket.emit('privateRoomError', { message: 'Room code already in use. Please generate a new code.' });
            }

            const now = Date.now();
            const expiresAt = now + ROOM_TTL_MS;

            privateRooms.set(rawCode, {
                hostSocket: socket,
                hostId: socket.id,
                createdAt: now,
                expiresAt: expiresAt
            });

            socket.join(rawCode);
            socket.emit('privateRoomCreated', { roomCode: rawCode, expiresAt });
            console.log(`[Socket] Private room created: ${rawCode} by ${socket.id} (Expires in 10m)`);
        });

        // ---------------------------------------------------------
        // 1c. Private Room: Guest Join
        // ---------------------------------------------------------
        socket.on('joinPrivateRoom', (data) => {
            const rawCode = data && data.roomCode ? String(data.roomCode).trim().toUpperCase() : null;
            if (!rawCode) {
                return socket.emit('privateRoomError', { message: 'Room code is required.' });
            }

            // Remove socket from random waiting queue if present
            if (waitingPlayer && waitingPlayer.id === socket.id) {
                waitingPlayer = null;
            }

            if (!privateRooms.has(rawCode)) {
                const isOngoing = Object.keys(games).some(gId => gId.includes(rawCode));
                if (isOngoing) {
                    return socket.emit('privateRoomError', { message: 'This room is already in progress and full.' });
                }
                return socket.emit('privateRoomError', { message: 'Room not found or code has expired.' });
            }

            const room = privateRooms.get(rawCode);

            // Check if expired
            if (Date.now() > room.expiresAt) {
                privateRooms.delete(rawCode);
                return socket.emit('privateRoomError', { message: 'Room code has expired (10 minute limit reached).' });
            }

            // Self-join protection
            if (room.hostId === socket.id) {
                return socket.emit('privateRoomError', { message: 'Cannot join your own room as second player.' });
            }

            // Check if host socket is still connected
            if (!room.hostSocket || !room.hostSocket.connected) {
                privateRooms.delete(rawCode);
                return socket.emit('privateRoomError', { message: 'Host has disconnected. Room canceled.' });
            }

            const whiteSocket = room.hostSocket;
            const blackSocket = socket;
            privateRooms.delete(rawCode); // Room is now active match

            const gameId = `friend_${rawCode}_${Date.now()}`;
            console.log(`[Socket] Private room matched: ${rawCode} (White: ${whiteSocket.id}, Black: ${blackSocket.id})`);
            startGameSession(whiteSocket, blackSocket, gameId);
        });

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
            }

            // If disconnected player was hosting a pending private room
            for (const [code, room] of privateRooms.entries()) {
                if (room.hostId === socket.id) {
                    privateRooms.delete(code);
                    console.log(`[Socket] Private room ${code} removed due to host disconnect.`);
                }
            }

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
        });
    });
}

module.exports = { initGameSocket };
