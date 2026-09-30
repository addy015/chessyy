import { useRef, useEffect, useState, useCallback } from 'react';
import { drawMatchCard } from '../../utils/matchExport';
import { useToast } from '../../context/ToastContext';

export default function MatchCardModal({
  isOpen,
  onClose,
  players = {},
  analysisData = null,
  moves = [],
}) {
  const canvasRef = useRef(null);
  const [isCopied, setIsCopied] = useState(false);
  const { showToast } = useToast();

  const whiteName = players.white || 'WHITE';
  const blackName = players.black || 'BLACK';
  const whiteAccuracy = analysisData?.whiteAccuracy ? analysisData.whiteAccuracy.toFixed(1) : '—';
  const blackAccuracy = analysisData?.blackAccuracy ? analysisData.blackAccuracy.toFixed(1) : '—';
  const evalGraph = analysisData?.evalGraph || [];

  // Determine winner from analysis or pgn if possible
  const winner = (() => {
    if (!analysisData?.evalGraph || evalGraph.length === 0) return null;
    const lastScore = evalGraph[evalGraph.length - 1];
    if (lastScore >= 5.0) return 'white';
    if (lastScore <= -5.0) return 'black';
    return 'draw';
  })();

  // Render match card on canvas whenever modal opens or analysis data changes
  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    drawMatchCard(canvasRef.current, {
      whiteName,
      blackName,
      whiteAccuracy,
      blackAccuracy,
      evalGraph,
      moves,
      winner,
    });
  }, [isOpen, whiteName, blackName, whiteAccuracy, blackAccuracy, evalGraph, moves, winner]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Download high-resolution PNG
  const handleDownloadImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chessyy_match_card_${whiteName}_vs_${blackName}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Match card downloaded successfully.');
    }, 'image/png');
  }, [whiteName, blackName, showToast]);

  // Copy Image to Clipboard
  const handleCopyImage = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          if (navigator.clipboard && window.ClipboardItem) {
            await navigator.clipboard.write([
              new window.ClipboardItem({ 'image/png': blob }),
            ]);
            setIsCopied(true);
            showToast('Match Card copied to clipboard!');
            setTimeout(() => setIsCopied(false), 3000);
          } else {
            showToast('Direct image copying not supported in this browser.');
          }
        } catch (err) {
          console.error('[MatchCardModal] Clipboard write failed:', err);
          showToast('Failed to copy. Use Download Image instead.');
        }
      }, 'image/png');
    } catch (err) {
      showToast('Copying failed.');
    }
  }, [showToast]);

  // Social Share to X / Twitter
  const handleShareTwitter = () => {
    const text = encodeURIComponent(
      `Just reviewed my match on @Chessyy!\n${whiteName} (${whiteAccuracy}%) vs ${blackName} (${blackAccuracy}%)\nAudited with Stockfish 16 depth 12.\nCheck it out:`
    );
    const shareUrl = encodeURIComponent('https://chessyy.com');
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${shareUrl}`, '_blank', 'noopener,noreferrer');
  };

  // Social Share to WhatsApp
  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `Check out my chess match review on Chessyy!\n${whiteName} (${whiteAccuracy}%) vs ${blackName} (${blackAccuracy}%)\nhttps://chessyy.com`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  if (!isOpen) return null;

  return (
    <div className="editorial-modal-backdrop" onClick={onClose} style={{ zIndex: 10000 }}>
      <div
        className="editorial-modal-box"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '920px',
          width: '95%',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--paper)',
          padding: 'clamp(14px, 3vw, 24px)',
          border: '2px solid var(--ink)',
          boxShadow: '8px 8px 0px var(--ink)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <div className="modal-protocol-tag" style={{ marginBottom: '4px' }}>EXPORT PROTOCOL</div>
            <h2 className="modal-headline" style={{ margin: 0, fontSize: '1.4rem' }}>
              SHAREABLE MATCH CARD
            </h2>
          </div>
          <button
            type="button"
            className="btn-editorial"
            onClick={onClose}
            style={{ padding: '6px 14px', fontSize: '0.8rem', cursor: 'pointer' }}
          >
            ✕ CLOSE
          </button>
        </div>

        {/* Card Canvas Preview Container */}
        <div
          style={{
            background: '#09090b',
            border: '1px solid var(--line)',
            borderRadius: '4px',
            overflow: 'hidden',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              width: '100%',
              height: 'auto',
              maxHeight: '440px',
              display: 'block',
              aspectRatio: '1200 / 675',
              objectFit: 'contain',
            }}
          />
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <button
              type="button"
              className="btn-editorial"
              onClick={handleDownloadImage}
              style={{
                background: 'var(--ink)',
                color: 'var(--paper)',
                border: '1px solid var(--ink)',
                padding: '8px 16px',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              DOWNLOAD IMAGE (PNG) &darr;
            </button>

            <button
              type="button"
              className="btn-editorial"
              onClick={handleCopyImage}
              style={{
                padding: '8px 16px',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {isCopied ? '✓ COPIED!' : 'COPY IMAGE'}
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <button
              type="button"
              className="btn-editorial"
              onClick={handleShareTwitter}
              style={{
                padding: '8px 14px',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              SHARE ON X &rarr;
            </button>
            <button
              type="button"
              className="btn-editorial"
              onClick={handleShareWhatsApp}
              style={{
                padding: '8px 14px',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              WHATSAPP &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
