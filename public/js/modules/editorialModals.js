// What this file does:
// Controls popup dialogs (modals) and brief notification messages (toasts).
// Keeps the UI clean and handles showing/hiding popups when match events occur.
// -------------------------------------------------------------------------

/**
 * Shows or hides the "Waiting for an opponent..." full-screen overlay.
 */
export function showWaitingModal(show = true) {
    const el = document.querySelector('#waiting-message');
    if (!el) return;
    if (show) {
        el.classList.remove('hidden');
    } else {
        el.classList.add('hidden');
    }
}

/**
 * Shows or hides the Draw / Reset Game confirmation popup.
 */
export function showEndGameModal(show = true) {
    const el = document.querySelector('#end-game-modal');
    if (!el) return;
    if (show) {
        el.classList.remove('hidden');
    } else {
        el.classList.add('hidden');
    }
}

/**
 * Displays the Game Over popup with the final outcome (Checkmate, Resignation, Draw).
 */
export function showGameOverModal(reason) {
    const el = document.querySelector('#game-over-modal');
    const reasonEl = document.querySelector('#game-over-reason');
    if (!el || !reasonEl) return;

    reasonEl.textContent = reason || 'Game concluded.';
    el.classList.remove('hidden');
}

/**
 * Displays a temporary toast notification message on screen that automatically fades away.
 * duration: how long the message stays visible in milliseconds (default: 3200ms = ~3.2 seconds).
 */
export function showToast(message, duration = 3200) {
    const el = document.querySelector('#notification');
    const textEl = document.querySelector('#notification-text');
    if (!el || !textEl) return;

    textEl.textContent = message;
    el.classList.remove('hidden');

    setTimeout(() => {
        el.classList.add('hidden');
    }, duration);
}
