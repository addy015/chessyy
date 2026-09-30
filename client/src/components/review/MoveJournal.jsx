import React, { useEffect, useRef } from 'react';

export default function MoveJournal({
  moves = [],
  currentPly = 0,
  maxPly = 0,
  onSelectPly,
  isLoading = false,
  isOffline = false,
  onRetry = null,
  retryCooldown = 0,
  retryCount = 0,
  maxRetries = 3,
}) {
  const activeRowRef = useRef(null);

  useEffect(() => {
    if (activeRowRef.current) {
      activeRowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [currentPly]);

  // Group moves into pairs (White move + Black move per row)
  const pairedMoves = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairedMoves.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1] || null,
    });
  }

  const renderBadge = (badge) => {
    if (!badge || badge === '...') {
      return (
        <span
          className="move-badge"
          style={{ background: 'transparent', color: 'var(--ink-muted)', border: '1px solid var(--line)' }}
        >
          ...
        </span>
      );
    }
    return (
      <span className={`move-badge badge-${badge.toLowerCase()}`}>
        {badge}
      </span>
    );
  };

  return (
    <div className="review-journal-panel-wrapper">
      <div className="panel-header">
        <span className="panel-title">EVALUATION JOURNAL</span>
        <span className="panel-meta" id="ply-counter">PLY {currentPly} / {maxPly}</span>
      </div>

      {isOffline && (
        <div className="review-offline-banner">
          <div className="offline-msg">
            [ENGINE ANALYSIS OFFLINE &bull; RUNNING IN REPLAY MODE]
          </div>
          {onRetry && (
            retryCount < maxRetries ? (
              <button
                type="button"
                className="btn-retry-eval"
                disabled={isLoading || retryCooldown > 0}
                onClick={onRetry}
                title={retryCooldown > 0 ? `Please wait ${retryCooldown}s before retrying` : 'Retry engine evaluation'}
              >
                {isLoading
                  ? 'EVALUATING... ↻'
                  : retryCooldown > 0
                  ? `RETRY IN ${retryCooldown}S`
                  : `RETRY EVALUATION ↻ (${maxRetries - retryCount} LEFT)`}
              </button>
            ) : (
              <div className="offline-exhausted">
                MAX RETRIES REACHED &bull; AI SERVICE BUSY
              </div>
            )
          )}
        </div>
      )}

      <div className="review-journal-scroll" id="review-moves-container">
        {pairedMoves.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink-muted)' }}>
            No moves recorded in this match.
          </div>
        ) : (
          pairedMoves.map((row) => {
            const isWhiteActive = currentPly === row.white.ply;
            const isBlackActive = row.black && currentPly === row.black.ply;

            return (
              <div
                key={row.moveNumber}
                className="review-move-row"
                ref={isWhiteActive || isBlackActive ? activeRowRef : null}
              >
                <span className="move-number-tag">{row.moveNumber}.</span>

                {/* White move */}
                <div
                  className={`review-move-cell ${isWhiteActive ? 'active-ply' : ''}`}
                  onClick={() => onSelectPly(row.white.ply)}
                >
                  <span className="move-san">{row.white.san}</span>
                  {renderBadge(row.white.badge)}
                </div>

                {/* Black move */}
                {row.black ? (
                  <div
                    className={`review-move-cell ${isBlackActive ? 'active-ply' : ''}`}
                    onClick={() => onSelectPly(row.black.ply)}
                  >
                    <span className="move-san">{row.black.san}</span>
                    {renderBadge(row.black.badge)}
                  </div>
                ) : (
                  <div></div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
