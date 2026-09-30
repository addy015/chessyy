/**
 * Downloads official .pgn file with FIDE headers and move text
 */
export function downloadMatchPgn(pgnString, players = {}, analysisData = null) {
  const white = (players.white || 'WHITE').toUpperCase().trim();
  const black = (players.black || 'BLACK').toUpperCase().trim();
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '.');

  let headerBlock = '';
  if (!pgnString.includes('[Event ')) {
    headerBlock = [
      `[Event "Chessyy Live Match"]`,
      `[Site "Chessyy (https://chessyy.com)"]`,
      `[Date "${date}"]`,
      `[White "${white}"]`,
      `[Black "${black}"]`,
      `[Result "*"]`,
      `[Annotator "Stockfish 16 (Chessyy Precision Audit)"]`,
      '',
      '',
    ].join('\n');
  }

  const fullPgn = headerBlock ? `${headerBlock}${pgnString}` : pgnString;
  const blob = new Blob([fullPgn], { type: 'application/x-chess-pgn;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chessyy_${white}_vs_${black}_${date.replace(/\./g, '')}.pgn`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Counts blunders, mistakes, inaccuracies for a given color from analysisData.moves
 */
export function countMoveQualities(moves = []) {
  const stats = {
    white: { brilliant: 0, best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
    black: { brilliant: 0, best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
  };

  moves.forEach((m) => {
    const side = m.color === 'white' ? 'white' : 'black';
    const badge = (m.badge || '').toLowerCase();
    if (badge.includes('brilliant')) stats[side].brilliant++;
    else if (badge.includes('best') || badge.includes('great')) stats[side].best++;
    else if (badge.includes('inaccuracy')) stats[side].inaccuracy++;
    else if (badge.includes('mistake')) stats[side].mistake++;
    else if (badge.includes('blunder')) stats[side].blunder++;
    else if (badge.includes('good') || badge.includes('excellent')) stats[side].good++;
  });

  return stats;
}

/**
 * Draws a 1200x675 Match Summary Card onto an HTML5 Canvas
 */
export function drawMatchCard(canvas, {
  whiteName = 'WHITE',
  blackName = 'BLACK',
  whiteAccuracy = '—',
  blackAccuracy = '—',
  evalGraph = [],
  moves = [],
  winner = null, // 'white' | 'black' | 'draw' | null
}) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = 1200;
  const H = 675;

  canvas.width = W;
  canvas.height = H;

  // Deep Obsidian Background
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, W, H);

  // Subtle luxury grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
  ctx.lineWidth = 1;
  for (let x = 40; x < W; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 40; y < H; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Double Framing Border
  ctx.strokeStyle = '#27272a';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  ctx.strokeStyle = '#3f3f46';
  ctx.lineWidth = 1;
  ctx.strokeRect(28, 28, W - 56, H - 56);

  // Corner Accents
  ctx.fillStyle = '#ffffff';
  const cornerSize = 8;
  ctx.fillRect(24, 24, cornerSize, cornerSize);
  ctx.fillRect(W - 24 - cornerSize, 24, cornerSize, cornerSize);
  ctx.fillRect(24, H - 24 - cornerSize, cornerSize, cornerSize);
  ctx.fillRect(W - 24 - cornerSize, H - 24 - cornerSize, cornerSize);

  // Masthead / Brand Header
  ctx.font = '900 28px "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.letterSpacing = '1px';
  ctx.fillText('CHESSYY', 54, 76);

  ctx.font = '700 13px "JetBrains Mono", monospace';
  ctx.fillStyle = '#a1a1aa';
  ctx.fillText('MATCH AUDIT & ENGINE EVALUATION', 204, 73);

  // Top-Right Badges: Date & Engine
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const badgeText = `${dateStr.toUpperCase()} • STOCKFISH 16 (DEPTH 12)`;
  ctx.font = '700 11px "JetBrains Mono", monospace';
  const badgeWidth = ctx.measureText(badgeText).width + 24;
  const badgeX = W - 54 - badgeWidth;

  ctx.fillStyle = '#18181b';
  ctx.strokeStyle = '#27272a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(badgeX, 56, badgeWidth, 26, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#e4e4e7';
  ctx.fillText(badgeText, badgeX + 12, 73);

  // Divider Line
  ctx.strokeStyle = '#27272a';
  ctx.beginPath();
  ctx.moveTo(54, 102);
  ctx.lineTo(W - 54, 102);
  ctx.stroke();

  // Matchup Cards (White & Black)
  const stats = countMoveQualities(moves);
  const totalMoves = Math.ceil(moves.length / 2);

  // Left Side: White Player Card
  const leftX = 54;
  const cardY = 126;
  const cardW = 440;
  const cardH = 205;

  ctx.fillStyle = '#121215';
  ctx.strokeStyle = '#27272a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(leftX, cardY, cardW, cardH, 6);
  ctx.fill();
  ctx.stroke();

  // White icon dot
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(leftX + 28, cardY + 36, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e4e4e7';
  ctx.stroke();

  // White Name
  ctx.font = '800 22px "Space Grotesk", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(whiteName.toUpperCase(), leftX + 50, cardY + 43);

  ctx.font = '700 11px "JetBrains Mono", monospace';
  ctx.fillStyle = '#71717a';
  ctx.fillText('WHITE PIECES', leftX + 50, cardY + 60);

  // White Accuracy Big Number
  const wAccStr = whiteAccuracy !== '—' ? `${whiteAccuracy}%` : '—%';
  ctx.font = '900 52px "Space Grotesk", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(wAccStr, leftX + 28, cardY + 125);

  ctx.font = '700 11px "JetBrains Mono", monospace';
  ctx.fillStyle = '#a1a1aa';
  ctx.fillText('ACCURACY SCORE', leftX + 30, cardY + 144);

  // White Move Quality Pills
  ctx.font = '700 11px "JetBrains Mono", monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(`${stats.white.best + stats.white.brilliant} Best`, leftX + 30, cardY + 180);
  ctx.fillStyle = '#71717a';
  ctx.fillText('•', leftX + 90, cardY + 180);
  ctx.fillStyle = '#fbbf24';
  ctx.fillText(`${stats.white.inaccuracy} Inacc`, leftX + 104, cardY + 180);
  ctx.fillStyle = '#71717a';
  ctx.fillText('•', leftX + 172, cardY + 180);
  ctx.fillStyle = '#f87171';
  ctx.fillText(`${stats.white.blunder} Blunders`, leftX + 186, cardY + 180);

  // --- Center VS Column ---
  const centerX = W / 2;
  ctx.textAlign = 'center';

  ctx.font = '900 24px "Space Grotesk", sans-serif';
  ctx.fillStyle = '#71717a';
  ctx.fillText('VS', centerX, cardY + 80);

  // Total Moves & Length
  ctx.font = '800 13px "JetBrains Mono", monospace';
  ctx.fillStyle = '#e4e4e7';
  ctx.fillText(`${moves.length} PLIES (${totalMoves} MOVES)`, centerX, cardY + 115);

  // Result Badge
  let resText = 'MATCH DRAW';
  let resBg = '#27272a';
  let resFg = '#ffffff';
  if (winner === 'white') {
    resText = 'WHITE VICTORIOUS';
    resBg = '#ffffff';
    resFg = '#09090b';
  } else if (winner === 'black') {
    resText = 'BLACK VICTORIOUS';
    resBg = '#ffffff';
    resFg = '#09090b';
  }

  ctx.font = '900 11px "JetBrains Mono", monospace';
  const rWidth = ctx.measureText(resText).width + 24;
  ctx.fillStyle = resBg;
  ctx.beginPath();
  ctx.roundRect(centerX - rWidth / 2, cardY + 140, rWidth, 28, 4);
  ctx.fill();
  ctx.fillStyle = resFg;
  ctx.fillText(resText, centerX, cardY + 158);

  ctx.textAlign = 'left'; // Reset

  // --- Right Side: Black Player Card ---
  const rightX = W - 54 - cardW;

  ctx.fillStyle = '#121215';
  ctx.strokeStyle = '#27272a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(rightX, cardY, cardW, cardH, 6);
  ctx.fill();
  ctx.stroke();

  // Black icon dot
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(rightX + 28, cardY + 36, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#71717a';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Black Name
  ctx.font = '800 22px "Space Grotesk", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(blackName.toUpperCase(), rightX + 50, cardY + 43);

  ctx.font = '700 11px "JetBrains Mono", monospace';
  ctx.fillStyle = '#71717a';
  ctx.fillText('BLACK PIECES', rightX + 50, cardY + 60);

  // Black Accuracy Big Number
  const bAccStr = blackAccuracy !== '—' ? `${blackAccuracy}%` : '—%';
  ctx.font = '900 52px "Space Grotesk", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(bAccStr, rightX + 28, cardY + 125);

  ctx.font = '700 11px "JetBrains Mono", monospace';
  ctx.fillStyle = '#a1a1aa';
  ctx.fillText('ACCURACY SCORE', rightX + 30, cardY + 144);

  // Black Move Quality Pills
  ctx.font = '700 11px "JetBrains Mono", monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(`${stats.black.best + stats.black.brilliant} Best`, rightX + 30, cardY + 180);
  ctx.fillStyle = '#71717a';
  ctx.fillText('•', rightX + 90, cardY + 180);
  ctx.fillStyle = '#fbbf24';
  ctx.fillText(`${stats.black.inaccuracy} Inacc`, rightX + 104, cardY + 180);
  ctx.fillStyle = '#71717a';
  ctx.fillText('•', rightX + 172, cardY + 180);
  ctx.fillStyle = '#f87171';
  ctx.fillText(`${stats.black.blunder} Blunders`, rightX + 186, cardY + 180);

  // Eval Graph Sparkline Section
  const graphBoxX = 54;
  const graphBoxY = 352;
  const graphBoxW = W - 108;
  const graphBoxH = 220;

  ctx.fillStyle = '#121215';
  ctx.strokeStyle = '#27272a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(graphBoxX, graphBoxY, graphBoxW, graphBoxH, 6);
  ctx.fill();
  ctx.stroke();

  // Graph Header
  ctx.font = '800 12px "JetBrains Mono", monospace';
  ctx.fillStyle = '#a1a1aa';
  ctx.fillText('EVALUATION TRAJECTORY // STOCKFISH ADVANTAGE CURVE', graphBoxX + 24, graphBoxY + 30);

  ctx.font = '700 10px "JetBrains Mono", monospace';
  ctx.fillStyle = '#71717a';
  ctx.fillText('+ WHITE ADVANTAGE', graphBoxX + 24, graphBoxY + 54);
  ctx.fillText('- BLACK ADVANTAGE', graphBoxX + 24, graphBoxY + graphBoxH - 18);

  // Zero-Evaluation Axis
  const zeroY = graphBoxY + graphBoxH / 2 + 8;
  ctx.strokeStyle = '#27272a';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(graphBoxX + 20, zeroY);
  ctx.lineTo(graphBoxX + graphBoxW - 20, zeroY);
  ctx.stroke();
  ctx.setLineDash([]); // Reset dash

  // Render Eval Curve
  if (Array.isArray(evalGraph) && evalGraph.length > 1) {
    const startX = graphBoxX + 160;
    const endX = graphBoxX + graphBoxW - 30;
    const availableW = endX - startX;
    const maxVal = 8.0; // Clamped at +/- 8.0 pawns
    const halfH = (graphBoxH - 80) / 2;

    const points = evalGraph.map((score, i) => {
      const clamped = Math.max(-maxVal, Math.min(maxVal, typeof score === 'number' ? score : 0));
      const px = startX + (i / (evalGraph.length - 1)) * availableW;
      const py = zeroY - (clamped / maxVal) * halfH;
      return { x: px, y: py };
    });

    // Area Fill
    ctx.beginPath();
    ctx.moveTo(points[0].x, zeroY);
    for (const pt of points) {
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.lineTo(points[points.length - 1].x, zeroY);
    ctx.closePath();

    const areaGrad = ctx.createLinearGradient(0, graphBoxY + 50, 0, graphBoxY + graphBoxH - 30);
    areaGrad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
    areaGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.02)');
    areaGrad.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
    ctx.fillStyle = areaGrad;
    ctx.fill();

    // Line Stroke
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Card Footer / Watermark
  ctx.font = '700 11px "JetBrains Mono", monospace';
  ctx.fillStyle = '#71717a';
  ctx.fillText('AUDITED WITH CHESSYY // THE EDITORIAL REAL-TIME CHESS ARENA', 54, H - 42);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('HTTPS://CHESSYY.ONRENDER.COM', W - 54, H - 42);
  ctx.textAlign = 'left';
}
