// What this file does:
// High-fidelity Chess.com acoustic sound engine with zero-latency Web Audio API.
// Features:
// 1. Preloads and decodes authentic Chess.com SFXs (move, capture, check, castle, promote, low-time, game-over).
// 2. Uses in-memory decoded AudioBuffers for sub-millisecond playback.
// 3. Includes procedural synthesis fallback so sound NEVER fails even if offline.
// 4. Supports user mute toggle with persistent localStorage memory.
// -------------------------------------------------------------------------

let audioCtx = null;
let isAudioMuted = false;

// Initialize mute state from localStorage
try {
    isAudioMuted = localStorage.getItem('chessyy_audio_muted') === 'true';
} catch (e) {
    isAudioMuted = false;
}

// Sound file registry mapping to local Chess.com SFX assets
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

// In-memory cache of decoded AudioBuffers (PCM)
const audioBufferCache = new Map();

/**
 * Returns or initializes the AudioContext singleton and handles browser autoplay unlocking.
 */
function getAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
    return audioCtx;
}

/**
 * Preloads and decodes all sound effects into RAM for 0ms playback latency.
 */
async function preloadSounds() {
    const ctx = getAudioContext();
    if (!ctx) return;

    for (const [key, path] of Object.entries(SOUND_FILES)) {
        if (audioBufferCache.has(key)) continue;
        try {
            const resp = await fetch(path);
            if (!resp.ok) continue;
            const arrayBuf = await resp.arrayBuffer();
            const decoded = await ctx.decodeAudioData(arrayBuf);
            audioBufferCache.set(key, decoded);
        } catch (e) {
            // Buffer failed to decode, procedural fallback will be used
        }
    }
}

// Auto-unlock AudioContext and trigger sound preload on first user interaction
if (typeof window !== 'undefined') {
    const unlockAudio = () => {
        getAudioContext();
        preloadSounds();
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
    };
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    window.addEventListener('touchstart', unlockAudio, { once: true });

    // Also attempt eager background preload on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', preloadSounds);
    } else {
        preloadSounds();
    }
}

/**
 * Internal helper to play a decoded AudioBuffer with gain control.
 */
function playBuffer(key, fallbackFn) {
    if (isAudioMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const buffer = audioBufferCache.get(key);
    if (buffer) {
        try {
            const source = ctx.createBufferSource();
            const gain = ctx.createGain();
            source.buffer = buffer;
            gain.gain.value = 0.9;
            source.connect(gain);
            gain.connect(ctx.destination);
            source.start(0);
            return;
        } catch (e) {}
    }

    // Fallback to procedural synthesis if buffer is unavailable
    if (typeof fallbackFn === 'function') {
        fallbackFn(ctx);
    }
}

/**
 * Checks if sound effects are currently muted.
 */
export function isMuted() {
    return isAudioMuted;
}

/**
 * Toggles sound effects mute state and persists to localStorage.
 */
export function toggleMute() {
    isAudioMuted = !isAudioMuted;
    try {
        localStorage.setItem('chessyy_audio_muted', isAudioMuted ? 'true' : 'false');
    } catch (e) {}
    return isAudioMuted;
}

/**
 * Plays Chess.com move sound (self or opponent).
 */
export function playMoveSound(isSelf = true) {
    const key = isSelf ? 'move_self' : 'move_opponent';
    playBuffer(key, (ctx) => {
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

/**
 * Plays Chess.com capture sound.
 */
export function playCaptureSound() {
    playBuffer('capture', (ctx) => {
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

/**
 * Plays Chess.com check alert sound.
 */
export function playCheckSound() {
    playBuffer('check', (ctx) => {
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

/**
 * Plays Chess.com castling sound.
 */
export function playCastleSound() {
    playBuffer('castle', () => {
        // Fallback: two rapid move clicks
        playMoveSound(true);
        setTimeout(() => playMoveSound(true), 80);
    });
}

/**
 * Plays Chess.com pawn promotion sound.
 */
export function playPromoteSound() {
    playBuffer('promote', (ctx) => {
        const now = ctx.currentTime;
        [523.25, 659.25, 783.99].forEach((freq, i) => { // C5, E5, G5 arpeggio
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

/**
 * Plays Chess.com low-time urgency tick.
 */
export function playLowTimeTickSound() {
    playBuffer('low_time', (ctx) => {
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

/**
 * Plays Chess.com game-end chime.
 */
export function playGameOverSound() {
    playBuffer('game_end', (ctx) => {
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
