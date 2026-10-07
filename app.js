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

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Initialize Express app and attach it to an HTTP server
const app = express();
const server = http.createServer(app);

// Security: Disable Express fingerprinting
app.disable('x-powered-by');

// Security: Configure HTTP Security Headers via Helmet
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
                imgSrc: ["'self'", 'data:', 'blob:'],
                connectSrc: ["'self'", 'ws:', 'wss:'],
                objectSrc: ["'none'"],
                upgradeInsecureRequests: [],
            },
        },
        crossOriginEmbedderPolicy: false,
    })
);

// Security: Global rate limiter for API endpoints (prevent abuse & DoS)
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'TOO_MANY_REQUESTS', detail: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter);

// Security: WebSocket Origin allowlist (defends against Cross-Site WebSocket Hijacking - CSWSH)
const allowedSocketOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://chessyy.onrender.com'
];
if (process.env.ALLOWED_ORIGINS) {
    allowedSocketOrigins.push(...process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()));
}

// Attach Socket.io with CSWSH protection and packet buffer limits
const io = socket(server, {
    cors: {
        origin: (origin, callback) => {
            // Allow same-origin / non-browser / trusted clients
            if (!origin || allowedSocketOrigins.includes(origin)) {
                return callback(null, true);
            }
            console.warn(`[Security] Blocked unauthorized WebSocket handshake origin: ${origin}`);
            return callback(new Error('Cross-Origin WebSocket connection denied by security policy'), false);
        },
        methods: ['GET', 'POST'],
        credentials: true
    },
    maxHttpBufferSize: 1e5 // 100 KB payload cap per WebSocket packet
});

// View engine: Not needed (Pure React SPA served from /client/dist)

// Middleware:
// 1. express.json({ limit: '64kb' }) enforces strict payload cap to prevent RAM exhaustion.
// 2. express.static() serves React build from /client/dist and assets from /public.
app.use(express.json({ limit: '64kb' }));

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
