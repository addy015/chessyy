
// Vertical evaluation gauge showing centipawn advantage or mate distance
// Vertical evaluation gauge showing centipawn advantage or mate distance
export default function EvalBar({ evalScore = 0.0, height = null, perspective = 'w', isFlipped = false }) {
  // If isFlipped is explicitly passed as true, perspective is 'b'
  const isBlackPerspective = perspective === 'b' || isFlipped === true;

  // Clamp evaluation score between -10.0 and +10.0 for bar proportions
  const clampedEval = Math.max(-10.0, Math.min(10.0, evalScore));
  // 50% is dead equal, smoothly scaling towards 95% (white) or 5% (black)
  const whitePercent = 50 + (clampedEval / 10.0) * 45;
  const blackPercent = 100 - whitePercent;

  // Format score string (+1.5, -0.8, 0.0, or MATE)
  let scoreText = '';
  if (Math.abs(evalScore) >= 9.9) {
    scoreText = 'MATE';
  } else if (evalScore > 0) {
    scoreText = `+${evalScore.toFixed(1)}`;
  } else if (evalScore < 0) {
    scoreText = evalScore.toFixed(1);
  } else {
    scoreText = '0.0';
  }

  // Segment heights and colors based on perspective:
  // Normal ('w'): Top = Black, Bottom = White
  // Black ('b'):  Top = White, Bottom = Black
  const topHeight = isBlackPerspective ? whitePercent : blackPercent;
  const bottomHeight = isBlackPerspective ? blackPercent : whitePercent;

  const topColorClass = isBlackPerspective ? 'segment-white' : 'segment-black';
  const bottomColorClass = isBlackPerspective ? 'segment-black' : 'segment-white';

  // Position score on the winning player's territory:
  // White perspective ('w'): White is at bottom, Black is at top
  //   evalScore >= 0 (White leading/equal) -> bottom, on white segment -> dark text
  //   evalScore < 0 (Black leading)        -> top, on black segment   -> light text
  // Black perspective ('b'): Black is at bottom, White is at top
  //   evalScore <= 0 (Black leading/equal) -> bottom, on black segment -> light text
  //   evalScore > 0 (White leading)        -> top, on white segment   -> dark text
  let scorePosition = 'bottom';
  let isScoreOnWhite = true;

  if (!isBlackPerspective) {
    if (evalScore >= 0) {
      scorePosition = 'bottom';
      isScoreOnWhite = true;
    } else {
      scorePosition = 'top';
      isScoreOnWhite = false;
    }
  } else {
    if (evalScore > 0) {
      scorePosition = 'top';
      isScoreOnWhite = true;
    } else {
      scorePosition = 'bottom';
      isScoreOnWhite = false;
    }
  }

  return (
    <div
      id="eval-bar-wrapper"
      className={`eval-bar-wrapper eval-perspective-${isBlackPerspective ? 'black' : 'white'}`}
      style={height ? { height: `${height}px` } : undefined}
    >
      {/* Top segment */}
      <div
        id="eval-bar-top-segment"
        className={`eval-segment ${topColorClass}`}
        style={{ height: `${topHeight}%` }}
      />
      {/* Bottom segment */}
      <div
        id="eval-bar-bottom-segment"
        className={`eval-segment ${bottomColorClass}`}
        style={{ height: `${bottomHeight}%` }}
      />
      {/* Centipawn or mate text label */}
      <span
        id="eval-score-text"
        className={`eval-score-text text-pos-${scorePosition} ${isScoreOnWhite ? 'text-on-white' : 'text-on-black'}`}
      >
        {scoreText}
      </span>
    </div>
  );
}
