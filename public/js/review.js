// What this file does:
// This is the post-match review controller (/review).
// It lets players step forward and backward through every move of their game.
// 
// Main jobs:
// 1. Loads the match history (PGN) from browser storage.
// 2. Pre-calculates the board layout (FEN) for every single move.
// 3. Allows stepping through moves via UI buttons or Left/Right keyboard arrows.
// 4. Updates the vertical evaluation bar (showing who is leading and by how much).
// 5. Calls the backend (/api/game/analyze) to fetch Stockfish move badges and Gemini coach advice.
// -------------------------------------------------------------------------

import { renderBoard } from './modules/boardRenderer.js';

// Default demonstration game (Scholar's Mate) used if visiting /review directly
const DEMO_PGN = "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#";

document.addEventListener('DOMContentLoaded', async () => {
    // -------------------------------------------------------------
    // Element Selectors
    // -------------------------------------------------------------
    const boardElement = document.querySelector('#chessboard');
    const whiteAccuracyEl = document.querySelector('#white-accuracy-val');
    const blackAccuracyEl = document.querySelector('#black-accuracy-val');
    const evalBarFill = document.querySelector('#eval-bar-fill');
    const evalScoreText = document.querySelector('#eval-score-text');
    const evalBarWrapper = document.querySelector('#eval-bar-wrapper');
    const journalContainer = document.querySelector('#review-moves-container');
    const plyCounter = document.querySelector('#ply-counter');
    const suggestionTitle = document.querySelector('#engine-suggestion-title');
    const suggestionBody = document.querySelector('#engine-suggestion-body');
    const coachWhiteTip = document.querySelector('#coach-white-tip');
    const coachBlackTip = document.querySelector('#coach-black-tip');

    // Navigation buttons (First, Previous, Next, Last, Flip Board)
    const btnFirst = document.querySelector('#btn-first');
    const btnPrev = document.querySelector('#btn-prev');
    const btnNext = document.querySelector('#btn-next');
    const btnLast = document.querySelector('#btn-last');
    const btnFlip = document.querySelector('#btn-flip');

    // -------------------------------------------------------------
    // Review State Variables
    // -------------------------------------------------------------
    let currentPly = 0;        // Current half-move being viewed (0 = game start)
    let isFlipped = false;     // True if board is viewed from Black's perspective
    let analysisData = null;   // Stores Stockfish badges and coach tips once fetched
    let movePositions = [];    // Array of FEN board positions for each move

    // 1. Retrieve match PGN from browser storage (saved when game ended)
    const storedPgn = sessionStorage.getItem('chessyy_review_pgn');
    let activePgn = DEMO_PGN;
    if (storedPgn && storedPgn.trim()) {
        const testEngine = new Chess();
        const loaded = testEngine.load_pgn(storedPgn);
        if (loaded && testEngine.history().length > 0) {
            activePgn = storedPgn;
        } else {
            // Basic cleanup in case PGN has non-standard header tags
            const stripped = storedPgn.replace(/\[.*?\]/g, '').replace(/\d+\./g, '').trim();
            if (stripped.length > 0) {
                activePgn = storedPgn;
            }
        }
    }

    // 2. Pre-compute the exact board state (FEN) for every single half-move
    function buildPositionsFromPgn(pgn) {
        const gameEngine = new Chess();
        const fens = [gameEngine.fen()]; // Starting position (ply 0)

        if (!gameEngine.load_pgn(pgn)) {
            // Fallback tokenizer if load_pgn fails on raw move strings
            const tokens = pgn.replace(/\d+\./g, '').trim().split(/\s+/);
            gameEngine.reset();
            fens.length = 0;
            fens.push(gameEngine.fen());
            tokens.forEach(san => {
                if (san && !san.includes('-') && !san.includes('/')) {
                    try { gameEngine.move(san); fens.push(gameEngine.fen()); } catch (e) {}
                }
            });
        } else {
            const movesList = gameEngine.history();
            gameEngine.reset();
            fens.length = 0;
            fens.push(gameEngine.fen());
            movesList.forEach(m => {
                gameEngine.move(m);
                fens.push(gameEngine.fen());
            });
        }
        return fens;
    }

    // Quickly extracts moves for immediate display while waiting for Stockfish in the background
    function extractRawMovesFromPgn(pgn) {
        const temp = new Chess();
        if (!temp.load_pgn(pgn)) {
            const tokens = pgn.replace(/\d+\./g, '').trim().split(/\s+/);
            tokens.forEach(san => {
                if (san && !san.includes('-') && !san.includes('/')) {
                    try { temp.move(san); } catch (e) {}
                }
            });
        }
        return temp.history().map((san, idx) => ({
            ply: idx + 1,
            color: idx % 2 === 0 ? 'white' : 'black',
            san: san,
            badge: '...' // Placeholder badge until Stockfish finishes
        }));
    }

    movePositions = buildPositionsFromPgn(activePgn);

    // 3. Updates the board, eval bar, and suggestion text for the active move
    function updateReviewState() {
        if (!movePositions.length) return;

        // Load the FEN board layout for the current ply
        const targetFen = movePositions[currentPly];
        const displayChess = new Chess();
        displayChess.load(targetFen);

        let lastMove = null;
        if (currentPly > 0 && analysisData && analysisData.moves && analysisData.moves[currentPly - 1]) {
            lastMove = { from: '', to: '' };
        }

        // Render the chessboard in read-only mode
        renderBoard({
            boardElement,
            chess: displayChess,
            playerRole: isFlipped ? 'b' : 'w',
            selectedSquare: null,
            possibleMoves: [],
            lastMove,
            onSquareClick: null // Clicking squares does not move pieces during review
        });

        syncEvalBarHeight();

        // Update Stepper Button states (disable Prev at start, disable Next at end)
        btnFirst.disabled = currentPly === 0;
        btnPrev.disabled = currentPly === 0;
        btnNext.disabled = currentPly >= movePositions.length - 1;
        btnLast.disabled = currentPly >= movePositions.length - 1;

        if (plyCounter) {
            plyCounter.textContent = `PLY ${currentPly} / ${movePositions.length - 1}`;
        }

        // Update the vertical advantage bar if evaluation numbers are available
        if (analysisData && analysisData.evalGraph) {
            const evalScore = analysisData.evalGraph[currentPly] !== undefined ? analysisData.evalGraph[currentPly] : 0.0;
            updateEvalBar(evalScore);
        }

        // Highlight the active move cell in the move history journal
        highlightJournalMove(currentPly);

        // Update the coach explanation box
        updateSuggestionCard(currentPly);
    }

    // Updates the height and score of the evaluation bar
    function updateEvalBar(evalScore) {
        // Clamp score between -10 and +10 pawns
        const clampedEval = Math.max(-10.0, Math.min(10.0, evalScore));
        // Convert to percentage: 50% = equal game, >50% = White leading, <50% = Black leading
        const percentage = 50 + (clampedEval / 10.0) * 45;

        evalBarFill.style.height = `${percentage}%`;

        const isWhiteAdvantage = evalScore >= 0;
        evalBarWrapper.classList.toggle('black-leading', !isWhiteAdvantage);

        // If score is near ±10 pawns, display 'MATE'
        if (Math.abs(evalScore) >= 9.9) {
            evalScoreText.textContent = isWhiteAdvantage ? 'MATE' : '-MATE';
        } else {
            evalScoreText.textContent = (evalScore > 0 ? `+${evalScore.toFixed(1)}` : evalScore.toFixed(1));
        }
    }

    // Keep eval bar height matching the chessboard on all screen sizes
    function syncEvalBarHeight() {
        const boardWrapper = document.querySelector('.review-board-area .board-wrapper');
        if (boardWrapper && evalBarWrapper) {
            const h = boardWrapper.offsetHeight;
            if (h > 0) {
                evalBarWrapper.style.height = `${h}px`;
            }
        }
    }
    window.addEventListener('resize', syncEvalBarHeight);

    // Highlights the current move row and scrolls it into view automatically
    function highlightJournalMove(ply) {
        const cells = document.querySelectorAll('.review-move-cell');
        cells.forEach(c => c.classList.remove('active-ply'));

        if (ply > 0) {
            const activeCell = document.querySelector(`.review-move-cell[data-ply="${ply}"]`);
            if (activeCell) {
                activeCell.classList.add('active-ply');
                activeCell.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }

    // Displays Stockfish engine score, best recommended move, and Gemini coach quote
    function updateSuggestionCard(ply) {
        if (ply === 0) {
            suggestionTitle.textContent = "START OF GAME";
            suggestionBody.textContent = "Initial board setup. Navigate forward to inspect move evaluations.";
            return;
        }

        if (!analysisData || !analysisData.moves || !analysisData.moves[ply - 1]) {
            suggestionTitle.textContent = `PLY ${ply} / ${movePositions.length - 1}`;
            suggestionBody.innerHTML = `<em>Evaluating move with Stockfish &amp; Gemini AI Coach...</em>`;
            return;
        }

        const moveInfo = analysisData.moves[ply - 1];
        suggestionTitle.innerHTML = `<span class="move-badge badge-${moveInfo.badge.toLowerCase()}">${moveInfo.badge}</span> ${moveInfo.color.toUpperCase()} PLAYED ${moveInfo.san}`;
        
        let bodyHtml = `Evaluation: <strong>${moveInfo.eval > 0 ? '+' : ''}${moveInfo.eval.toFixed(2)}</strong> &bull; Best Engine Move: <strong>${moveInfo.bestMove}</strong>`;
        if (moveInfo.coachExplanation) {
            bodyHtml += `
                <div class="coach-turning-point-box">
                    <div class="coach-quote-label">✦ GM COACH INSIGHT</div>
                    <div class="coach-quote-text">"${moveInfo.coachExplanation}"</div>
                </div>
            `;
        }
        suggestionBody.innerHTML = bodyHtml;
    }

    // 4. Builds the move list journal table (pairs White and Black moves per row)
    function renderJournal(moves) {
        if (!moves || !moves.length) {
            journalContainer.innerHTML = '<div style="padding: 24px 0; text-align: center; color: var(--ink-muted);">No moves recorded.</div>';
            return;
        }

        let html = '';
        let moveNumber = 1;

        for (let i = 0; i < moves.length; i += 2) {
            const whiteMove = moves[i];
            const blackMove = moves[i + 1];

            html += `<div class="review-move-row">`;
            html += `<span class="move-number-tag">${moveNumber}.</span>`;

            // White Move Cell
            const whiteBadge = whiteMove.badge === '...'
                ? `<span class="move-badge" style="background: transparent; color: var(--ink-muted); border: 1px solid var(--line);">...</span>`
                : `<span class="move-badge badge-${whiteMove.badge.toLowerCase()}">${whiteMove.badge}</span>`;

            html += `
                <div class="review-move-cell" data-ply="${whiteMove.ply}">
                    <span>${whiteMove.san}</span>
                    ${whiteBadge}
                </div>
            `;

            // Black Move Cell
            if (blackMove) {
                const blackBadge = blackMove.badge === '...'
                    ? `<span class="move-badge" style="background: transparent; color: var(--ink-muted); border: 1px solid var(--line);">...</span>`
                    : `<span class="move-badge badge-${blackMove.badge.toLowerCase()}">${blackMove.badge}</span>`;

                html += `
                    <div class="review-move-cell" data-ply="${blackMove.ply}">
                        <span>${blackMove.san}</span>
                        ${blackBadge}
                    </div>
                `;
            } else {
                html += `<div></div>`;
            }

            html += `</div>`;
            moveNumber++;
        }

        journalContainer.innerHTML = html;

        // Clicking on any move in the list jumps the board directly to that moment
        document.querySelectorAll('.review-move-cell').forEach(cell => {
            cell.addEventListener('click', () => {
                const targetPly = parseInt(cell.dataset.ply, 10);
                if (!isNaN(targetPly)) {
                    currentPly = targetPly;
                    updateReviewState();
                }
            });
        });
    }

    // 5. Navigation Button Listeners (Step to start, back, forward, end, flip)
    btnFirst.addEventListener('click', () => { currentPly = 0; updateReviewState(); });
    btnPrev.addEventListener('click', () => { if (currentPly > 0) { currentPly--; updateReviewState(); } });
    btnNext.addEventListener('click', () => { if (currentPly < movePositions.length - 1) { currentPly++; updateReviewState(); } });
    btnLast.addEventListener('click', () => { currentPly = movePositions.length - 1; updateReviewState(); });
    btnFlip.addEventListener('click', () => { isFlipped = !isFlipped; updateReviewState(); });

    // Keyboard Arrow Keys (Left = previous move, Right = next move)
    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
            if (currentPly > 0) { currentPly--; updateReviewState(); }
        } else if (e.key === 'ArrowRight') {
            if (currentPly < movePositions.length - 1) { currentPly++; updateReviewState(); }
        }
    });

    // 6. Instant Initial Render: show board and move list immediately
    const preliminaryMoves = extractRawMovesFromPgn(activePgn);
    renderJournal(preliminaryMoves);
    currentPly = movePositions.length - 1; // Start viewing at the final move
    updateReviewState();

    // 7. Background Fetch: Request full Stockfish analysis and Gemini advice from backend
    try {
        const response = await fetch('/api/game/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pgn: activePgn })
        });

        if (!response.ok) {
            throw new Error(`Analysis server returned ${response.status}`);
        }

        analysisData = await response.json();

        // Update player accuracy percentages (e.g. "88.4%")
        if (whiteAccuracyEl) whiteAccuracyEl.textContent = `${analysisData.whiteAccuracy}%`;
        if (blackAccuracyEl) blackAccuracyEl.textContent = `${analysisData.blackAccuracy}%`;

        // Update overall coaching tips for White & Black
        if (analysisData.coachSummary) {
            if (coachWhiteTip && analysisData.coachSummary.whiteTip) {
                coachWhiteTip.textContent = analysisData.coachSummary.whiteTip;
            }
            if (coachBlackTip && analysisData.coachSummary.blackTip) {
                coachBlackTip.textContent = analysisData.coachSummary.blackTip;
            }
        }

        // Re-render the journal table with official badges (Brilliant, Best, Blunder)
        renderJournal(analysisData.moves);
        updateReviewState();

    } catch (err) {
        console.error('[Review] Analysis failed:', err);
        if (coachWhiteTip) coachWhiteTip.textContent = 'Engine offline. Tips unavailable.';
        if (coachBlackTip) coachBlackTip.textContent = 'Engine offline. Tips unavailable.';

        const offlineNotice = document.createElement('div');
        offlineNotice.style = 'padding: 12px; text-align: center; color: var(--vermilion); font-family: var(--font-mono); font-size: 0.75rem; border-bottom: 1px solid var(--line);';
        offlineNotice.innerHTML = '[ENGINE ANALYSIS OFFLINE &bull; RUNNING IN REPLAY MODE]';
        journalContainer.prepend(offlineNotice);
    }
});
