// Chess sound manager:
// 1. Plays mp3 files for move, capture, check, castle, promote, low-time, and game-over.
// 2. Keeps sounds in memory so they play instantly with zero lag.
// 3. Generates synthesized sounds with Web Audio if mp3 files fail to load or user is offline.
// 4. Remembers mute settings in localStorage.

let audioCtx = null;
let isAudioMuted = false;

// Load saved mute setting from browser storage
try {
    isAudioMuted = localStorage.getItem('chessyy_audio_muted') === 'true';
} catch {
    isAudioMuted = false;
}

// List of sound files stored in the public /sounds folder
const SOUND_FILES = {
    'move_self':     '/sounds/move-self.mp3',
    'move_opponent': '/sounds/move-opponent.mp3',
    'capture':       '/sounds/capture.mp3',
    'check':         '/sounds/move-check.mp3',
    'castle':        '/sounds/castle.mp3',
    'promote':       '/sounds/promote.mp3',
    'game_end':      '/sounds/game-end.mp3',
    'low_time':      '/sounds/tenseconds.mp3'
};

// Reusable audio elements stored in memory so we don't reload files on every move
const audioElements = new Map();

// Starts or resumes the browser's audio synthesizer
function getAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            try {
                audioCtx = new AudioContextClass();
            } catch {
                audioCtx = null;
            }
        }
    }
    // Resume audio context if the browser suspended it
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
    return audioCtx;
}

// Plays a generated sound if the mp3 file fails or cannot be loaded
function playFallback(fallbackFn) {
    if (isAudioMuted || typeof fallbackFn !== 'function') return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
        fallbackFn(ctx);
    } catch {
        // Ignore audio playback errors
    }
}

// Plays an mp3 sound file, or uses the synthesizer fallback if playback fails
function playSoundFile(key, fallbackFn) {
    if (isAudioMuted) return;

    if (typeof window !== 'undefined' && window.Audio) {
        try {
            let audio = audioElements.get(key);
            if (!audio) {
                audio = new Audio(SOUND_FILES[key]);
                audio.volume = 0.85;
                audioElements.set(key, audio);
            }
            // Rewind to start in case the sound is already playing
            audio.currentTime = 0;
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch((err) => {
                    // Ignore abort errors caused by rapid playback interruptions so fallback synthesizer does not double-play
                    if (err && (err.name === 'AbortError' || err.code === 20)) return;
                    playFallback(fallbackFn);
                });
            }
            return;
        } catch {
            playFallback(fallbackFn);
            return;
        }
    }
    playFallback(fallbackFn);
}

// Check if sounds are currently muted
export function isMuted() {
    return isAudioMuted;
}

// Turn sound on/off and save the choice in browser storage
export function toggleMute() {
    isAudioMuted = !isAudioMuted;
    try {
        localStorage.setItem('chessyy_audio_muted', isAudioMuted ? 'true' : 'false');
    } catch {}
    return isAudioMuted;
}

// Play piece move sound (different sound file for self vs opponent)
export function playMoveSound(isSelf = true) {
    const key = isSelf ? 'move_self' : 'move_opponent';
    playSoundFile(key, (ctx) => {
        // Fallback: short wooden click sound
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.04);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.exponentialRampToValueAtTime(200, now + 0.04);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);
    });
}

// Play piece capture sound
export function playCaptureSound() {
    playSoundFile('capture', (ctx) => {
        // Fallback: sharp snap sound
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.06);

        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.075);
    });
}

// Play check warning sound
export function playCheckSound() {
    playSoundFile('check', (ctx) => {
        // Fallback: two-tone chime
        const now = ctx.currentTime;
        [880, 1320].forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);
            const initialGain = idx === 0 ? 0.28 : 0.16;
            gain.gain.setValueAtTime(initialGain, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.23);
        });
    });
}

// Play castling sound (plays two move sounds back-to-back)
export function playCastleSound() {
    playSoundFile('castle', () => {
        playMoveSound(true);
        setTimeout(() => playMoveSound(true), 80);
    });
}

// Play pawn promotion sound
export function playPromoteSound() {
    playSoundFile('promote', (ctx) => {
        // Fallback: three rising musical notes
        const now = ctx.currentTime;
        [523.25, 659.25, 783.99].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.05);
            gain.gain.setValueAtTime(0.2, now + i * 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.18);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + i * 0.05);
            osc.stop(now + i * 0.05 + 0.2);
        });
    });
}

// Play countdown tick when 10 seconds or less remain on the clock
export function playLowTimeTickSound() {
    playSoundFile('low_time', (ctx) => {
        // Fallback: quick high-pitch tick
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1050, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.025);
    });
}

// Play game over chime when match ends
export function playGameOverSound() {
    playSoundFile('game_end', (ctx) => {
        // Fallback: three descending tones
        const now = ctx.currentTime;
        const freqs = [440, 349.23, 261.63];
        freqs.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + i * 0.05);
            gain.gain.setValueAtTime(0.25, now + i * 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + i * 0.05);
            osc.stop(now + i * 0.05 + 0.36);
        });
    });
}

