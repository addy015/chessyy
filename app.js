// Main server entry point: sets up Express, Socket.io, and static files

const express = require('express');
const http = require('http');
const socket = require('socket.io');
const path = require('path');
const fs = require('fs');
require('dotenv').config(); // Load environment variables from .env file

// Import routes and socket handlers
const webRoutes = require('./routes/web');
const { initGameSocket } = require('./sockets/gameSocket');

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Create Express app and wrap in HTTP server
const app = express();
const server = http.createServer(app);

// Hide Express fingerprinting header
app.disable('x-powered-by');

// Security headers (CSP rules for styles, fonts, websockets, and external puzzle APIs)
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
                imgSrc: ["'self'", 'data:', 'blob:', 'https://images.chesscomfiles.com', 'https://lichess1.org'],
                connectSrc: [
                    "'self'",
                    'ws:',
                    'wss:',
                    'https://lichess.org',
                    'https://*.lichess.org',
                    'https://api.chess.com',
                ],
                objectSrc: ["'none'"],
                upgradeInsecureRequests: [],
            },
        },
        crossOriginEmbedderPolicy: false,
    })
);

// Rate limiter: max 300 API requests per 15 minutes to prevent spam
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'TOO_MANY_REQUESTS', detail: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter);

// Allowed origins for WebSocket connections
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

// Socket.io configuration with allowed origins and 100 KB packet cap
const io = socket(server, {
    cors: {
        origin: (origin, callback) => {
            // Allow same-origin or trusted domain
            if (!origin || allowedSocketOrigins.includes(origin)) {
                return callback(null, true);
            }
            // Allow local network IP testing in development
            try {
                const url = new URL(origin);
                const isLan = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/.test(url.hostname);
                if (isLan) {
                    return callback(null, true);
                }
            } catch (err) {}
            console.warn(`[Security] Blocked unauthorized WebSocket handshake origin: ${origin}`);
            return callback(new Error('Cross-Origin WebSocket connection denied by security policy'), false);
        },
        methods: ['GET', 'POST'],
        credentials: true
    },
    maxHttpBufferSize: 1e5 // 100 KB payload limit per packet
});

// Parse JSON request bodies up to 64KB
app.use(express.json({ limit: '64kb' }));

// Serve React production build from /client/dist and static assets from /public
const clientDistPath = path.join(__dirname, 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
}
app.use(express.static(path.join(__dirname, 'public')));

// Web API routes (/health, /api/game/analyze)
app.use('/', webRoutes);

// SPA fallback: return index.html for page routes (like /play and /review)
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.url.startsWith('/api') && !req.url.startsWith('/socket.io') && !req.url.startsWith('/health')) {
        const indexPath = path.join(clientDistPath, 'index.html');
        if (fs.existsSync(indexPath)) {
            return res.sendFile(indexPath);
        }
    }
    next();
});

// Initialize real-time chess sockets
initGameSocket(io);

// Start server on configured port (default: 3000)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[CHESSYY] Server listening on port ${PORT}`);
});

