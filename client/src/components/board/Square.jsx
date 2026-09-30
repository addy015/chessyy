import React from 'react';
import Piece from './Piece';

export default function Square({
  squareName,
  rowIndex,
  colIndex,
  square, // { type, color } | null
  isLight,
  isSelected,
  isLastMove,
  isCheck,
  moveMarker, // null | 'normal' | 'capture'
  onClick,
}) {
  const fileChar = String.fromCharCode(97 + colIndex);
  const rankNum = 8 - rowIndex;

  let squareClasses = `square ${isLight ? 'light' : 'dark'}`;
  if (isSelected) squareClasses += ' selected';
  if (isLastMove) squareClasses += ' last-move';
  if (isCheck) squareClasses += ' in-check';

  return (
    <div
      className={squareClasses}
      data-square={squareName}
      data-row={rowIndex}
      data-col={colIndex}
      onClick={(e) => {
        e.stopPropagation();
        if (onClick) onClick(rowIndex, colIndex, squareName, square);
      }}
    >
      {/* Edge coordinate numbers (Rank on leftmost column) */}
      {colIndex === 0 && (
        <span className="square-coord rank">{rankNum}</span>
      )}

      {/* Edge coordinate letters (File on bottom row) */}
      {rowIndex === 7 && (
        <span className="square-coord file">{fileChar}</span>
      )}

      {/* Legal Move Marker */}
      {moveMarker === 'normal' && <div className="available-move" />}
      {moveMarker === 'capture' && <div className="available-move-capture" />}

      {/* Chess Piece */}
      {square && <Piece type={square.type} color={square.color} />}
    </div>
  );
}
