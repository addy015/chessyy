import React, { createContext, useContext, useState } from 'react';
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
  const [muted, setMuted] = useState(checkIsMuted);

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

export function useSound() {
  const context = useContext(SoundContext);
  if (!context) {
    throw new Error('useSound must be used within a SoundProvider');
  }
  return context;
}
