import { createContext, useContext, useState } from 'react';
import {
  isMuted as checkIsMuted,
  toggleMute as toggleSoundMute,
  playMoveSound,
  playCaptureSound,
  playCheckSound,
  playCastleSound,
  playPromoteSound,
  playLowTimeTickSound,
  playGameOverSound,
} from '../audio/soundEngine';

const SoundContext = createContext();

export function SoundProvider({ children }) {
  // Sync initial mute state with audio engine preference
  const [muted, setMuted] = useState(checkIsMuted);

  // Toggle mute state and update local state
  const toggle = () => {
    const next = toggleSoundMute();
    setMuted(next);
    return next;
  };

  return (
    <SoundContext.Provider
      value={{
        muted,
        toggleMute: toggle,
        playMoveSound,
        playCaptureSound,
        playCheckSound,
        playCastleSound,
        playPromoteSound,
        playLowTimeTickSound,
        playGameOverSound,
      }}
    >
      {children}
    </SoundContext.Provider>
  );
}

// Hook to play sounds and access mute controls anywhere in the app
export function useSound() {
  const context = useContext(SoundContext);
  if (!context) {
    throw new Error('useSound must be used within a SoundProvider');
  }
  return context;
}

