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

const rateLimit = require('express-rate-limit');

// Security: Dedicated rate limiter for CPU/AI-intensive game analysis
const analyzeLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    limit: 25, // max 25 game analyses per IP per 10 minutes
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
        error: 'RATE_LIMIT_EXCEEDED',
        detail: 'Analysis request rate limit reached. Please wait before submitting another match.'
    }
});

/**
 * Health check endpoint.
 * Returns instant 200 OK without rendering templates so uptime pings don't waste CPU.
 */
router.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Cache recently analyzed games in memory (stores up to 100 games).
const analysisCache = new Map();

// Coalesce concurrent requests for the same match moves
// If both players click "Review Match" at the exact same second, only 1 Stockfish/Gemini
// job runs in Python while the second request awaits the same promise!
const inFlightAnalyses = new Map();

/**
 * Normalizes PGN text to pure moves so slight variations in FIDE headers,
 * whitespace, or line breaks between White and Black tabs never produce
 * divergent cache keys for the exact same match!
 */
function getPgnCacheKey(pgn, includeCoach) {
    if (!pgn || typeof pgn !== 'string') return '';
    const safePgn = pgn.slice(0, 30000);
    const normalizedMoves = safePgn
        .replace(/\[.*?\]\s*/g, '')
        .replace(/\{.*?\}/g, '')
        .replace(/\s+/g, ' ')
        .replace(/\s*\*\s*$/, '')
        .replace(/\s*(1-0|0-1|1\/2-1\/2)\s*$/, '')
        .trim();
    return `${normalizedMoves}__coach_${includeCoach !== false}`;
}

/**
 * Analysis Proxy API.
 * Takes the chess match PGN text and forwards it to the Python FastAPI microservice (port 8000).
 */
router.post('/api/game/analyze', analyzeLimiter, async (req, res) => {
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:8000';
    const { pgn, gameId, includeCoach } = req.body;

    // Validate incoming PGN: type, presence, and max length (prevents DoS/ReDoS/resource exhaustion)
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

    // Validate and sanitize gameId
    const safeGameId = (typeof gameId === 'string' && /^[a-zA-Z0-9_\-\.]{1,64}$/.test(gameId.trim()))
        ? gameId.trim()
        : `match_${Date.now()}`;

    const cacheKey = getPgnCacheKey(pgn, includeCoach);

    // Fast-path: If match has 0 moves (aborted / instant resignation)
    if (!cacheKey.replace(/__coach_(true|false)/, '').trim()) {
        return res.json({
            gameId: gameId || `match_${Date.now()}`,
            whiteAccuracy: 100.0,
            blackAccuracy: 100.0,
            evalGraph: [0.0],
            moves: [],
            coachSummary: {
                whiteTip: 'No moves were played in this match.',
                blackTip: 'No moves were played in this match.'
            }
        });
    }

    // 1. Check in-memory cache first
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

    // 3. Helper to communicate with Python microservice with retry backoff
    const fetchWithRetry = async (maxRetries = 2, delayMs = 600) => {
        let lastError = null;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 75000);

            try {
                const response = await fetch(`${pythonServiceUrl}/api/analyze-game`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        gameId: safeGameId,
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

    // 4. Initiate analysis promise and track in inFlightAnalyses
    const analysisPromise = (async () => {
        try {
            const data = await fetchWithRetry();

            // Save result in memory cache (capped at 100 matches)
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

module.exports = router;
