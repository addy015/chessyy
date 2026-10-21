import { Chess } from 'chess.js';
import { PUZZLES, getRandomPuzzle } from '../data/puzzlesData';

/**
 * Maps chess piece codes to human-readable names.
 */
const PIECE_NAMES = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

const THEME_HINTS = {
  hangingpiece: 'Target the unprotected enemy piece that has no defenders.',
  fork: 'Look for a double attack targeting two pieces at once.',
  pin: 'Exploit the pinned piece that cannot move away without serious consequences.',
  skewer: 'Force the more valuable piece to step aside, exposing the piece behind it.',
  backrankmate: "Exploit the weak enemy back rank where the King is trapped by its own pawns.",
  smotheredmate: 'Deliver a smothered mate by trapping the enemy King behind its own army.',
  deflection: 'Deflect a key defender away from protecting its vital square.',
  discoveredattack: 'Move a front piece to unleash a devastating hidden attack from behind.',
  doublecheck: 'Deliver check with two pieces simultaneously—forcing the King to step away.',
  attraction: 'Lure an enemy piece onto an unfavorable tactical square.',
  sacrifice: 'A dynamic tactical sacrifice opens up the decisive advantage.',
  trappedpiece: 'The enemy piece is boxed in with no escape routes.',
  interference: 'Block the communication line between enemy defenders.',
  intermezzo: 'Play an unexpected in-between move before the expected recapture.',
  matein1: 'Find the immediate, unstoppable checkmate.',
  matein2: 'Calculate a forced 2-move sequence delivering checkmate.',
  matein3: 'Calculate a forcing 3-move combination ending in checkmate.',
  clearance: 'Clear a critical square or diagonal for your attacking pieces.',
  quietmove: 'Find a quiet, lethal move that sets up an unstoppable threat.',
  zugzwang: 'Force the opponent into zugzwang where any move loses.',
  kingsideattack: "Launch a direct tactical assault against the enemy King's castle.",
  queensideattack: 'Break through the enemy flank with precision.',
  promotion: 'Push and support the passed pawn toward decisive queen promotion.',
};

/**
 * Generates a context-aware hint based on tactical themes,
 * the first move piece type, and tactical actions (check/capture/mate).
 */
function generateSmartHint({ themes = [], sanSolution = [], turn = 'w', pieceName = 'piece' }) {
  const firstMove = sanSolution[0] || '';
  const isCheck = firstMove.includes('+');
  const isMate = firstMove.includes('#');
  const isCapture = firstMove.includes('x');

  if (isMate) {
    return `Deliver an immediate checkmate using your ${pieceName}.`;
  }

  // Check matching theme from Lichess themes
  for (const t of themes) {
    const key = String(t).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (THEME_HINTS[key]) {
      return `${THEME_HINTS[key]} Look closely at what your ${pieceName} can do.`;
    }
  }

  // Chess.com or fallback with move mechanics
  if (isCapture && isCheck) {
    return `Look for an aggressive ${pieceName} capture delivering check to disrupt their defense.`;
  }
  if (isCheck) {
    return `Start with a forcing ${pieceName} check to strip away the King's safety.`;
  }
  if (isCapture) {
    return `Spot the tactical capture using your ${pieceName} to win decisive material.`;
  }

  return `Find the most active tactical move with your ${pieceName} to seize control.`;
}

/**
 * Parses and normalizes a Lichess puzzle response into the app's puzzle structure.
 * Supports both /api/puzzle/daily (with direct puzzle.fen) and /api/puzzle/next (with game.pgn & initialPly).
 */
function parseLichessPuzzle(data) {
  if (!data || !data.puzzle || !Array.isArray(data.puzzle.solution)) {
    return null;
  }

  const p = data.puzzle;
  let game = null;
  let lastMove = null;

  if (p.fen) {
    // Lichess Daily format: direct FEN provided
    try {
      game = new Chess(p.fen);
      if (p.lastMove && p.lastMove.length >= 4) {
        lastMove = { from: p.lastMove.slice(0, 2), to: p.lastMove.slice(2, 4) };
      }
    } catch {
      return null;
    }
  } else if (data.game && data.game.pgn && typeof p.initialPly === 'number') {
    // Lichess Next random puzzle format: replay full PGN history up to the blunder ply
    try {
      const fullGame = new Chess();
      fullGame.loadPgn(data.game.pgn);
      const history = fullGame.history({ verbose: true });
      if (history.length <= p.initialPly) return null;

      game = new Chess();
      for (let i = 0; i <= p.initialPly; i++) {
        game.move(history[i]);
      }
      const blunder = history[p.initialPly];
      if (blunder) {
        lastMove = { from: blunder.from, to: blunder.to };
      }
    } catch {
      return null;
    }
  } else {
    return null;
  }

  // CRITICAL: Capture the exact starting puzzle position and active turn BEFORE replaying solution moves!
  const startFen = game.fen();
  const startFenParts = startFen.trim().split(/\s+/);
  const turn = startFenParts[1] === 'b' ? 'b' : 'w';

  // Use a simulator instance to decode UCI solution to SAN without mutating the puzzle starting FEN
  const simulator = new Chess(startFen);
  const sanSolution = [];
  let firstPieceName = 'piece';

  for (let i = 0; i < p.solution.length; i++) {
    const uci = p.solution[i];
    if (!uci || uci.length < 4) return null;
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.slice(4) || 'q';

    try {
      const move = simulator.move({ from, to, promotion });
      if (!move) return null;
      sanSolution.push(move.san);
      if (i === 0 && move.piece && PIECE_NAMES[move.piece]) {
        firstPieceName = PIECE_NAMES[move.piece];
      }
    } catch {
      return null;
    }
  }

  if (sanSolution.length === 0) return null;

  const players = data.game?.players || [];
  const whiteName = players.find(x => x.color === 'white')?.name;
  const blackName = players.find(x => x.color === 'black')?.name;
  const sourceStr = whiteName && blackName ? `${whiteName} vs ${blackName}` : 'Lichess Master Archive';

  // Sort and prioritize high-value tactical themes over generic ones
  const TACTICAL_KEYS = [
    'matein1', 'matein2', 'matein3', 'smotheredmate', 'backrankmate',
    'fork', 'pin', 'skewer', 'deflection', 'discoveredattack', 'doublecheck',
    'hangingpiece', 'sacrifice', 'attraction', 'clearance', 'interference',
    'intermezzo', 'zugzwang', 'trappedpiece', 'kingsideattack', 'queensideattack'
  ];

  const rawThemes = p.themes || [];
  const sortedThemes = [...rawThemes].sort((a, b) => {
    const aKey = String(a).toLowerCase().replace(/[^a-z0-9]/g, '');
    const bKey = String(b).toLowerCase().replace(/[^a-z0-9]/g, '');
    const aTactical = TACTICAL_KEYS.includes(aKey);
    const bTactical = TACTICAL_KEYS.includes(bKey);
    if (aTactical && !bTactical) return -1;
    if (!aTactical && bTactical) return 1;
    return 0;
  });

  const themeStr = sortedThemes
    .slice(0, 2)
    .map(t => {
      const spaced = String(t).replace(/([A-Z])/g, ' $1').trim();
      return spaced.charAt(0).toUpperCase() + spaced.slice(1);
    })
    .join(' • ') || 'Tactical Study';

  const hint = generateSmartHint({
    themes: rawThemes,
    sanSolution,
    turn,
    pieceName: firstPieceName,
  });

  return {
    id: `lichess_${p.id}`,
    title: p.id ? `Lichess #${p.id}` : 'Tactical Challenge',
    source: sourceStr,
    theme: themeStr,
    fen: startFen,
    turn: turn,
    rating: p.rating || 1500,
    solution: sanSolution,
    hint: hint,
    lastMove: lastMove,
    isDaily: !!p.fen,
  };
}

/**
 * Parses and normalizes a Chess.com random puzzle response into the app's puzzle structure.
 */
function parseChessComPuzzle(data) {
  if (!data || !data.fen || !data.pgn) {
    return null;
  }

  const fen = data.fen.trim();
  const simulator = new Chess(fen);
  const pgn = data.pgn || '';

  // Strip PGN header tags [Tag "Value"] and comments {comment}
  const clean = pgn.replace(/\[[\s\S]*?\]/g, '').replace(/\{[\s\S]*?\}/g, '');
  // Remove move numbers like '1.', '1...', '24.' while strictly preserving rank numbers on pieces
  const sanText = clean.replace(/(^|\s)\d+\s*\.{1,3}\s*/g, ' ').trim();
  const tokens = sanText.split(/\s+/).filter(t => t && !/^(1-0|0-1|1\/2-1\/2|\*|\.+)$/.test(t));

  const sanSolution = [];
  let firstPieceName = 'piece';

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    try {
      const m = simulator.move(token, { sloppy: true });
      if (m) {
        sanSolution.push(m.san);
        if (i === 0 && m.piece && PIECE_NAMES[m.piece]) {
          firstPieceName = PIECE_NAMES[m.piece];
        }
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  if (sanSolution.length === 0) return null;

  const fenParts = fen.split(/\s+/);
  const turn = fenParts[1] === 'b' ? 'b' : 'w';

  // Dynamic tactical theme detection based on solution
  let dynamicTheme = 'Tactical Combination';
  const hasMate = sanSolution.some(m => m.includes('#'));
  const hasCheck = sanSolution.some(m => m.includes('+'));
  const hasCapture = sanSolution.some(m => m.includes('x'));
  const hasSacrifice = sanSolution.length >= 3 && hasCapture;

  if (hasMate) {
    dynamicTheme = sanSolution.length <= 2 ? 'Forced Checkmate' : 'Mating Attack Net';
  } else if (hasSacrifice) {
    dynamicTheme = 'Sacrifice & Breakthrough';
  } else if (hasCheck && hasCapture) {
    dynamicTheme = 'Forcing Double Attack';
  } else if (hasCapture) {
    dynamicTheme = 'Material Decapitation';
  }

  // Dynamic realistic rating estimate based on solution depth and complexity
  const estimatedRating = Math.min(2200, Math.max(1200, 1300 + sanSolution.length * 90 + (hasSacrifice ? 120 : 0)));

  const sourceTitle = data.title ? `${data.title} (Chess.com)` : 'Chess.com Archive';

  const hint = generateSmartHint({
    themes: [],
    sanSolution,
    turn,
    pieceName: firstPieceName,
  });

  return {
    id: `chesscom_${data.publish_time || Math.floor(Math.random() * 100000)}`,
    title: data.title || 'Chess.com Tactic',
    source: sourceTitle,
    theme: dynamicTheme,
    fen: fen,
    turn: turn,
    rating: estimatedRating,
    solution: sanSolution,
    hint: hint,
    lastMove: null,
    isDaily: false,
  };
}

/**
 * Fetches a dynamic puzzle from public chess APIs.
 * Prioritizes live Lichess next random puzzles (3M+ database, unique Elo, players & themes),
 * with fallback to Lichess Daily, Chess.com Random, and local offline vault.
 */
export async function fetchDynamicPuzzle(excludeId = null) {
  const timeoutMs = 3500;

  const endpoints = [
    { url: 'https://lichess.org/api/puzzle/next', parser: parseLichessPuzzle },
    { url: 'https://lichess.org/api/puzzle/daily', parser: parseLichessPuzzle },
    { url: 'https://api.chess.com/pub/puzzle/random', parser: parseChessComPuzzle },
  ];

  for (const target of endpoints) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(target.url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const json = await response.json();
        const parsed = target.parser(json);
        if (parsed && (!excludeId || parsed.id !== excludeId)) {
          return parsed;
        }
      }
    } catch {
      clearTimeout(timeoutId);
      // Try next endpoint or fall through to offline pool
    }
  }

  // Graceful offline fallback: select random puzzle from local curated collection
  return getRandomPuzzle(excludeId);
}
