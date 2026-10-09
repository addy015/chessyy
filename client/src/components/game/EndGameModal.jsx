import React from 'react';

export default function EndGameModal({ isOpen, onAccept, onDecline }) {
  if (!isOpen) return null;

  return (
    <div id="end-game-modal" className="editorial-modal-backdrop">
      <div className="editorial-modal-box">
        <div className="modal-protocol-tag">MATCH NEGOTIATION</div>
        <h3 className="modal-headline modal-headline-sm">DRAW / RESET OFFERED</h3>
        <p className="modal-body-text">
          Your opponent has proposed concluding this match by mutual agreement. Do you accept?
        </p>
        <div className="modal-actions">
          <button type="button" className="btn-editorial" onClick={onDecline}>
            DECLINE ✕
          </button>
          <button type="button" className="btn-editorial btn-editorial-solid" onClick={onAccept}>
            ACCEPT &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
