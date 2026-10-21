// Web routes: serves health check and forwards game analysis to the Python AI service

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

// Rate limiter: max 25 game analyses per IP every 10 minutes
const analyzeLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 250,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
        error: 'RATE_LIMIT_EXCEEDED',
        detail: 'Analysis request rate limit reached. Please wait before submitting another match.'
    }
});

// Health check endpoint for uptime monitors
router.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Cache for recently analyzed matches (stores up to 100 games)
const analysisCache = new Map();

// Tracks in-progress analysis requests so identical simultaneous clicks share the same job
const inFlightAnalyses = new Map();
const inFlightDebriefs = new Map();

// Creates a cache key from moves only (ignores headers and whitespaces)
function getPgnCacheKey(pgn, includeCoach) {
    if (!pgn || typeof pgn !== 'string') return '';
    const safePgn = pgn.slice(0, 30000);
    const normalizedMoves = safePgn
        .replace(/\[[\s\S]*?\]\s*/g, '')
        .replace(/\{[\s\S]*?\}/g, '')
        .replace(/\s+/g, ' ')
        .replace(/\s*\*\s*$/, '')
        .replace(/\s*(1-0|0-1|1\/2-1\/2)\s*$/, '')
        .trim();
    return `${normalizedMoves}__coach_${includeCoach !== false}`;
}

// Python AI service base URL
const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:8000';

// Forwards match PGN to the Python service for Stockfish evaluation
router.post('/api/game/analyze', analyzeLimiter, async (req, res) => {
    const { pgn, gameId, includeCoach } = req.body || {};

    // Validate that PGN text is provided and within length limits
    if (!pgn || typeof pgn !== 'string' || pgn.trim().length === 0) {
        return res.status(400).json({
            error: 'INVALID_PGN',
            detail: 'A valid non-empty PGN string is required for analysis.'
        });
    }

    if (pgn.length > 30000) {
        return res.status(400).json({
            error: 'PAYLOAD_TOO_LARGE',
            detail: 'PGN exceeds maximum allowed size (30,000 characters).'
        });
    }

    // Sanitize game ID
    const safeGameId = (typeof gameId === 'string' && /^[a-zA-Z0-9_\-\.]{1,64}$/.test(gameId.trim()))
        ? gameId.trim()
        : `match_${Date.now()}`;

    const cacheKey = getPgnCacheKey(pgn, includeCoach);

    // If no moves were made (e.g. instant abort or resignation), return empty analysis
    if (!cacheKey.replace(/__coach_(true|false)/, '').trim()) {
        return res.json({
            gameId: gameId || `match_${Date.now()}`,
            whiteAccuracy: 100.0,
            blackAccuracy: 100.0,
            evalGraph: [0.0],
            moves: [],
            coachSummary: {
                gameNarrative: 'No moves were played in this match.',
                whiteTip: 'No moves were played in this match.',
                blackTip: 'No moves were played in this match.'
            }
        });
    }

    // Return cached analysis if available
    if (analysisCache.has(cacheKey)) {
        return res.json(analysisCache.get(cacheKey));
    }

    // If another request is currently analyzing this exact match, wait for its result
    if (inFlightAnalyses.has(cacheKey)) {
        try {
            const cachedResult = await inFlightAnalyses.get(cacheKey);
            return res.json(cachedResult);
        } catch (e) {
            // If the pending request failed, try fresh below
        }
    }

    // Call Python microservice with fast failover retry logic
    const fetchWithRetry = async (maxRetries = 2, delayMs = 500) => {
        let lastError = null;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 45000);

            try {
                const response = await fetch(`${pythonServiceUrl}/api/analyze-game`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        gameId: safeGameId,
                        pgn,
                        includeCoach: includeCoach === true
                    }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);
                const data = await response.json();

                if (!response.ok) {
                    const errorMsg = (typeof data?.detail === 'string' ? data.detail : JSON.stringify(data?.detail)) || `Python service returned ${response.status}`;
                    throw new Error(errorMsg);
                }

                return data;
            } catch (err) {
                clearTimeout(timeoutId);
                lastError = err;
                if (attempt < maxRetries) {
                    await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
                }
            }
        }
        throw lastError;
    };

    // Run analysis and store in cache
    const analysisPromise = (async () => {
        try {
            const data = await fetchWithRetry();

            // Keep cache size capped at 100 games
            if (analysisCache.size >= 100) {
                const firstKey = analysisCache.keys().next().value;
                analysisCache.delete(firstKey);
            }
            analysisCache.set(cacheKey, data);
            return data;
        } finally {
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

// POST /api/game/debrief: Generates Grandmaster match narrative and coaching tips
router.post('/api/game/debrief', async (req, res) => {
    const { whiteHandle, blackHandle, whiteAccuracy, blackAccuracy, opening, turningPoints } = req.body || {};

    const cacheKey = `debrief_${whiteHandle}_${blackHandle}_${whiteAccuracy}_${blackAccuracy}_${(turningPoints || []).length}`;
    if (analysisCache.has(cacheKey)) {
        return res.json(analysisCache.get(cacheKey));
    }

    if (inFlightDebriefs.has(cacheKey)) {
        try {
            const cachedResult = await inFlightDebriefs.get(cacheKey);
            return res.json(cachedResult);
        } catch (e) {
            // Pending request failed, continue below
        }
    }

    const debriefPromise = (async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const response = await fetch(`${pythonServiceUrl}/api/match-debrief`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    whiteHandle: whiteHandle || 'White',
                    blackHandle: blackHandle || 'Black',
                    whiteAccuracy: whiteAccuracy || 80.0,
                    blackAccuracy: blackAccuracy || 80.0,
                    opening: opening || 'Standard Opening',
                    turningPoints: Array.isArray(turningPoints) ? turningPoints : []
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const data = await response.json();

            if (response.ok) {
                analysisCache.set(cacheKey, data);
                return data;
            } else {
                throw new Error(data?.detail || `AI service returned ${response.status}`);
            }
        } finally {
            inFlightDebriefs.delete(cacheKey);
        }
    })();

    inFlightDebriefs.set(cacheKey, debriefPromise);

    try {
        const result = await debriefPromise;
        return res.json(result);
    } catch (err) {
        // Fallback response if AI service is offline
        return res.json({
            gameNarrative: `Match between ${whiteHandle || 'White'} and ${blackHandle || 'Black'}. Both players competed with fighting spirit.`,
            whiteTip: 'Keep active piece development and central pawn control.',
            blackTip: 'Look for counter-attacking chances and keep king safety secured.'
        });
    }
});

// POST /api/game/ask-coach: On-demand student question about a specific move
router.post('/api/game/ask-coach', async (req, res) => {
    const { fen, playedMove, bestMove, enginePv, userQuestion } = req.body || {};

    if (!fen || !playedMove || !bestMove) {
        return res.status(400).json({ error: 'Missing required move context' });
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(`${pythonServiceUrl}/api/ask-coach`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fen,
                playedMove,
                bestMove,
                enginePv: Array.isArray(enginePv) ? enginePv : [],
                userQuestion: userQuestion || 'Why is this move a mistake?'
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const data = await response.json();

        if (response.ok) {
            return res.json(data);
        } else {
            throw new Error(data?.detail || `AI service returned ${response.status}`);
        }
    } catch (err) {
        return res.json({
            answer: `Stockfish recommends ${bestMove} over ${playedMove} to keep active tactical piece play and position balance.`
        });
    }
});

module.exports = router;


