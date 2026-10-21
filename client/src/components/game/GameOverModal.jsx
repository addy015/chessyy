import { useNavigate } from 'react-router-dom';

// Dialog shown when a match concludes (checkmate, draw, resignation, or timeout)
export default function GameOverModal({ isOpen, reason, onPlayAgain, onReview }) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  // Handle Review Match button click
  const handleReviewClick = () => {
    if (typeof onReview === 'function') {
      onReview();
    } else {
      navigate('/review');
    }
  };

  return (
    <div id="game-over-modal" className="editorial-modal-backdrop">
      <div className="editorial-modal-box modal-center">
        <div className="modal-protocol-tag">FINAL EVALUATION</div>
        <h2 className="modal-headline modal-headline-lg">GAME CONCLUDED</h2>
        {/* Displays outcome reason (e.g. Checkmate! White wins) */}
        <p id="game-over-reason" className="modal-result-text">
          {reason || 'Match completed.'}
        </p>
        {/* Action buttons: Review Match with AI analysis or Play Again */}
        <div className="modal-actions modal-actions-center" style={{ gap: '12px', display: 'flex' }}>
          <button
            type="button"
            id="review-game-btn"
            className="btn-play-now"
            style={{ background: 'var(--ink)', color: 'var(--paper)', border: '2px solid var(--ink)', cursor: 'pointer' }}
            onClick={handleReviewClick}
          >
            REVIEW MATCH &rarr;
          </button>
          <button
            type="button"
            className="btn-play-now btn-play-again"
            style={{ cursor: 'pointer' }}
            onClick={onPlayAgain}
          >
            PLAY AGAIN &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}

