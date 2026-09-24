// What this file does:
// Handles interactive features on the homepage (index):
// 1. Shows square coordinates (e.g. E4, D4) when hovering over the hero grid.
// 2. Play with Friends modal (Create room / Join room tabs).
// 3. Lets users press [Enter] or [Space] to start matchmaking (when modal is closed).
// -------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    const playCta = document.querySelector('#home-play-cta');
    const friendsCta = document.querySelector('#home-friends-cta');
    const friendModal = document.querySelector('#friend-modal');
    const closeFriendModalBtn = document.querySelector('#close-friend-modal');
    const matrix = document.querySelector('#hero-matrix');

    const tabCreateBtn = document.querySelector('#tab-create-btn');
    const tabJoinBtn = document.querySelector('#tab-join-btn');
    const tabCreateContent = document.querySelector('#tab-create-content');
    const tabJoinContent = document.querySelector('#tab-join-content');
    const generateRoomBtn = document.querySelector('#generate-room-btn');
    const joinRoomForm = document.querySelector('#join-room-form');
    const joinCodeInput = document.querySelector('#join-room-code-input');
    const joinErrorMsg = document.querySelector('#join-error-msg');

    // 1. Matrix hover tracker: updates coordinate text when hovering over cells
    if (matrix) {
        const captionCoord = document.querySelector('.matrix-caption span:last-child');
        const cells = matrix.querySelectorAll('.matrix-cell');

        cells.forEach(cell => {
            cell.addEventListener('mouseenter', () => {
                const coord = cell.dataset.coord;
                if (coord && captionCoord) {
                    captionCoord.textContent = `HOVER TARGET [${coord.toUpperCase()}]`;
                }
            });
            cell.addEventListener('mouseleave', () => {
                if (captionCoord) {
                    captionCoord.textContent = 'COORDINATES [E4, D4, E5, D5]';
                }
            });
        });
    }

    // 2. Play with Friends Modal Controls
    function openModal() {
        if (!friendModal) return;
        friendModal.classList.remove('hidden');
        if (joinErrorMsg) joinErrorMsg.classList.add('hidden');
    }

    function closeModal() {
        if (!friendModal) return;
        friendModal.classList.add('hidden');
        if (joinErrorMsg) joinErrorMsg.classList.add('hidden');
    }

    if (friendsCta) {
        friendsCta.addEventListener('click', (e) => {
            e.preventDefault();
            openModal();
        });
    }

    if (closeFriendModalBtn) {
        closeFriendModalBtn.addEventListener('click', closeModal);
    }

    if (friendModal) {
        friendModal.addEventListener('click', (e) => {
            if (e.target === friendModal) {
                closeModal();
            }
        });
    }

    // Tab Switching
    if (tabCreateBtn && tabJoinBtn) {
        tabCreateBtn.addEventListener('click', () => {
            tabCreateBtn.classList.add('active');
            tabJoinBtn.classList.remove('active');
            if (tabCreateContent) tabCreateContent.classList.remove('hidden');
            if (tabJoinContent) tabJoinContent.classList.add('hidden');
        });

        tabJoinBtn.addEventListener('click', () => {
            tabJoinBtn.classList.add('active');
            tabCreateBtn.classList.remove('active');
            if (tabJoinContent) tabJoinContent.classList.remove('hidden');
            if (tabCreateContent) tabCreateContent.classList.add('hidden');
            if (joinCodeInput) {
                setTimeout(() => joinCodeInput.focus(), 50);
            }
        });
    }

    // Helper: Generates unambiguous 6-character room code (avoids I, O, 0, 1)
    function generateRoomCode() {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
        }
        return code;
    }

    // Host Action: Generate Code and direct navigate to /play?room=CODE&role=host
    if (generateRoomBtn) {
        generateRoomBtn.addEventListener('click', () => {
            const roomCode = generateRoomCode();
            window.location.href = `/play?room=${encodeURIComponent(roomCode)}&role=host`;
        });
    }

    // Guest Action: Enter Code and direct navigate to /play?room=CODE&role=guest
    if (joinRoomForm && joinCodeInput) {
        joinRoomForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const rawVal = joinCodeInput.value.trim().toUpperCase();
            const sanitized = rawVal.replace(/[^A-Z0-9_-]/g, '');

            if (!sanitized || sanitized.length < 3) {
                if (joinErrorMsg) {
                    joinErrorMsg.textContent = 'Please enter a valid room code (at least 3 characters).';
                    joinErrorMsg.classList.remove('hidden');
                }
                joinCodeInput.focus();
                return;
            }

            window.location.href = `/play?room=${encodeURIComponent(sanitized)}&role=guest`;
        });
    }

    // 3. Keyboard shortcut: Pressing Enter or Space starts the match immediately (when modal closed)
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && friendModal && !friendModal.classList.contains('hidden')) {
            closeModal();
            return;
        }

        // Only trigger quick play if modal is closed and user is not in an input field
        const isModalOpen = friendModal && !friendModal.classList.contains('hidden');
        if (!isModalOpen && (e.key === 'Enter' || e.code === 'Space') && document.activeElement.tagName !== 'INPUT') {
            if (playCta) {
                playCta.click();
            }
        }
    });
});
