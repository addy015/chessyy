import React from 'react';

const PIECE_UNICODE = {
  p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚',
  P: '♙', R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔',
};

export function getPieceSymbol(type, color) {
  if (!type) return '';
  const key = color === 'w' ? type.toUpperCase() : type.toLowerCase();
  return PIECE_UNICODE[key] || '';
}

export default function Piece({ type, color }) {
  if (!type) return null;
  const symbol = getPieceSymbol(type, color);
  const colorClass = color === 'w' ? 'white' : 'black';

  return (
    <div className={`piece ${colorClass}`}>
      {symbol}
    </div>
  );
}
