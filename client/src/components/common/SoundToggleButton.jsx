import { useSound } from '../../context/SoundContext';
import { useToast } from '../../context/ToastContext';

// Button to mute or unmute game sound effects
export default function SoundToggleButton({ className = '', id = 'sound-toggle-btn' }) {
  const { muted, toggleMute } = useSound();
  const { showToast } = useToast();

  // Toggle audio engine mute state and show confirmation toast
  const handleToggle = () => {
    const isNowMuted = toggleMute();
    showToast(isNowMuted ? 'Sound muted.' : 'Sound enabled.');
  };

  return (
    <button
      type="button"
      id={id}
      className={`btn-sound-toggle ${muted ? 'muted' : ''} ${className}`}
      title={muted ? 'Unmute Sound' : 'Mute Sound'}
      onClick={handleToggle}
    >
      <span id={`${id}-icon`}>{muted ? '🔇' : '🔊'}</span>
      <span id={`${id}-label`}>{muted ? 'MUTED' : 'SFX'}</span>
    </button>
  );
}

