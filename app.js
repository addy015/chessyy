// What this file does:
// This is the main entry point for the Node.js server.
// It sets up Express (for serving web pages and API routes)
// and Socket.io (for real-time multiplayer chess moves and chat).
// -------------------------------------------------------------------------

const express = require('express');
const http = require('http');
const socket = require('socket.io');
const path = require('path');
require('dotenv').config(); // Load environment settings from .env file

// Import route handlers and real-time socket logic
const webRoutes = require('./routes/web');
const { initGameSocket } = require('./sockets/gameSocket');

// Initialize Express app and attach it to an HTTP server
const app = express();
const server = http.createServer(app);

// Attach Socket.io to the HTTP server for real-time WebSocket communication
const io = socket(server);

// View engine setup: use EJS templates stored inside the /views folder
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware:
// 1. express.json() parses incoming JSON request bodies (e.g. from fetch calls).
// 2. express.static() serves files from /public (CSS styles, JS scripts, fonts).
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Web page routes (/health, /, /play, /review, /api/game/analyze)
app.use('/', webRoutes);

// Start live chess game room management and chat socket events
initGameSocket(io);

// Server port: uses hosting environment port (like Render's $PORT) or defaults to 3000 locally
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[CHESSYY] Server listening on port ${PORT}`);
});
