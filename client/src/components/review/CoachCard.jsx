import React from 'react';

export default function CoachCard({ coachSummary, isOffline = false }) {
  const whiteTip = isOffline
    ? 'Engine offline. Tips unavailable.'
    : coachSummary?.whiteTip || 'Evaluating strategic strengths...';

  const blackTip = isOffline
    ? 'Engine offline. Tips unavailable.'
    : coachSummary?.blackTip || 'Evaluating strategic strengths...';

  return (
    <div className="coach-dispatch-card" id="coach-dispatch-card">
      <div className="coach-dispatch-header">
        <span className="coach-badge">AI COACH // GEMINI</span>
        <span className="coach-meta">TACTICAL DEBRIEF</span>
      </div>
      <div className="coach-tips-grid">
        <div className="coach-tip-block">
          <span className="tip-player white">WHITE</span>
          <p id="coach-white-tip" className="coach-tip-text">
            {whiteTip}
          </p>
        </div>
        <div className="coach-tip-block">
          <span className="tip-player black">BLACK</span>
          <p id="coach-black-tip" className="coach-tip-text">
            {blackTip}
          </p>
        </div>
      </div>
    </div>
  );
}
