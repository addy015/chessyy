// What this file does:
// This is the graphical board painter.
// It generates the 64 chessboard squares in HTML, places the chess piece symbols,
// draws rank & file coordinates, and highlights valid moves and checks.
// -------------------------------------------------------------------------

// Unicode chess symbols for drawing pieces on the board
const PIECE_UNICODE = {
    p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚',
    P: '♙', R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔'
};

/**
 * Returns the matching Unicode chess glyph for a given piece and color.
 * Example: type 'q', color 'w' -> returns '♕' (White Queen).
 */
export function getPieceSymbol(type, color) {
    if (!type) return '';
    const key = color === 'w' ? type.toUpperCase() : type.toLowerCase();
    return PIECE_UNICODE[key] || '';
}

/**
 * Main function that redraws the entire 8x8 chessboard inside boardElement.
 */
export function renderBoard({
    boardElement,
    chess,
    playerRole,
    selectedSquare,
    possibleMoves = [],
    lastMove = null,
    onSquareClick
}) {
    if (!boardElement || !chess) return;

    const board = chess.board();
    boardElement.innerHTML = '';

    // Board orientation: White is at bottom by default; flipped if player is Black
    if (playerRole === 'b') {
        boardElement.classList.add('flipped');
    } else {
        boardElement.classList.remove('flipped');
    }

    const isWhiteTurn = chess.turn() === 'w';
    const kingInCheck = typeof chess.in_check === 'function' ? chess.in_check() : (typeof chess.inCheck === 'function' ? chess.inCheck() : false);

    // Loop through all 8 rows and 8 columns (64 squares)
    board.forEach((row, rowIndex) => {
        row.forEach((square, colIndex) => {
            const squareEl = document.createElement('div');
            squareEl.classList.add('square');

            // Checkerboard coloring: alternating light and dark squares
            const isLight = (rowIndex + colIndex) % 2 === 0;
            squareEl.classList.add(isLight ? 'light' : 'dark');

            // Standard chess coordinate name (e.g. 'e4', 'd5')
            // 'file' is the column letter (a to h)
            // 'rank' is the row number (1 to 8)
            const fileChar = String.fromCharCode(97 + colIndex);
            const rankNum = 8 - rowIndex;
            const squareName = `${fileChar}${rankNum}`;

            squareEl.dataset.square = squareName;
            squareEl.dataset.row = rowIndex;
            squareEl.dataset.col = colIndex;

            // Edge numbers (Ranks on the left-most column)
            if (colIndex === 0) {
                const rankEl = document.createElement('span');
                rankEl.classList.add('square-coord', 'rank');
                rankEl.textContent = rankNum;
                squareEl.appendChild(rankEl);
            }
            // Edge letters (Files along the bottom-most row)
            if (rowIndex === 7) {
                const fileEl = document.createElement('span');
                fileEl.classList.add('square-coord', 'file');
                fileEl.textContent = fileChar;
                squareEl.appendChild(fileEl);
            }

            // Highlight currently selected piece
            if (selectedSquare && selectedSquare.row === rowIndex && selectedSquare.col === colIndex) {
                squareEl.classList.add('selected');
            }

            // Highlight the previous move (origin and destination squares)
            if (lastMove && (lastMove.from === squareName || lastMove.to === squareName)) {
                squareEl.classList.add('last-move');
            }

            // Show legal move dots or capture rings
            const move = possibleMoves.find(m => m.to === squareName);
            if (move) {
                const marker = document.createElement('div');
                // 'c' flag means capture, 'e' flag means en-passant capture
                if (move.flags && (move.flags.includes('c') || move.flags.includes('e'))) {
                    marker.classList.add('available-move-capture');
                } else {
                    marker.classList.add('available-move');
                }
                squareEl.appendChild(marker);
            }

            // Draw chess piece glyph inside square
            if (square) {
                const pieceEl = document.createElement('div');
                pieceEl.classList.add('piece', square.color === 'w' ? 'white' : 'black');
                pieceEl.textContent = getPieceSymbol(square.type, square.color);

                // Highlight King in red if currently in check
                if (square.type === 'k' && kingInCheck && square.color === chess.turn()) {
                    squareEl.classList.add('in-check');
                }

                squareEl.appendChild(pieceEl);
            }

            // Handle user click on square
            squareEl.addEventListener('click', (e) => {
                e.stopPropagation();
                if (onSquareClick) {
                    onSquareClick(rowIndex, colIndex, squareName, square);
                }
            });

            boardElement.appendChild(squareEl);
        });
    });
}
