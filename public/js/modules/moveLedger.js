// What this file does:
// 1. Formats the match history into a neat, 2-column list of moves (Move Ledger).
// 2. Counts captured pieces and calculates the material score difference (e.g. "WHITE +2").
// -------------------------------------------------------------------------

// Standard chess piece values:
// Pawn = 1, Knight/Bishop = 3, Rook = 5, Queen = 9, King = not scored
const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// Normal count of pieces each player starts with
const STARTING_PIECES = { p: 8, n: 2, b: 2, r: 2, q: 1 };

/**
 * Updates the move list table in the UI.
 * Pairs White and Black moves into numbered rows (e.g., "01. e4  e5").
 * Automatically scrolls to show the latest move at the bottom.
 */
export function updateMoveLedger(history, ledgerContainer) {
    if (!ledgerContainer) return;

    if (!history || history.length === 0) {
        ledgerContainer.innerHTML = '<div class="text-sm text-stone-500 italic py-4 text-center font-mono">[Awaiting opening move...]</div>';
        return;
    }

    let html = '';
    for (let i = 0; i < history.length; i += 2) {
        const moveNum = Math.floor(i / 2) + 1;
        const whiteMove = history[i] ? history[i].san : '';
        const blackMove = history[i + 1] ? history[i + 1].san : '';

        // Highlight whichever move was just played
        const isLatestWhite = i === history.length - 1;
        const isLatestBlack = i + 1 === history.length - 1;

        html += `
            <div class="ledger-row">
                <span class="ledger-num">${String(moveNum).padStart(2, '0')}.</span>
                <span class="ledger-move ${isLatestWhite ? 'active' : ''}">${whiteMove}</span>
                <span class="ledger-move ${isLatestBlack ? 'active' : ''}">${blackMove}</span>
            </div>
        `;
    }

    ledgerContainer.innerHTML = html;
    ledgerContainer.scrollTop = ledgerContainer.scrollHeight;
}

/**
 * Counts all pieces currently on the board and compares against starting pieces.
 * Shows captured piece icons and displays the score difference (e.g. "WHITE +3", "EVEN (0)").
 */
export function updateMaterialBalance(chess, whiteCapturedEl, blackCapturedEl, balanceEl) {
    if (!chess) return;

    const board = chess.board();
    const currentCounts = {
        w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
        b: { p: 0, n: 0, b: 0, r: 0, q: 0 }
    };

    // Count living pieces on the board
    board.forEach(row => {
        row.forEach(square => {
            if (square && square.type !== 'k') {
                currentCounts[square.color][square.type]++;
            }
        });
    });

    let whiteCapturesStr = '';
    let blackScore = 0;
    let blackCapturesStr = '';
    let whiteScore = 0;

    // Unicode symbols for captured pieces
    const glyphs = {
        w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕' },
        b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' }
    };

    // Calculate missing pieces (captured pieces) and total points
    ['q', 'r', 'b', 'n', 'p'].forEach(type => {
        const missingWhite = Math.max(0, STARTING_PIECES[type] - currentCounts.w[type]);
        const missingBlack = Math.max(0, STARTING_PIECES[type] - currentCounts.b[type]);

        blackCapturesStr += glyphs.w[type].repeat(missingWhite);
        whiteCapturesStr += glyphs.b[type].repeat(missingBlack);

        whiteScore += currentCounts.w[type] * PIECE_VALUES[type];
        blackScore += currentCounts.b[type] * PIECE_VALUES[type];
    });

    // Display captured icons
    if (whiteCapturedEl) whiteCapturedEl.textContent = whiteCapturesStr || '-';
    if (blackCapturedEl) blackCapturedEl.textContent = blackCapturesStr || '-';

    // Display material point difference
    if (balanceEl) {
        const diff = whiteScore - blackScore;
        if (diff > 0) {
            balanceEl.textContent = `WHITE +${diff}`;
            balanceEl.style.color = '#111111';
        } else if (diff < 0) {
            balanceEl.textContent = `BLACK +${Math.abs(diff)}`;
            balanceEl.style.color = '#D82E1B';
        } else {
            balanceEl.textContent = 'EVEN (0)';
            balanceEl.style.color = '#6E6B65';
        }
    }
}
