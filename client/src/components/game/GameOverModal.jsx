import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function GameOverModal({ isOpen, reason, onPlayAgain }) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  return (
    <div id="game-over-modal" className="editorial-modal-backdrop">
      <div className="editorial-modal-box modal-center">
        <div className="modal-protocol-tag">FINAL EVALUATION</div>
        <h2 className="modal-headline modal-headline-lg">GAME CONCLUDED</h2>
        <p id="game-over-reason" className="modal-result-text">
          {reason || 'Match completed.'}
        </p>
        <div className="modal-actions modal-actions-center" style={{ gap: '12px', display: 'flex' }}>
          <button
            type="button"
            id="review-game-btn"
            className="btn-play-now"
            style={{ background: 'var(--ink)', color: 'var(--paper)', border: '2px solid var(--ink)' }}
            onClick={() => navigate('/review')}
          >
            REVIEW MATCH &rarr;
          </button>
          <button
            type="button"
            className="btn-play-now btn-play-again"
            onClick={onPlayAgain}
          >
            PLAY AGAIN &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
