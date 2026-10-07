// What this file does:
// This is the real-time multiplayer backend.
// It uses Socket.io and chess.js to connect two players and manage their live match.
// 
// Main jobs:
// 1. Matchmaking: Isolated queues per time control (no cross-matching between 3m and 10m).
// 2. Private Rooms: Host selects time control; guest joins that exact game.
// 3. Chess Clocks: Server-authoritative countdown, move time deduction, increment addition, flag-fall.
// 4. Referee: Server validates every move and pawn underpromotions using chess.js.
// 5. Ephemeral Chat: Relays live in-game messages between the two players (stored in RAM only).
// 6. Game Over: Detects checkmate, draw, stalemate, resignation, or timeout.
// 7. Cleanup: Removes match from memory when players disconnect.
// -------------------------------------------------------------------------

const { Chess } = require('chess.js');
const crypto = require('crypto');

// Rate limiter helper per socket connection (Fail-closed design)
function checkSocketRateLimit(socket, action, maxRequests, windowMs) {
    try {
        if (!socket || !socket._rateLimits) {
            if (socket) socket._rateLimits = {};
            else return false;
        }
        const now = Date.now();
        let limiter = socket._rateLimits[action];
        if (!limiter || now > limiter.resetTime) {
            socket._rateLimits[action] = { count: 1, resetTime: now + windowMs };
            return true;
        }
        if (limiter.count >= maxRequests) {
            return false;
        }
        limiter.count += 1;
        return true;
    } catch (e) {
        return false; // Fail closed on error
    }
}

// Constant-time token comparison against timing attacksw
function safeTokenCompare(knownToken, candidateToken) {
    if (typeof knownToken !== 'string' || typeof candidateToken !== 'string') return false;
    const bufA = Buffer.from(knownToken, 'utf-8');
    const bufB = Buffer.from(candidateToken, 'utf-8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

const TIME_PRESETS = {
    'bullet_1_0':  { id: 'bullet_1_0',  label: '1 min',      initialMs: 60 * 1000,       incMs: 0 },
    'blitz_3_0':   { id: 'blitz_3_0',   label: '3 min',      initialMs: 3 * 60 * 1000,   incMs: 0 },
    'blitz_3_2':   { id: 'blitz_3_2',   label: '3 + 2s',     initialMs: 3 * 60 * 1000,   incMs: 2000 },
    'rapid_5_0':   { id: 'rapid_5_0',   label: '5 min',      initialMs: 5 * 60 * 1000,   incMs: 0 },
    'rapid_10_0':  { id: 'rapid_10_0',  label: '10 min',     initialMs: 10 * 60 * 1000,  incMs: 0 },
    'unlimited':   { id: 'unlimited',   label: 'Unlimited',  initialMs: 0,               incMs: 0 }
};
const DEFAULT_TIME_PRESET = 'rapid_10_0';

// Sanitize incoming player handles (max 10 chars, uppercase, alphanumeric whitelist)
function sanitizePlayerName(name) {
    if (!name || typeof name !== 'string') return 'ANONYMOUS';
    const cleaned = name.trim().slice(0, 10).toUpperCase();
    return /^[A-Z0-9_-]{2,10}$/.test(cleaned) ? cleaned : 'ANONYMOUS';
}

function initGameSocket(io) {
    // Stores active games in server memory (RAM): key = gameId, value = match data
    const games = {};
    
    // Isolated waiting queues per time control (strict isolation - zero cross-matching)
    const waitingQueues = {
        'bullet_1_0': null,
        'blitz_3_0':  null,
        'blitz_3_2':  null,
        'rapid_5_0':  null,
        'rapid_10_0': null,
        'unlimited':  null
    };

    // Stores pending private rooms: key = roomCode, value = { hostSocket, hostId, timeControl, createdAt, expiresAt }
    const privateRooms = new Map();
    const ROOM_TTL_MS = 10 * 60 * 1000; // 10 minutes

    // 1. Periodic sweep for expired private rooms (runs every 15 seconds)
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

    // 2. Periodic tick loop for chess clocks & flag-fall timeout detection (runs every 250ms)
    setInterval(() => {
        const now = Date.now();
        for (const [gameId, game] of Object.entries(games)) {
            if (game.isFinished || !game.clocks || !game.clocks.isTimed) continue;
            if (!game.clocks.lastTurnTimestamp) continue;

            const activeTurn = game.chess.turn(); // 'w' or 'b'
            const elapsed = Math.max(0, now - game.clocks.lastTurnTimestamp);
            const remaining = activeTurn === 'w'
                ? game.clocks.whiteMs - elapsed
                : game.clocks.blackMs - elapsed;

            if (remaining <= 0) {
                game.isFinished = true;
                clearGameTimers(game);
                if (activeTurn === 'w') game.clocks.whiteMs = 0;
                else game.clocks.blackMs = 0;

                const flaggedColor = activeTurn === 'w' ? 'White' : 'Black';
                const winnerColor = activeTurn === 'w' ? 'Black' : 'White';

                // FIDE Rule: Check if opponent has sufficient material to checkmate
                let reason = `${flaggedColor} ran out of time. ${winnerColor} wins on time!`;
                try {
                    const isInsufficient = typeof game.chess.isInsufficientMaterial === 'function'
                        ? game.chess.isInsufficientMaterial()
                        : (typeof game.chess.has_insufficient_material === 'function' ? game.chess.has_insufficient_material() : false);
                    if (isInsufficient) {
                        reason = `${flaggedColor} ran out of time, but ${winnerColor} has insufficient material. Match drawn!`;
                    }
                } catch (e) {}

                io.to(gameId).emit('clockSync', {
                    whiteMs: game.clocks.whiteMs,
                    blackMs: game.clocks.blackMs,
                    activeTurn: null,
                    serverTime: now
                });

                io.to(gameId).emit('gameOver', {
                    reason,
                    pgn: game.chess.pgn(),
                    players: {
                        white: game.whiteName || 'ANONYMOUS',
                        black: game.blackName || 'ANONYMOUS'
                    }
                });
            }
        }
    }, 250);

    // Helper: Clears pending abandonment timers
    function clearGameTimers(game) {
        if (game && game.disconnectTimers) {
            for (const timer of Object.values(game.disconnectTimers)) {
                clearTimeout(timer);
            }
            game.disconnectTimers = {};
        }
    }

    // Helper: Starts a match session between White and Black sockets
    function startGameSession(whiteSocket, blackSocket, gameId, timeControlKey, whiteName, blackName) {
        const chess = new Chess();
        const tc = TIME_PRESETS[timeControlKey] || TIME_PRESETS[DEFAULT_TIME_PRESET];
        const isTimed = tc.initialMs > 0;
        const now = Date.now();
        const safeWhiteName = sanitizePlayerName(whiteName);
        const safeBlackName = sanitizePlayerName(blackName);
        const whiteToken = 'tok_' + crypto.randomBytes(16).toString('hex');
        const blackToken = 'tok_' + crypto.randomBytes(16).toString('hex');

        try {
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
            chess.setHeader('Event', 'Chessyy Live Match');
            chess.setHeader('Site', 'Chessyy (https://chessyy.onrender.com)');
            chess.setHeader('Date', dateStr);
            chess.setHeader('Round', '1');
            chess.setHeader('White', safeWhiteName);
            chess.setHeader('Black', safeBlackName);
        } catch (e) {}

        games[gameId] = {
            gameId,
            chess,
            white: whiteSocket.id,
            black: blackSocket.id,
            whiteToken,
            blackToken,
            whiteName: safeWhiteName,
            blackName: safeBlackName,
            sockets: {
                [whiteSocket.id]: whiteSocket,
                [blackSocket.id]: blackSocket
            },
            timeControl: tc,
            clocks: {
                isTimed,
                whiteMs: tc.initialMs,
                blackMs: tc.initialMs,
                incMs: tc.incMs,
                lastTurnTimestamp: isTimed ? now : null
            },
            chat: [],
            disconnectTimers: {},
            isFinished: false
        };

        whiteSocket.gameId = gameId;
        blackSocket.gameId = gameId;

        // Join both players to the same Socket.io room
        whiteSocket.join(gameId);
        blackSocket.join(gameId);

        // Announce match start with clock configuration and player identities to both players
        io.to(gameId).emit('startGame', {
            gameId,
            timeControl: tc,
            clocks: {
                isTimed,
                whiteMs: tc.initialMs,
                blackMs: tc.initialMs,
                incMs: tc.incMs,
                activeTurn: 'w',
                serverTime: now
            },
            players: {
                white: safeWhiteName,
                black: safeBlackName
            }
        });

        // Assign colors, session tokens & identities: White ('w') and Black ('b')
        whiteSocket.emit('playerRole', {
            role: 'w',
            gameId,
            playerToken: whiteToken,
            playerName: safeWhiteName,
            opponentName: safeBlackName
        });
        blackSocket.emit('playerRole', {
            role: 'b',
            gameId,
            playerToken: blackToken,
            playerName: safeBlackName,
            opponentName: safeWhiteName
        });

        // Send starting board position (FEN string)
        io.to(gameId).emit('boardState', chess.fen());
    }

    // Helper: Removes a socket from any waiting queue it might be in
    function removeSocketFromQueues(socketId) {
        for (const tc of Object.keys(waitingQueues)) {
            if (waitingQueues[tc] && waitingQueues[tc].socket && waitingQueues[tc].socket.id === socketId) {
                waitingQueues[tc] = null;
            }
        }
    }

    io.on('connection', (socket) => {
        console.log('[Socket] Client connected:', socket.id);

        // ---------------------------------------------------------
        // 1. Random Matchmaking Queue (Strictly isolated by time control)
        // ---------------------------------------------------------
        socket.on('joinRandomQueue', (data) => {
            if (!checkSocketRateLimit(socket, 'matchmaking', 10, 10000)) {
                return socket.emit('privateRoomError', { message: 'Action rate limit exceeded. Please wait a moment.' });
            }

            const rawTc = data && data.timeControl ? data.timeControl : DEFAULT_TIME_PRESET;
            const tc = TIME_PRESETS[rawTc] ? rawTc : DEFAULT_TIME_PRESET;
            const incomingPlayerName = sanitizePlayerName(data && data.playerName);

            // Remove socket from any other queues
            removeSocketFromQueues(socket.id);

            if (!waitingQueues[tc] || (waitingQueues[tc].socket && waitingQueues[tc].socket.id === socket.id)) {
                // First player in this specific time control waits in queue
                waitingQueues[tc] = {
                    socket,
                    playerName: incomingPlayerName
                };
                socket.emit('waitingForOpponent', { timeControl: TIME_PRESETS[tc] });
            } else {
                // Second player arrives for the EXACT same time control -> match both!
                const whiteSocket = waitingQueues[tc].socket;
                const whiteName = waitingQueues[tc].playerName;
                const blackSocket = socket;
                const blackName = incomingPlayerName;
                waitingQueues[tc] = null;

                const gameId = `game_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
                console.log(`[Socket] Random match paired for [${tc}]: White=${whiteName}(${whiteSocket.id}), Black=${blackName}(${blackSocket.id})`);
                startGameSession(whiteSocket, blackSocket, gameId, tc, whiteName, blackName);
            }
        });

        // ---------------------------------------------------------
        // 1b. Private Room: Host Creation (Host selects time control)
        // ---------------------------------------------------------
        socket.on('hostPrivateRoom', (data) => {
            if (!checkSocketRateLimit(socket, 'matchmaking', 10, 10000)) {
                return socket.emit('privateRoomError', { message: 'Action rate limit exceeded. Please wait a moment.' });
            }
            const rawCode = data && data.roomCode ? String(data.roomCode).trim().toUpperCase() : null;
            if (!rawCode || !/^[A-Z0-9_-]{3,16}$/.test(rawCode)) {
                return socket.emit('privateRoomError', { message: 'Invalid room code format.' });
            }

            const rawTc = data && data.timeControl ? data.timeControl : DEFAULT_TIME_PRESET;
            const tc = TIME_PRESETS[rawTc] ? rawTc : DEFAULT_TIME_PRESET;
            const hostName = sanitizePlayerName(data && data.playerName);

            // Remove socket from random queues if present
            removeSocketFromQueues(socket.id);

            // Check if code is already active in privateRooms or active games
            if (privateRooms.has(rawCode) || games[rawCode]) {
                return socket.emit('privateRoomError', { message: 'Room code already in use. Please generate a new code.' });
            }

            const now = Date.now();
            const expiresAt = now + ROOM_TTL_MS;

            privateRooms.set(rawCode, {
                hostSocket: socket,
                hostId: socket.id,
                hostName,
                timeControl: tc,
                createdAt: now,
                expiresAt: expiresAt
            });

            socket.join(rawCode);
            socket.emit('privateRoomCreated', {
                roomCode: rawCode,
                expiresAt,
                timeControl: TIME_PRESETS[tc]
            });
            console.log(`[Socket] Private room created: ${rawCode} by ${hostName} (${socket.id}) (TC: ${tc}, Expires in 10m)`);
        });

        // ---------------------------------------------------------
        // 1c. Private Room: Guest Join
        // ---------------------------------------------------------
        socket.on('joinPrivateRoom', (data) => {
            if (!checkSocketRateLimit(socket, 'matchmaking', 10, 10000)) {
                return socket.emit('privateRoomError', { message: 'Action rate limit exceeded. Please wait a moment.' });
            }

            const rawCode = data && data.roomCode ? String(data.roomCode).trim().toUpperCase() : null;
            if (!rawCode) {
                return socket.emit('privateRoomError', { message: 'Room code is required.' });
            }

            const guestName = sanitizePlayerName(data && data.playerName);

            // Remove socket from random queues if present
            removeSocketFromQueues(socket.id);

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
            const whiteName = room.hostName || 'ANONYMOUS';
            const blackSocket = socket;
            const blackName = guestName;
            const tc = room.timeControl || DEFAULT_TIME_PRESET;
            privateRooms.delete(rawCode); // Room is now active match

            const gameId = `friend_${rawCode}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
            console.log(`[Socket] Private room matched: ${rawCode} (White: ${whiteName}, Black: ${blackName}, TC: ${tc})`);
            startGameSession(whiteSocket, blackSocket, gameId, tc, whiteName, blackName);
        });


        // ---------------------------------------------------------
        // 2. Move Execution & Turn Validation
        // ---------------------------------------------------------
        socket.on('move', (move) => {
            if (!checkSocketRateLimit(socket, 'move', 20, 2000)) {
                return socket.emit('invalidMove', move);
            }

            // Find which game room this socket belongs to
            const gameId = Object.keys(games).find(id =>
                games[id].white === socket.id || games[id].black === socket.id
            );

            if (!gameId) return;

            const game = games[gameId];
            if (game.isFinished) return;
            const chess = game.chess;

            try {
                // Ensure only the player whose turn it is can move
                const currentTurn = chess.turn();
                if (currentTurn === 'w' && game.white !== socket.id) return;
                if (currentTurn === 'b' && game.black !== socket.id) return;

                // Validate move with server's chess.js instance (supports promotion: 'q', 'n', 'r', 'b')
                const result = chess.move(move);
                if (result) {
                    const now = Date.now();

                    // Deduct elapsed time and apply increment for timed matches
                    if (game.clocks && game.clocks.isTimed) {
                        if (game.clocks.lastTurnTimestamp != null) {
                            const elapsed = Math.max(0, now - game.clocks.lastTurnTimestamp);
                            if (currentTurn === 'w') {
                                game.clocks.whiteMs = Math.max(0, game.clocks.whiteMs - elapsed + game.clocks.incMs);
                            } else {
                                game.clocks.blackMs = Math.max(0, game.clocks.blackMs - elapsed + game.clocks.incMs);
                            }
                        }
                        game.clocks.lastTurnTimestamp = now;
                    }

                    // Broadcast verified move to both players
                    io.to(gameId).emit('move', move);

                    // Broadcast updated authoritative clock state
                    if (game.clocks && game.clocks.isTimed) {
                        io.to(gameId).emit('clockSync', {
                            whiteMs: game.clocks.whiteMs,
                            blackMs: game.clocks.blackMs,
                            activeTurn: chess.turn(),
                            serverTime: now
                        });
                    }

                    // Check if this move ended the game
                    if (chess.isGameOver()) {
                        game.isFinished = true;
                        clearGameTimers(game);
                        let reason = 'Game over.';
                        if (chess.isCheckmate()) {
                            reason = `Checkmate! ${chess.turn() === 'w' ? 'Black' : 'White'} wins.`;
                        } else if (chess.isDraw()) {
                            reason = 'Game ended in a draw.';
                        } else if (chess.isStalemate()) {
                            reason = 'Game ended in a stalemate.';
                        }

                        // Broadcast game conclusion with complete PGN history and player roster
                        io.to(gameId).emit('gameOver', {
                            reason,
                            pgn: chess.pgn(),
                            players: {
                                white: game.whiteName || 'ANONYMOUS',
                                black: game.blackName || 'ANONYMOUS'
                            }
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
            if (!checkSocketRateLimit(socket, 'chat', 5, 3000)) {
                return socket.emit('chatRateLimit', { message: 'Chat rate limit reached. Please wait a moment.' });
            }

            // Strictly verify sender belongs to the active game room
            const gameId = Object.keys(games).find(id =>
                games[id].white === socket.id || games[id].black === socket.id
            );

            if (!gameId || !data || typeof data.message !== 'string') return;

            // Trim message and limit length to 200 characters
            const trimmedMsg = data.message.trim().slice(0, 200);
            if (!trimmedMsg) return;

            const game = games[gameId];
            if (!game || game.isFinished) return;

            const senderRole = game.white === socket.id ? 'White' : 'Black';
            const senderName = game.white === socket.id ? (game.whiteName || 'White') : (game.blackName || 'Black');
            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const chatEntry = {
                id: 'msg_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
                clientMsgId: (typeof data.clientMsgId === 'string' && data.clientMsgId.length <= 64) ? data.clientMsgId : null,
                sender: senderRole,
                senderName,
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
            clearGameTimers(game);
            const winner = game.white === socket.id ? 'Black' : 'White';
            io.to(gameId).emit('gameOver', {
                reason: `Resignation. ${winner} wins.`,
                pgn: game.chess.pgn(),
                players: {
                    white: game.whiteName || 'ANONYMOUS',
                    black: game.blackName || 'ANONYMOUS'
                }
            });
        });

        // ---------------------------------------------------------
        // 5. Mutual Draw / Reset Negotiation
        // ---------------------------------------------------------
        socket.on('requestEndGame', () => {
            if (!checkSocketRateLimit(socket, 'drawOffer', 3, 30000)) {
                return;
            }
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
                clearGameTimers(game);
                io.to(gameId).emit('gameOver', {
                    reason: 'Game drawn by mutual agreement.',
                    pgn: game.chess.pgn(),
                    players: {
                        white: game.whiteName || 'ANONYMOUS',
                        black: game.blackName || 'ANONYMOUS'
                    }
                });
            } else {
                // Opponent declined offer
                socket.to(gameId).emit('endGameDeclined');
            }
        });

        // ---------------------------------------------------------
        // 5.5 Player Reconnection Handshake (30-second Grace Window)
        // ---------------------------------------------------------
        socket.on('reconnectGame', (data) => {
            if (!data || !data.gameId || !data.playerToken) {
                return socket.emit('reconnectFailed', { message: 'Missing gameId or playerToken.' });
            }

            const { gameId, playerToken } = data;
            const game = games[gameId];

            if (!game || game.isFinished) {
                return socket.emit('reconnectFailed', { message: 'Game no longer active or session finished.' });
            }

            // Verify if playerToken matches White or Black role using constant-time comparison
            let role = null;
            if (safeTokenCompare(game.whiteToken, playerToken)) {
                role = 'w';
            } else if (safeTokenCompare(game.blackToken, playerToken)) {
                role = 'b';
            }

            if (!role) {
                return socket.emit('reconnectFailed', { message: 'Invalid player token.' });
            }

            // Cancel any pending disconnect timer for this role
            if (game.disconnectTimers && game.disconnectTimers[role]) {
                clearTimeout(game.disconnectTimers[role]);
                delete game.disconnectTimers[role];
                console.log(`[Socket] Grace timer cancelled for ${role} in game ${gameId}. Player reconnected!`);
            }

            // Bind new socket to game
            const oldSocketId = role === 'w' ? game.white : game.black;
            if (role === 'w') {
                game.white = socket.id;
            } else {
                game.black = socket.id;
            }

            if (game.sockets) {
                delete game.sockets[oldSocketId];
                game.sockets[socket.id] = socket;
            }

            // Re-join Socket.io room
            socket.join(gameId);
            socket.gameId = gameId;

            // Inform opponent that player has returned
            socket.to(gameId).emit('opponentReconnected', {
                role,
                name: role === 'w' ? game.whiteName : game.blackName
            });

            // Calculate precise remaining clock times
            const now = Date.now();
            let currentWhiteMs = game.clocks.whiteMs;
            let currentBlackMs = game.clocks.blackMs;
            if (game.clocks.isTimed && game.clocks.lastTurnTimestamp && !game.isFinished) {
                const elapsed = Math.max(0, now - game.clocks.lastTurnTimestamp);
                const activeTurn = game.chess.turn();
                if (activeTurn === 'w') {
                    currentWhiteMs = Math.max(0, currentWhiteMs - elapsed);
                } else {
                    currentBlackMs = Math.max(0, currentBlackMs - elapsed);
                }
            }

            const historyVerbose = game.chess.history({ verbose: true });
            const lastMoveObj = historyVerbose.length > 0 ? {
                from: historyVerbose[historyVerbose.length - 1].from,
                to: historyVerbose[historyVerbose.length - 1].to
            } : null;

            // Send full match snapshot to reconnecting player
            socket.emit('gameReconnected', {
                gameId,
                role,
                playerToken,
                fen: game.chess.fen(),
                history: historyVerbose,
                pgn: game.chess.pgn(),
                lastMove: lastMoveObj,
                clocks: {
                    isTimed: game.clocks.isTimed,
                    whiteMs: currentWhiteMs,
                    blackMs: currentBlackMs,
                    incMs: game.clocks.incMs,
                    activeTurn: game.isFinished ? null : game.chess.turn(),
                    serverTime: now
                },
                players: {
                    white: game.whiteName || 'ANONYMOUS',
                    black: game.blackName || 'ANONYMOUS'
                },
                chat: game.chat || [],
                timeControl: game.timeControl
            });

            console.log(`[Socket] Player ${role} (${socket.id}) restored to game ${gameId}`);
        });

        // ---------------------------------------------------------
        // 6. Player Disconnect Handling (with 30-second Grace Window)
        // ---------------------------------------------------------
        socket.on('disconnect', () => {
            console.log('[Socket] Client disconnected:', socket.id);

            // Clean from waiting queues
            removeSocketFromQueues(socket.id);

            // If disconnected player was hosting a pending private room
            for (const [code, room] of privateRooms.entries()) {
                if (room.hostId === socket.id) {
                    privateRooms.delete(code);
                    console.log(`[Socket] Private room ${code} removed due to host disconnect.`);
                }
            }

            // Check if player was inside an active game room
            const gameId = Object.keys(games).find(id =>
                games[id].white === socket.id || games[id].black === socket.id
            );

            if (gameId) {
                const game = games[gameId];
                const isFinished = game.isFinished;
                const disconnectedRole = (game.white === socket.id) ? 'w' : 'b';
                const remainingSocketId = (disconnectedRole === 'w') ? game.black : game.white;
                const remainingSocket = game.sockets ? game.sockets[remainingSocketId] : null;

                if (isFinished) {
                    // Match had already ended normally -> let player stay on review screen
                    if (remainingSocket && remainingSocket.connected) {
                        remainingSocket.emit('opponentLeftRoom');
                    }
                    clearGameTimers(game);
                    delete games[gameId];
                } else {
                    // Match is still in progress -> start 30s grace period instead of instant forfeit!
                    console.log(`[Socket] Player ${disconnectedRole} disconnected from game ${gameId}. Starting 30s grace period.`);

                    // Alert opponent that disconnected player has a 30-second window to reconnect
                    if (remainingSocket && remainingSocket.connected) {
                        remainingSocket.emit('opponentDisconnectedGrace', {
                            role: disconnectedRole,
                            graceSeconds: 30
                        });
                    }

                    // Cancel any previous timer for this role
                    if (game.disconnectTimers && game.disconnectTimers[disconnectedRole]) {
                        clearTimeout(game.disconnectTimers[disconnectedRole]);
                    }
                    if (!game.disconnectTimers) {
                        game.disconnectTimers = {};
                    }

                    game.disconnectTimers[disconnectedRole] = setTimeout(() => {
                        // 30 seconds elapsed without reconnection -> declare abandonment victory
                        if (games[gameId] && !game.isFinished) {
                            game.isFinished = true;
                            const disconnectedColor = (disconnectedRole === 'w') ? 'White' : 'Black';
                            const winnerColor = (disconnectedRole === 'w') ? 'Black' : 'White';
                            const reason = `${disconnectedColor} disconnected. ${winnerColor} wins by abandonment!`;

                            io.to(gameId).emit('gameOver', {
                                reason,
                                pgn: game.chess.pgn(),
                                players: {
                                    white: game.whiteName || 'ANONYMOUS',
                                    black: game.blackName || 'ANONYMOUS'
                                }
                            });

                            clearGameTimers(game);
                            delete games[gameId];
                            console.log(`[Socket] Game ${gameId} ended: ${reason} (Grace period expired).`);
                        }
                    }, 30000);
                }
            }
        });
    });
}

module.exports = { initGameSocket, TIME_PRESETS };
