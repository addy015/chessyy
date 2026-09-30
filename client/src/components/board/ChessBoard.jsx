import React from 'react';
import Square from './Square';

export default function ChessBoard({
  chess,
  playerRole = 'w',
  selectedSquare = null,
  possibleMoves = [],
  lastMove = null,
  onSquareClick = null,
  className = '',
}) {
  if (!chess) return null;

  const board = chess.board();
  const isFlipped = playerRole === 'b';
  const inCheck = typeof chess.inCheck === 'function'
    ? chess.inCheck()
    : (typeof chess.in_check === 'function' ? chess.in_check() : false);

  const turn = chess.turn();

  return (
    <div
      id="chessboard"
      className={`chessboard ${isFlipped ? 'flipped' : ''} ${className}`}
    >
      {board.map((row, rowIndex) =>
        row.map((square, colIndex) => {
          const fileChar = String.fromCharCode(97 + colIndex);
          const rankNum = 8 - rowIndex;
          const squareName = `${fileChar}${rankNum}`;

          const isLight = (rowIndex + colIndex) % 2 === 0;
          const isSelected = selectedSquare && selectedSquare.row === rowIndex && selectedSquare.col === colIndex;
          const isLast = lastMove && (lastMove.from === squareName || lastMove.to === squareName);
          const isKingCheck = square && square.type === 'k' && inCheck && square.color === turn;

          let moveMarker = null;
          const targetMove = possibleMoves.find((m) => m.to === squareName);
          if (targetMove) {
            moveMarker = (targetMove.flags && (targetMove.flags.includes('c') || targetMove.flags.includes('e')))
              ? 'capture'
              : 'normal';
          }

          return (
            <Square
              key={squareName}
              squareName={squareName}
              rowIndex={rowIndex}
              colIndex={colIndex}
              square={square}
              isLight={isLight}
              isSelected={isSelected}
              isLastMove={isLast}
              isCheck={isKingCheck}
              moveMarker={moveMarker}
              onClick={onSquareClick}
            />
          );
        })
      )}
    </div>
  );
}
