import React, { useEffect } from 'react';

export default function StepperControls({
  currentPly,
  maxPly,
  onFirst,
  onPrev,
  onNext,
  onLast,
  onFlip,
}) {
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
      <div className="stepper-buttons">
        <button
          id="btn-first"
          className="btn-step"
          title="Start of game (|<<)"
          disabled={currentPly === 0}
          onClick={onFirst}
        >
          |&lt;&lt;
        </button>
        <button
          id="btn-prev"
          className="btn-step"
          title="Previous move (<)"
          disabled={currentPly === 0}
          onClick={onPrev}
        >
          &lt;
        </button>
        <button
          id="btn-next"
          className="btn-step"
          title="Next move (>)"
          disabled={currentPly >= maxPly}
          onClick={onNext}
        >
          &gt;
        </button>
        <button
          id="btn-last"
          className="btn-step"
          title="End of game (>>|)"
          disabled={currentPly >= maxPly}
          onClick={onLast}
        >
          &gt;&gt;|
        </button>
        <button
          id="btn-flip"
          className="btn-step"
          title="Flip board perspective"
          onClick={onFlip}
        >
          FLIP
        </button>
      </div>

      <div className="stepper-hotkeys-hint">
        KEYBOARD: [ &larr; / &rarr; ] NAVIGATE
      </div>
    </div>
  );
}
