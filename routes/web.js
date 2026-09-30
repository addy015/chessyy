// What this file does:
// This is the Node.js Express web router.
// It serves HTML pages to users and forwards game review requests to the Python AI service.
// 
// Routes:
// 1. GET /health           -> Fast 200 OK for uptime monitors (UptimeRobot / Render).
// 2. POST /api/game/analyze-> Sends match PGN to Python service (Stockfish + Gemini) with in-memory caching and in-flight request coalescing.
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

// Cache recently analyzed games in memory (stores up to 100 games).
const analysisCache = new Map();

// Coalesce concurrent requests for the same match PGN
// If both players click "Review Match" at the exact same second, only 1 Stockfish/Gemini
// job runs in Python while the second request awaits the same promise!
const inFlightAnalyses = new Map();

/**
 * Analysis Proxy API.
 * Takes the chess match PGN text and forwards it to the Python FastAPI microservice (port 8000).
 */
router.post('/api/game/analyze', async (req, res) => {
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:8000';
    const { pgn, gameId, includeCoach } = req.body;

    // Validate incoming PGN
    if (!pgn || typeof pgn !== 'string') {
        return res.status(400).json({
            error: 'INVALID_PGN',
            detail: 'A valid PGN string is required for analysis.'
        });
    }

    // 1. Check in-memory cache first
    const cacheKey = `${pgn.trim()}__coach_${includeCoach !== false}`;
    if (analysisCache.has(cacheKey)) {
        return res.json(analysisCache.get(cacheKey));
    }

    // 2. If an identical request is already running, wait for it!
    if (inFlightAnalyses.has(cacheKey)) {
        try {
            const cachedResult = await inFlightAnalyses.get(cacheKey);
            return res.json(cachedResult);
        } catch (e) {
            // If the in-flight failed, proceed to try fresh below
        }
    }

    // 3. Initiate analysis promise and track in inFlightAnalyses
    const analysisPromise = (async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 75000);

        try {
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
                const errorMsg = (typeof data?.detail === 'string' ? data.detail : JSON.stringify(data?.detail)) || `Python service returned ${response.status}`;
                throw new Error(errorMsg);
            }

            // Save result in memory cache (capped at 100 matches)
            if (analysisCache.size >= 100) {
                const firstKey = analysisCache.keys().next().value;
                analysisCache.delete(firstKey);
            }
            analysisCache.set(cacheKey, data);
            return data;
        } finally {
            clearTimeout(timeoutId);
            inFlightAnalyses.delete(cacheKey);
        }
    })();

    inFlightAnalyses.set(cacheKey, analysisPromise);

    try {
        const result = await analysisPromise;
        return res.json(result);
    } catch (err) {
        console.error('[Web] Failed to communicate with Python AI microservice:', err.message);
        return res.status(503).json({
            error: 'AI_SERVICE_UNREACHABLE',
            detail: err.message || 'Python analysis service is currently unavailable. Ensure ai_service is running on port 8000.'
        });
    }
});

module.exports = router;
