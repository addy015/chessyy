import { Link } from 'react-router-dom';
import SoundToggleButton from '../common/SoundToggleButton';

export default function AccuracyHeader({
  whiteHandle = 'WHITE',
  blackHandle = 'BLACK',
  whiteAccuracy = '—',
  blackAccuracy = '—',
  onExportCard,
  onDownloadPgn,
}) {
  return (
    <header className="review-header-card">
      <div>
        <div className="review-headline">03 / POST-MATCH EVALUATION &amp; ENGINE AUDIT</div>
        <div className="review-sub" id="match-meta-line">
          {whiteHandle.toUpperCase()} VS {blackHandle.toUpperCase()} &bull; STOCKFISH UCI DEPTH 12
        </div>
      </div>

      <div className="accuracy-tally-group">
        {/* White accuracy pill */}
        <div className="accuracy-pill">
          <span className="accuracy-color-dot white"></span>
          <div>
            <div className="accuracy-label">{whiteHandle.toUpperCase()} ACCURACY</div>
            <div className="accuracy-val">{whiteAccuracy !== '—' ? `${whiteAccuracy}%` : '—%'}</div>
          </div>
        </div>

        {/* Black accuracy pill */}
        <div className="accuracy-pill">
          <span className="accuracy-color-dot black"></span>
          <div>
            <div className="accuracy-label">{blackHandle.toUpperCase()} ACCURACY</div>
            <div className="accuracy-val">{blackAccuracy !== '—' ? `${blackAccuracy}%` : '—%'}</div>
          </div>
        </div>

        {/* Sound toggle button */}
        <SoundToggleButton />

        {/* Export Match Card Button */}
        <button
          type="button"
          id="export-card-btn"
          className="btn-step"
          onClick={onExportCard}
          style={{
            background: 'var(--paper)',
            border: '1px solid var(--ink)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 700,
          }}
          title="Generate shareable match summary card"
        >
          <span>CARD</span> &rarr;
        </button>

        {/* Download PGN Button */}
        <button
          type="button"
          id="download-pgn-btn"
          className="btn-step"
          onClick={onDownloadPgn}
          style={{
            background: 'var(--paper)',
            border: '1px solid var(--ink)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 700,
          }}
          title="Download official match PGN file"
        >
          <span>PGN</span> &darr;
        </button>

        {/* Play again link */}
        <Link to="/play" className="btn-step" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          PLAY AGAIN &rarr;
        </Link>
      </div>
    </header>
  );
}
