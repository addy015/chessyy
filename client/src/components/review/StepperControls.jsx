import { useEffect } from 'react';

// Navigation bar with buttons and keyboard arrow hotkeys to step through moves
export default function StepperControls({
  currentPly,
  maxPly,
  onFirst,
  onPrev,
  onNext,
  onLast,
}) {
  // Bind left and right arrow keys for quick move stepping
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        if (currentPly > 0) onPrev();
      } else if (e.key === 'ArrowRight') {
        if (currentPly < maxPly) onNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPly, maxPly, onPrev, onNext]);

  return (
    <div className="review-stepper-bar">
      {/* Stepper action buttons */}
      <div className="stepper-buttons">
        {/* Jump to start */}
        <button
          id="btn-first"
          className="btn-step"
          title="Start of game (|<<)"
          disabled={currentPly === 0}
          onClick={onFirst}
        >
          |&lt;&lt;
        </button>

        {/* Previous move */}
        <button
          id="btn-prev"
          className="btn-step"
          title="Previous move (<)"
          disabled={currentPly === 0}
          onClick={onPrev}
        >
          &lt;
        </button>

        {/* Next move */}
        <button
          id="btn-next"
          className="btn-step"
          title="Next move (>)"
          disabled={currentPly >= maxPly}
          onClick={onNext}
        >
          &gt;
        </button>

        {/* Jump to end */}
        <button
          id="btn-last"
          className="btn-step"
          title="End of game (>>|)"
          disabled={currentPly >= maxPly}
          onClick={onLast}
        >
          &gt;&gt;|
        </button>
      </div>

      {/* Keyboard hotkey hint */}
      <div className="stepper-hotkeys-hint">
        KEYBOARD: [ &larr; / &rarr; ] NAVIGATE
      </div>
    </div>
  );
}
