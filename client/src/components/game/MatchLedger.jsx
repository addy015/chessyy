import React, { useEffect, useRef, useMemo } from 'react';

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const STARTING_PIECES = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const GLYPHS = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' },
};

export default function MatchLedger({ chess, history = [] }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  // Compute live material tally & balance from chess board
  const materialStats = useMemo(() => {
    if (!chess) {
      return { whiteCaptures: '—', blackCaptures: '—', balance: 'EVEN (0)' };
    }

    const currentCounts = {
      w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
      b: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    };

    chess.board().forEach((row) => {
      row.forEach((sq) => {
        if (sq && sq.type !== 'k') {
          currentCounts[sq.color][sq.type] = (currentCounts[sq.color][sq.type] || 0) + 1;
        }
      });
    });

    let whiteCapturesStr = '';
    let blackCapturesStr = '';
    let whiteScore = 0;
    let blackScore = 0;

    ['q', 'r', 'b', 'n', 'p'].forEach((type) => {
      const missingWhite = Math.max(0, STARTING_PIECES[type] - currentCounts.w[type]);
      const missingBlack = Math.max(0, STARTING_PIECES[type] - currentCounts.b[type]);

      // White captures opponent's (black) pieces
      whiteCapturesStr += GLYPHS.b[type].repeat(missingBlack);
      // Black captures opponent's (white) pieces
      blackCapturesStr += GLYPHS.w[type].repeat(missingWhite);

      whiteScore += currentCounts.w[type] * PIECE_VALUES[type];
      blackScore += currentCounts.b[type] * PIECE_VALUES[type];
    });

    const diff = whiteScore - blackScore;
    let balance = 'EVEN (0)';
    if (diff > 0) {
      balance = `WHITE +${diff}`;
    } else if (diff < 0) {
      balance = `BLACK +${Math.abs(diff)}`;
    }

    return {
      whiteCaptures: whiteCapturesStr || '—',
      blackCaptures: blackCapturesStr || '—',
      balance,
    };
  }, [chess, history]);

  // Pair moves: [ [white, black], ... ]
  const rows = [];
  for (let i = 0; i < history.length; i += 2) {
    const isLatestWhite = i === history.length - 1;
    const isLatestBlack = i + 1 === history.length - 1;
    rows.push({
      num: Math.floor(i / 2) + 1,
      white: history[i],
      black: history[i + 1] || '',
      isLatestWhite,
      isLatestBlack,
    });
  }

  return (
    <aside className="ledger-panel">
      <div className="panel-header">
        <span className="panel-title">01 / MOVE JOURNAL</span>
        <span className="panel-meta" id="match-round-tag">LIVE PGN</span>
      </div>

      <div className="ledger-scroll" id="ledger-container" ref={scrollRef}>
        {rows.length === 0 ? (
          <div className="empty-ledger-notice" id="empty-ledger-notice">
            [Awaiting opening move...]
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.num} className="ledger-row">
              <span className="ledger-num">{String(row.num).padStart(2, '0')}.</span>
              <span className={`ledger-move ${row.isLatestWhite ? 'active' : ''}`}>{row.white}</span>
              <span className={`ledger-move ${row.isLatestBlack ? 'active' : ''}`}>{row.black}</span>
            </div>
          ))
        )}
      </div>

      <div className="material-tally">
        <div className="tally-row">
          <span className="tally-label">WHITE CAPTURES:</span>
          <span className="tally-pieces" id="white-captured-pieces">{materialStats.whiteCaptures}</span>
        </div>
        <div className="tally-row">
          <span className="tally-label">BLACK CAPTURES:</span>
          <span className="tally-pieces" id="black-captured-pieces">{materialStats.blackCaptures}</span>
        </div>
        <div className="tally-row tally-balance-row">
          <span className="tally-label">MATERIAL BALANCE:</span>
          <span className="tally-balance" id="material-balance">{materialStats.balance}</span>
        </div>
      </div>
    </aside>
  );
}
