// What this file does:
// Handles small interactive features on the homepage (index):
// 1. Shows square coordinates (e.g. E4, D4) when hovering over the hero grid.
// 2. Lets users press [Enter] or [Space] on their keyboard to instantly start playing.
// -------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    const playCta = document.querySelector('#home-play-cta');
    const matrix = document.querySelector('#hero-matrix');

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

    // 2. Keyboard shortcut: Pressing Enter or Space starts the match immediately
    window.addEventListener('keydown', (e) => {
        // Only trigger if user is not currently typing in a text input box
        if ((e.key === 'Enter' || e.code === 'Space') && document.activeElement.tagName !== 'INPUT') {
            if (playCta) {
                playCta.click();
            }
        }
    });
});
