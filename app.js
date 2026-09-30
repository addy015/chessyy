// What this file does:
// This is the main entry point for the Node.js server.
// It sets up Express (for serving React SPA, static assets, and API routes)
// and Socket.io (for real-time multiplayer chess moves and chat).
// -------------------------------------------------------------------------

const express = require('express');
const http = require('http');
const socket = require('socket.io');
const path = require('path');
const fs = require('fs');
require('dotenv').config(); // Load environment settings from .env file

// Import route handlers and real-time socket logic
const webRoutes = require('./routes/web');
const { initGameSocket } = require('./sockets/gameSocket');

// Initialize Express app and attach it to an HTTP server
const app = express();
const server = http.createServer(app);

// Attach Socket.io to the HTTP server for real-time WebSocket communication
const io = socket(server);

// View engine: Not needed (Pure React SPA served from /client/dist)

// Middleware:
// 1. express.json() parses incoming JSON request bodies (e.g. from fetch calls).
// 2. express.static() serves React build from /client/dist and assets from /public.
app.use(express.json());

const clientDistPath = path.join(__dirname, 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
}
app.use(express.static(path.join(__dirname, 'public')));

// Web API routes (/health, /api/game/analyze)
app.use('/', webRoutes);

// React SPA Fallback Handler (Compatible with Express 5)
// Serves React index.html for all non-API GET routes (/, /play, /review)
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.url.startsWith('/api') && !req.url.startsWith('/socket.io') && !req.url.startsWith('/health')) {
        const indexPath = path.join(clientDistPath, 'index.html');
        if (fs.existsSync(indexPath)) {
            return res.sendFile(indexPath);
        }
    }
    next();
});

// Start live chess game room management and chat socket events
initGameSocket(io);

// Server port: uses hosting environment port (like Render's $PORT) or defaults to 3000 locally
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[CHESSYY] Server listening on port ${PORT}`);
});
