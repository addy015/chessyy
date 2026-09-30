/**
 * Downloads official .pgn file with verified FIDE headers and move text
 */
export function downloadMatchPgn(pgnString = '', players = {}, analysisData = null) {
  const white = (players?.white || 'WHITE').toUpperCase().trim();
  const black = (players?.black || 'BLACK').toUpperCase().trim();
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '.');

  // Strip all existing bracketed tags [Tag "Value"] and comments { ... }
  const cleanMoves = (pgnString || '')
    .replace(/\[.*?\]\s*/g, '')
    .replace(/\{.*?\}/g, '')
    .trim();

  let result = '*';
  if (analysisData?.winner === 'white') result = '1-0';
  else if (analysisData?.winner === 'black') result = '0-1';
  else if (analysisData?.winner === 'draw') result = '1/2-1/2';
  else if (cleanMoves.endsWith('1-0')) result = '1-0';
  else if (cleanMoves.endsWith('0-1')) result = '0-1';
  else if (cleanMoves.endsWith('1/2-1/2')) result = '1/2-1/2';

  // Ensure moves text has clean result marker
  let moveBody = cleanMoves;
  if (!moveBody) {
    moveBody = result;
  } else if (!/(1-0|0-1|1\/2-1\/2|\*)$/.test(moveBody)) {
    moveBody = `${moveBody} ${result}`;
  }

  const fullPgn = [
    `[Event "Chessyy Live Match"]`,
    `[Site "Chessyy (https://chessyy.onrender.com)"]`,
    `[Date "${date}"]`,
    `[Round "1"]`,
    `[White "${white}"]`,
    `[Black "${black}"]`,
    `[Result "${result}"]`,
    `[Annotator "Stockfish 16 (Chessyy Precision Audit)"]`,
    '',
    moveBody,
    ''
  ].join('\n');

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
