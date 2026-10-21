
// Displays player clock with minutes, seconds, and tenths when time is running low
export default function MatchClock({ timeMs, isTurnActive, isOpponent = false, isTimed = true }) {
  // If match has unlimited time, show infinity symbol
  if (!isTimed || timeMs === null || timeMs === undefined) {
    return (
      <div
        className="hud-clock"
        id={isOpponent ? 'opponent-clock' : 'player-clock'}
        aria-label={isOpponent ? 'Opponent Clock' : 'Your Clock'}
      >
        ∞
      </div>
    );
  }

  // Calculate minutes, seconds, and tenths of a second
  const safeMs = Math.max(0, timeMs || 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((safeMs % 1000) / 100);

  // Show tenths of a second when 20 seconds or less remain
  const isLowTime = safeMs <= 20000 && safeMs > 0;
  let formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  if (isLowTime) {
    formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
  }

  const activeClass = isTurnActive ? 'clock-active' : '';
  const lowTimeClass = isLowTime && isTurnActive ? 'clock-low-time' : '';

  return (
    <div
      className={`hud-clock ${activeClass} ${lowTimeClass}`.trim()}
      id={isOpponent ? 'opponent-clock' : 'player-clock'}
      aria-label={isOpponent ? 'Opponent Clock' : 'Your Clock'}
    >
      {formatted}
    </div>
  );
}

