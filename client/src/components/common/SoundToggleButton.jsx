import React from 'react';
import { useSound } from '../../context/SoundContext';
import { useToast } from '../../context/ToastContext';

export default function SoundToggleButton({ className = '' }) {
  const { muted, toggleMute } = useSound();
  const { showToast } = useToast();

  const handleToggle = () => {
    const isNowMuted = toggleMute();
    showToast(isNowMuted ? 'Sound muted.' : 'Sound enabled.');
  };

  return (
    <button
      type="button"
      id="sound-toggle-btn"
      className={`btn-sound-toggle ${muted ? 'muted' : ''} ${className}`}
      title="Toggle Sound"
      onClick={handleToggle}
    >
      <span id="sound-toggle-icon">{muted ? '🔇' : '🔊'}</span>
      <span id="sound-toggle-label">{muted ? 'MUTED' : 'SFX'}</span>
    </button>
  );
}
