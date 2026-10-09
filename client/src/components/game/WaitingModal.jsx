import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';

export default function WaitingModal({
  isOpen,
  isPrivate = false,
  roomCode = '',
  expiresAt = 0,
  timeControl = '10 MIN RAPID',
}) {
  const { showToast } = useToast();
  const [timeLeft, setTimeLeft] = useState('10:00');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!isOpen || !isPrivate || !expiresAt) return;

    const interval = setInterval(() => {
      const remainingMs = Math.max(0, expiresAt - Date.now());
      const totalSeconds = Math.floor(remainingMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      setTimeLeft(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);

      if (remainingMs <= 0) {
        setIsExpired(true);
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, isPrivate, expiresAt]);

  if (!isOpen) return null;

  const handleCopyCode = () => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode).then(() => {
      showToast(`Room code copied: ${roomCode}`);
    }).catch(() => {
      showToast(`Room code: ${roomCode}`);
    });
  };

  const handleCopyLink = () => {
    const inviteUrl = `${window.location.origin}/?join=${roomCode}`;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      showToast('Invite link copied to clipboard!');
    }).catch(() => {
      showToast(`Link: ${inviteUrl}`);
    });
  };

  if (!isPrivate) {
    return (
      <div id="waiting-message" className="editorial-modal-backdrop">
        <div className="editorial-modal-box modal-center">
          <div className="modal-protocol-tag">01 / MATCHMAKING</div>
          <h2 className="modal-headline">WAITING FOR ANOTHER PLAYER TO JOIN...</h2>
          <p className="modal-body-text">
            You are connected to the server. Game will initiate automatically as soon as an opponent connects.
          </p>
          <div className="modal-searching-tag" id="waiting-status-tag">
            [SEARCHING / WAITING FOR OPPONENT...]
          </div>
          <div className="modal-searching-tag" style={{ marginTop: '8px', color: 'var(--ink)', fontWeight: 700 }}>
            MATCH PACE: {timeControl}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="private-waiting-modal" className="editorial-modal-backdrop">
      <div className="editorial-modal-box modal-center">
        <div className="modal-protocol-tag">02 / PRIVATE MATCH</div>
        <h2 className="modal-headline modal-headline-sm">AWAITING FRIEND TO JOIN</h2>
        <p className="modal-body-text">
          Share this room code or invite link with your friend. You play as <strong>White</strong>; your friend will join as <strong>Black</strong>.
        </p>

        <div className="private-room-code-badge">
          <span className="code-label">ROOM CODE:</span>
          <span id="private-room-code" className="code-value">{roomCode || '------'}</span>
        </div>

        <div className="private-room-timer-badge">
          <span>CODE EXPIRES IN:</span>
          <span id="private-room-timer" className="timer-countdown">{timeLeft}</span>
        </div>

        <div className="modal-searching-tag" style={{ marginTop: '6px', color: 'var(--ink)', fontWeight: 700 }}>
          MATCH PACE: {timeControl}
        </div>
        <div className="modal-searching-tag">
          {isExpired
            ? <span style={{ color: 'var(--vermilion, #ff3b30)' }}>[CODE EXPIRED // ROOM TERMINATED]</span>
            : '[ROOM CREATED / WAITING FOR FRIEND TO JOIN...]'}
        </div>

        {!isExpired ? (
          <div className="modal-actions modal-actions-center" style={{ marginTop: '20px', gap: '10px', display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button type="button" className="btn-editorial" onClick={handleCopyCode}>
              COPY CODE 📋
            </button>
            <button type="button" className="btn-editorial btn-editorial-solid" onClick={handleCopyLink}>
              COPY INVITE LINK 🔗
            </button>
            <Link to="/" className="btn-editorial btn-editorial-danger" style={{ textDecoration: 'none' }}>
              ABORT &rarr;
            </Link>
          </div>
        ) : (
          <div className="modal-actions modal-actions-center" style={{ marginTop: '20px', gap: '12px', display: 'flex', justifyContent: 'center' }}>
            <Link to="/" className="btn-editorial btn-editorial-solid" style={{ textDecoration: 'none' }}>
              CREATE NEW ROOM &rarr;
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
