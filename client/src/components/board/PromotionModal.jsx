import React from 'react';

export default function PromotionModal({ isOpen, onSelectPiece, onCancel }) {
  if (!isOpen) return null;

  return (
    <div id="promotion-modal" className="editorial-modal-backdrop">
      <div className="editorial-modal-box modal-center">
        <div className="modal-protocol-tag">TACTICAL ADVANCEMENT / PROMOTION</div>
        <h3 className="modal-headline modal-headline-sm">PROMOTE YOUR PAWN</h3>
        <p className="modal-body-text">Choose the rank for your promoted pawn:</p>
        <div className="promotion-piece-grid" id="promotion-piece-grid">
          <button
            type="button"
            className="btn-promo-piece"
            title="Promote to Queen"
            onClick={() => onSelectPiece('q')}
          >
            <span className="promo-piece-glyph">♛</span>
            <span className="promo-piece-name">QUEEN [Q]</span>
          </button>
          <button
            type="button"
            className="btn-promo-piece"
            title="Promote to Knight"
            onClick={() => onSelectPiece('n')}
          >
            <span className="promo-piece-glyph">♞</span>
            <span className="promo-piece-name">KNIGHT [N]</span>
          </button>
          <button
            type="button"
            className="btn-promo-piece"
            title="Promote to Rook"
            onClick={() => onSelectPiece('r')}
          >
            <span className="promo-piece-glyph">♜</span>
            <span className="promo-piece-name">ROOK [R]</span>
          </button>
          <button
            type="button"
            className="btn-promo-piece"
            title="Promote to Bishop"
            onClick={() => onSelectPiece('b')}
          >
            <span className="promo-piece-glyph">♝</span>
            <span className="promo-piece-name">BISHOP [B]</span>
          </button>
        </div>
        <div className="modal-actions modal-actions-center" style={{ marginTop: '18px' }}>
          <button
            type="button"
            id="cancel-promotion-btn"
            className="btn-editorial btn-editorial-danger"
            onClick={onCancel}
          >
            CANCEL MOVE ✕
          </button>
        </div>
      </div>
    </div>
  );
}
