import React from 'react';

export default function EvalBar({ evalScore = 0.0, height = null }) {
  const clampedEval = Math.max(-10.0, Math.min(10.0, evalScore));
  const percentage = 50 + (clampedEval / 10.0) * 45;
  const isWhiteAdvantage = evalScore >= 0;

  let scoreText = '';
  if (Math.abs(evalScore) >= 9.9) {
    scoreText = isWhiteAdvantage ? 'MATE' : '-MATE';
  } else {
    scoreText = evalScore > 0 ? `+${evalScore.toFixed(1)}` : evalScore.toFixed(1);
  }

  return (
    <div
      id="eval-bar-wrapper"
      className={`eval-bar-wrapper ${isWhiteAdvantage ? '' : 'black-leading'}`}
      style={height ? { height: `${height}px` } : undefined}
    >
      <div
        id="eval-bar-fill"
        className="eval-bar-fill-white"
        style={{ height: `${percentage}%` }}
      />
      <span id="eval-score-text" className="eval-score-text">
        {scoreText}
      </span>
    </div>
  );
}
