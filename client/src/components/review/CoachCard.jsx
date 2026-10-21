
// Displays Gemini AI Coach's game story and actionable advice for both players
export default function CoachCard({ coachSummary, isOffline = false, isLoading = false }) {
  const narrative = coachSummary?.gameNarrative;

  const defaultWhiteTip = isLoading
    ? 'Evaluating strategic strengths...'
    : 'Focus on developing minor pieces early and guarding key central outposts.';

  const defaultBlackTip = isLoading
    ? 'Evaluating strategic strengths...'
    : 'Look out for early opponent incursions and keep your king position secure.';

  // White player tactical feedback or fallback if offline/evaluating
  const whiteTip = isOffline
    ? 'Engine offline. Tips unavailable.'
    : coachSummary?.whiteTip || defaultWhiteTip;

  // Black player tactical feedback or fallback if offline/evaluating
  const blackTip = isOffline
    ? 'Engine offline. Tips unavailable.'
    : coachSummary?.blackTip || defaultBlackTip;

  return (
    <div className="coach-dispatch-card" id="coach-dispatch-card">
      {/* Card title badge */}
      <div className="coach-dispatch-header">
        <span className="coach-badge">✦ GM COACH STORY &amp; DEBRIEF</span>
        <span className="coach-meta">MATCH ANALYSIS</span>
      </div>

      {/* Overall game narrative story if available */}
      {narrative && (
        <div
          className="coach-narrative-box"
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--line)',
            fontSize: '13px',
            lineHeight: '1.5',
            color: 'var(--ink)',
            background: 'var(--card-subtle, rgba(255, 255, 255, 0.03))',
          }}
        >
          <strong>Game Narrative:</strong> "{narrative}"
        </div>
      )}

      {/* Grid containing advice cards for both sides */}
      <div className="coach-tips-grid">
        {/* White player commentary */}
        <div className="coach-tip-block">
          <span className="tip-player white">WHITE</span>
          <p id="coach-white-tip" className="coach-tip-text">
            {whiteTip}
          </p>
        </div>

        {/* Black player commentary */}
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
