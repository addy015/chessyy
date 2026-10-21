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

// Reusable decoded AudioBuffers stored in memory (RAM) for instant playback
const audioBuffers = new Map();
// Tracking ongoing fetch/decode promises to avoid duplicate network fetches
const pendingLoads = new Map();
// Fallback HTML5 audio elements if Web Audio is unsupported
const fallbackAudioElements = new Map();

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

// Fetches an mp3 via standard fetch and decodes into an AudioBuffer in RAM
async function loadAudioBuffer(key) {
    if (audioBuffers.has(key)) return audioBuffers.get(key);
    if (pendingLoads.has(key)) return pendingLoads.get(key);

    const ctx = getAudioContext();
    if (!ctx) return null;

    const promise = (async () => {
        try {
            const url = SOUND_FILES[key];
            if (!url) return null;
            const res = await fetch(url);
            if (!res.ok) return null;
            const arrayBuffer = await res.arrayBuffer();
            const decoded = await ctx.decodeAudioData(arrayBuffer);
            audioBuffers.set(key, decoded);
            return decoded;
        } catch {
            return null;
        } finally {
            pendingLoads.delete(key);
        }
    })();

    pendingLoads.set(key, promise);
    return promise;
}

// Unlock audio context and start fetching buffers on first user interaction
function initAudioOnUserInteraction() {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
    }
    // Preload all audio buffers in background via fetch (safe from IDM)
    Object.keys(SOUND_FILES).forEach((key) => {
        loadAudioBuffer(key).catch(() => {});
    });
}

// Listen for first user click/touch/keypress to unlock audio and warm up memory buffers
if (typeof window !== 'undefined') {
    const interactionEvents = ['pointerdown', 'touchstart', 'keydown'];
    const handleFirstInteraction = () => {
        initAudioOnUserInteraction();
        interactionEvents.forEach((evt) => {
            window.removeEventListener(evt, handleFirstInteraction);
        });
    };
    interactionEvents.forEach((evt) => {
        window.addEventListener(evt, handleFirstInteraction, { passive: true, once: true });
    });
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

// Plays a sound from the decoded RAM buffer
function playSoundFile(key, fallbackFn) {
    if (isAudioMuted) return;

    const ctx = getAudioContext();
    if (!ctx) {
        playWithHtml5Audio(key, fallbackFn);
        return;
    }

    // Fast-path: audio is already decoded in RAM buffer -> play with 0ms latency
    const buffer = audioBuffers.get(key);
    if (buffer) {
        try {
            const source = ctx.createBufferSource();
            const gainNode = ctx.createGain();
            gainNode.gain.setValueAtTime(0.85, ctx.currentTime);
            source.buffer = buffer;
            source.connect(gainNode);
            gainNode.connect(ctx.destination);
            source.start(0);
            return;
        } catch {
            playFallback(fallbackFn);
            return;
        }
    }

    // Buffer not decoded yet: load asynchronously and play immediately upon decode
    loadAudioBuffer(key)
        .then((loadedBuffer) => {
            if (!loadedBuffer || isAudioMuted) {
                if (!loadedBuffer) playFallback(fallbackFn);
                return;
            }
            try {
                const source = ctx.createBufferSource();
                const gainNode = ctx.createGain();
                gainNode.gain.setValueAtTime(0.85, ctx.currentTime);
                source.buffer = loadedBuffer;
                source.connect(gainNode);
                gainNode.connect(ctx.destination);
                source.start(0);
            } catch {
                playFallback(fallbackFn);
            }
        })
        .catch(() => {
            playFallback(fallbackFn);
        });
}

// HTML5 Audio fallback only if Web Audio API is completely unavailable
function playWithHtml5Audio(key, fallbackFn) {
    if (typeof window === 'undefined' || !window.Audio) {
        playFallback(fallbackFn);
        return;
    }
    try {
        let audio = fallbackAudioElements.get(key);
        if (!audio) {
            audio = new Audio(SOUND_FILES[key]);
            audio.volume = 0.85;
            fallbackAudioElements.set(key, audio);
        }
        audio.currentTime = 0;
        const p = audio.play();
        if (p !== undefined) {
            p.catch((err) => {
                if (err && (err.name === 'AbortError' || err.code === 20)) return;
                playFallback(fallbackFn);
            });
        }
    } catch {
        playFallback(fallbackFn);
    }
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

