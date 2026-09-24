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

let countdownTimerId = null;

/**
 * Clears the active private room countdown timer if running.
 */
export function clearPrivateRoomTimer() {
    if (countdownTimerId) {
        clearInterval(countdownTimerId);
        countdownTimerId = null;
    }
}

/**
 * Shows or hides the private room waiting modal with live 10-minute countdown ticker.
 */
export function showPrivateWaitingModal(show = true, data = {}) {
    const el = document.querySelector('#private-waiting-modal');
    if (!el) return;

    clearPrivateRoomTimer();

    if (show) {
        el.classList.remove('hidden');

        const codeDisplay = document.querySelector('#private-room-code');
        const timerDisplay = document.querySelector('#private-room-timer');
        const statusDisplay = document.querySelector('#private-waiting-status');
        const actionRow = document.querySelector('#private-waiting-actions');

        if (codeDisplay && data.roomCode) {
            codeDisplay.textContent = data.roomCode;
        }

        if (statusDisplay) {
            statusDisplay.innerHTML = '[ROOM CREATED // WAITING FOR FRIEND TO JOIN...]';
            statusDisplay.classList.remove('expired');
        }

        if (actionRow) {
            actionRow.classList.remove('hidden');
        }

        if (timerDisplay && data.expiresAt) {
            const updateTimer = () => {
                const remainingMs = Math.max(0, data.expiresAt - Date.now());
                const totalSeconds = Math.floor(remainingMs / 1000);
                const minutes = Math.floor(totalSeconds / 60);
                const seconds = totalSeconds % 60;
                const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                timerDisplay.textContent = formatted;

                if (remainingMs <= 0) {
                    clearPrivateRoomTimer();
                    if (statusDisplay) {
                        statusDisplay.innerHTML = '<span style="color: var(--vermilion, #ff3b30);">[CODE EXPIRED // ROOM TERMINATED]</span>';
                        statusDisplay.classList.add('expired');
                    }
                    if (actionRow) {
                        actionRow.classList.add('hidden');
                    }
                    const expiredActionRow = document.querySelector('#private-expired-actions');
                    if (expiredActionRow) {
                        expiredActionRow.classList.remove('hidden');
                    }
                }
            };

            updateTimer();
            countdownTimerId = setInterval(updateTimer, 1000);
        }
    } else {
        el.classList.add('hidden');
    }
}

/**
 * Displays error dialog when private room is invalid, expired, or full.
 */
export function showRoomErrorModal(message) {
    const el = document.querySelector('#room-error-modal');
    const msgEl = document.querySelector('#room-error-message');
    if (!el) return;

    if (msgEl) {
        msgEl.textContent = message || 'Room connection failed.';
    }
    el.classList.remove('hidden');
}
