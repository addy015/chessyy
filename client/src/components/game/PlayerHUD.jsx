import MatchClock from './MatchClock';
import { getPieceSymbol } from '../board/Piece';

// Player status banner showing username, role color, captured pieces, and clock
export default function PlayerHUD({
  color = 'w', // 'w' or 'b'
  handle = 'ANONYMOUS',
  timeMs = 600000,
  isTurnActive = false,
  isTimed = true,
  capturedPieces = [], // Array of piece types captured from opponent: ['p', 'n', ...]
  isOpponent = false,
}) {
  const colorName = color === 'w' ? 'WHITE' : 'BLACK';
  const roleClass = color === 'w' ? 'white' : 'black';
  const positionClass = isOpponent ? 'top' : 'bottom';
  const hudId = isOpponent ? 'opponent-hud' : 'player-hud';
  const indicatorId = isOpponent ? 'opponent-color-indicator' : 'player-color-indicator';
  const nameId = isOpponent ? 'opponent-name' : 'player-name';

  const cleanHandle = (handle || 'ANONYMOUS').toUpperCase().substring(0, 10);

  return (
    <div id={hudId} className={`player-banner ${positionClass}`}>
      {/* Player name, role color badge, and captured piece glyphs */}
      <div className="player-identity">
        <span id={indicatorId} className={`player-role-indicator ${roleClass}`}></span>
        <span id={nameId} className="player-name-text">
          {cleanHandle} ({colorName})
        </span>

        {/* Captured piece icons */}
        {capturedPieces && capturedPieces.length > 0 && (
          <span
            className="captured-pieces"
            style={{ marginLeft: '8px', fontSize: '1rem', letterSpacing: '1px', opacity: 0.85 }}
          >
            {capturedPieces.map((p, idx) => (
              <span key={idx}>
                {getPieceSymbol(p, color === 'w' ? 'b' : 'w')}
              </span>
            ))}
          </span>
        )}
      </div>

      {/* Countdown timer */}
      <div className="hud-clock-container">
        <MatchClock
          timeMs={timeMs}
          isTurnActive={isTurnActive}
          isTimed={isTimed}
          isOpponent={isOpponent}
        />
      </div>
    </div>
  );
}

