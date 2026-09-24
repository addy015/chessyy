// What this file does:
// This is the WebSocket communication bridge for the browser.
// Instead of creating multiple socket connections, it keeps a single connection
// and provides clean helper functions to send moves, chat, and game proposals to the server.
// -------------------------------------------------------------------------

let socketInstance = null;

/**
 * Returns the active Socket.io connection.
 * Creates the connection only once (Singleton pattern) and reuses it everywhere.
 */
export function getSocket() {
    if (!socketInstance) {
        socketInstance = io();
    }
    return socketInstance;
}

/**
 * Sends a chess move to the server.
 * move format: { from: 'e2', to: 'e4', promotion: 'q' }
 */
export function emitMove(move) {
    const socket = getSocket();
    socket.emit('move', move);
}

/**
 * Sends an in-game live chat message to the opponent.
 */
export function emitChatMessage(message) {
    const socket = getSocket();
    socket.emit('sendChatMessage', { message });
}

/**
 * Sends a proposal to the opponent to end the game (Draw or Reset).
 */
export function emitRequestEndGame() {
    const socket = getSocket();
    socket.emit('requestEndGame');
}

/**
 * Replies to an opponent's draw/reset offer (true to accept, false to decline).
 */
export function emitRespondEndGame(accept) {
    const socket = getSocket();
    socket.emit('respondEndGame', accept);
}

/**
 * Sends a resignation signal when player clicks "Resign".
 */
export function emitResign() {
    const socket = getSocket();
    socket.emit('resign');
}

/**
 * Requests entering the standard random matchmaking queue.
 */
export function emitJoinRandomQueue() {
    const socket = getSocket();
    socket.emit('joinRandomQueue');
}

/**
 * Requests creating and hosting a private room.
 */
export function emitHostPrivateRoom(roomCode) {
    const socket = getSocket();
    socket.emit('hostPrivateRoom', { roomCode });
}

/**
 * Requests joining an existing private room.
 */
export function emitJoinPrivateRoom(roomCode) {
    const socket = getSocket();
    socket.emit('joinPrivateRoom', { roomCode });
}
