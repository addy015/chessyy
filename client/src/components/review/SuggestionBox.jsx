import React from 'react';

export default function SuggestionBox({ currentPly, moveInfo, maxPly }) {
  if (currentPly === 0) {
    return (
      <div className="engine-suggestion-box" id="engine-suggestion-box">
        <div className="engine-suggestion-title" id="engine-suggestion-title">START OF GAME</div>
        <div className="engine-suggestion-body" id="engine-suggestion-body">
          {maxPly > 0
            ? 'Initial board setup. Navigate forward to inspect move evaluations.'
            : 'No moves were played in this match.'}
        </div>
      </div>
    );
  }

  if (!moveInfo) {
    return (
      <div className="engine-suggestion-box" id="engine-suggestion-box">
        <div className="engine-suggestion-title" id="engine-suggestion-title">PLY {currentPly} / {maxPly}</div>
        <div className="engine-suggestion-body" id="engine-suggestion-body">
          <em>Evaluating move with Stockfish &amp; Gemini AI Coach...</em>
        </div>
      </div>
    );
  }

  const { badge, color, san, eval: evalScore, bestMove, coachExplanation } = moveInfo;

  return (
    <div className="engine-suggestion-box" id="engine-suggestion-box">
      <div className="engine-suggestion-title" id="engine-suggestion-title">
        {badge && (
          <span className={`move-badge badge-${badge.toLowerCase()}`} style={{ marginRight: '6px' }}>
            {badge}
          </span>
        )}
        {color?.toUpperCase()} PLAYED {san}
      </div>

      <div className="engine-suggestion-body" id="engine-suggestion-body">
        Evaluation: <strong>{evalScore > 0 ? '+' : ''}{evalScore !== undefined ? evalScore.toFixed(2) : '0.00'}</strong> &bull; Best Engine Move: <strong>{bestMove || '—'}</strong>

        {coachExplanation && (
          <div className="coach-turning-point-box" style={{ marginTop: '10px' }}>
            <div className="coach-quote-label">✦ GM COACH INSIGHT</div>
            <div className="coach-quote-text">"{coachExplanation}"</div>
          </div>
        )}
      </div>
    </div>
  );
}
