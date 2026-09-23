// What this file does:
// This is the Node.js Express web router.
// It serves HTML pages to users and forwards game review requests to the Python AI service.
// 
// Routes:
// 1. GET /health           -> Fast 200 OK for uptime monitors (UptimeRobot / Render).
// 2. GET /                 -> Homepage.
// 3. GET /play             -> Live multiplayer chess arena.
// 4. GET /review           -> Post-match analysis and review page.
// 5. POST /api/game/analyze-> Sends match PGN to Python service (Stockfish + Gemini) with in-memory caching.
// -------------------------------------------------------------------------

const express = require('express');
const router = express.Router();

/**
 * Health check endpoint.
 * Returns instant 200 OK without rendering templates so uptime pings don't waste CPU.
 */
router.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

/**
 * Homepage
 */
router.get('/', (req, res) => {
    res.render('home', {
        title: 'CHESSYY',
        edition: '2026 EDITION'
    });
});

/**
 * Live multiplayer chess arena
 */
router.get('/play', (req, res) => {
    res.render('game', {
        title: 'CHESSYY — Live Arena',
        edition: '2026 EDITION'
    });
});

/**
 * Post-match analysis & engine review page
 */
router.get('/review', (req, res) => {
    res.render('review', {
        title: 'CHESSYY — Match Review',
        edition: '2026 EDITION'
    });
});

// Cache recently analyzed games in memory (stores up to 100 games).
// If players request review for the same match again, it returns cached results instantly
// instead of running heavy Stockfish calculations twice.
const analysisCache = new Map();

/**
 * Analysis Proxy API.
 * Takes the chess match PGN text and forwards it to the Python FastAPI microservice (port 8000).
 */
router.post('/api/game/analyze', async (req, res) => {
    // URL of Python service (defaults to 127.0.0.1:8000 in unified container)
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:8000';
    const { pgn, gameId, includeCoach } = req.body;

    // Validate incoming PGN
    if (!pgn || typeof pgn !== 'string') {
        return res.status(400).json({
            error: 'INVALID_PGN',
            detail: 'A valid PGN string is required for analysis.'
        });
    }

    // Check in-memory cache first
    const cacheKey = `${pgn.trim()}__coach_${includeCoach !== false}`;
    if (analysisCache.has(cacheKey)) {
        return res.json(analysisCache.get(cacheKey));
    }

    try {
        // Timeout after 25 seconds if Python service takes too long
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);

        // Forward request to Python FastAPI microservice
        const response = await fetch(`${pythonServiceUrl}/api/analyze-game`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                gameId: gameId || `match_${Date.now()}`,
                pgn,
                includeCoach: includeCoach !== false
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        // Save result in memory cache (cap cache size at 100 matches to avoid memory leaks)
        if (analysisCache.size >= 100) {
            const firstKey = analysisCache.keys().next().value;
            analysisCache.delete(firstKey);
        }
        analysisCache.set(cacheKey, data);

        return res.json(data);
    } catch (err) {
        console.error('[Web] Failed to communicate with Python AI microservice:', err.message);
        return res.status(503).json({
            error: 'AI_SERVICE_UNREACHABLE',
            detail: 'Python analysis service is currently unavailable. Ensure ai_service is running on port 8000.'
        });
    }
});

module.exports = router;
