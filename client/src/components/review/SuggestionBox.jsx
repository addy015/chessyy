
import { useState } from 'react';

// Detail panel displaying move evaluation, engine best move, and interactive GM Coach Q&A
export default function SuggestionBox({ currentPly, moveInfo, maxPly, currentFen }) {
  const [isAsking, setIsAsking] = useState(false);
  const [customQuestion, setCustomQuestion] = useState('');
  const [coachAnswer, setCoachAnswer] = useState(null);
  const [isQuerying, setIsQuerying] = useState(false);

  // Start of match initial board state
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

  // Move evaluation loading state
  if (!moveInfo) {
    return (
      <div className="engine-suggestion-box" id="engine-suggestion-box">
        <div className="engine-suggestion-title" id="engine-suggestion-title">PLY {currentPly} / {maxPly}</div>
        <div className="engine-suggestion-body" id="engine-suggestion-body">
          <em>Evaluating move with Stockfish..</em>
        </div>
      </div>
    );
  }

  const { badge, color, san, eval: evalScore, bestMove, explanation, pv = [] } = moveInfo;

  // Handles sending student question to Gemini AI Coach
  const handleAskCoach = async (questionText) => {
    const q = questionText || customQuestion || `Why is ${san} marked as a ${badge}?`;
    setIsQuerying(true);
    setCoachAnswer(null);

    try {
      const response = await fetch('/api/game/ask-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fen: currentFen,
          playedMove: san,
          bestMove: bestMove || '—',
          enginePv: pv,
          userQuestion: q,
        }),
      });

      const data = await response.json();
      setCoachAnswer(data.answer || 'Stockfish suggests following the engine continuation.');
    } catch (err) {
      setCoachAnswer('Coach connection busy. Engine recommends following best move continuation.');
    } finally {
      setIsQuerying(false);
    }
  };

  return (
    <div className="engine-suggestion-box" id="engine-suggestion-box">
      {/* Move quality badge and notation title */}
      <div className="engine-suggestion-title" id="engine-suggestion-title">
        {badge && (
          <span className={`move-badge badge-${badge.toLowerCase()}`} style={{ marginRight: '6px' }}>
            {badge}
          </span>
        )}
        {color?.toUpperCase()} PLAYED {san}
      </div>

      {/* Numerical score & engine recommendation */}
      <div className="engine-suggestion-body" id="engine-suggestion-body">
        Evaluation: <strong>{evalScore > 0 ? '+' : ''}{evalScore !== undefined ? evalScore.toFixed(2) : '0.00'}</strong> &bull; Best Engine Move: <strong>{bestMove || '—'}</strong>

        {/* Instant tactical rule-based explanation */}
        {explanation && (
          <div style={{ marginTop: '8px', color: 'var(--ink)' }}>
            {explanation}
          </div>
        )}

        {/* Ask Coach trigger button */}
        <div style={{ marginTop: '12px' }}>
          {!isAsking ? (
            <button
              type="button"
              className="btn-step"
              onClick={() => { setIsAsking(true); setCoachAnswer(null); }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                fontSize: '11px',
                borderColor: 'var(--accent, #d4a373)',
              }}
            >
              <span>✦ ASK COACH WHY</span>
            </button>
          ) : (
            <div
              className="coach-ask-drawer"
              style={{
                marginTop: '10px',
                padding: '12px',
                borderRadius: '6px',
                background: 'var(--card-subtle, rgba(255, 255, 255, 0.04))',
                border: '1px solid var(--line)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--accent, #d4a373)' }}>
                  ASK GRANDMASTER COACH
                </span>
                <button
                  type="button"
                  onClick={() => setIsAsking(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--ink-muted)', cursor: 'pointer', fontSize: '13px' }}
                >
                  &times;
                </button>
              </div>

              {/* Quick pre-set question chips */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <button
                  type="button"
                  className="btn-step"
                  style={{ fontSize: '10px', padding: '3px 8px' }}
                  onClick={() => handleAskCoach(`Why is ${san} a ${badge}?`)}
                  disabled={isQuerying}
                >
                  Why is this a {badge.toLowerCase()}?
                </button>
                <button
                  type="button"
                  className="btn-step"
                  style={{ fontSize: '10px', padding: '3px 8px' }}
                  onClick={() => handleAskCoach(`What was the opponent's threat after ${san}?`)}
                  disabled={isQuerying}
                >
                  What was the threat?
                </button>
                <button
                  type="button"
                  className="btn-step"
                  style={{ fontSize: '10px', padding: '3px 8px' }}
                  onClick={() => handleAskCoach(`Why is ${bestMove} better than ${san}?`)}
                  disabled={isQuerying}
                >
                  Why is {bestMove} better?
                </button>
              </div>

              {/* Custom question input */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  placeholder="Or ask your own question..."
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAskCoach(customQuestion)}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    fontSize: '11px',
                    borderRadius: '4px',
                    border: '1px solid var(--line)',
                    background: 'var(--bg)',
                    color: 'var(--ink)',
                  }}
                />
                <button
                  type="button"
                  className="btn-step"
                  onClick={() => handleAskCoach(customQuestion)}
                  disabled={isQuerying}
                  style={{ padding: '6px 12px', fontSize: '11px' }}
                >
                  {isQuerying ? 'ASKING... ↻' : 'SEND'}
                </button>
              </div>

              {/* Coach AI Answer box */}
              {coachAnswer && (
                <div
                  className="coach-turning-point-box"
                  style={{ marginTop: '10px', animation: 'fadeIn 0.2s ease-in' }}
                >
                  <div className="coach-quote-label">✦ GM COACH EXPLANATION</div>
                  <div className="coach-quote-text">"{coachAnswer}"</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
