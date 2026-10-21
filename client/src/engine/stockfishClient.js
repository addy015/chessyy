// Client-side Stockfish Web Worker controller
// Runs Stockfish WebAssembly directly inside the user's browser (zero server cost)

let activeWorker = null;
let isEvaluating = false;

// Create and initialize Stockfish Web Worker
function getStockfishWorker() {
  if (activeWorker) return activeWorker;

  try {
    // Load single-threaded WASM version with explicit wasm path in the URL hash
    const wasmUrl = encodeURIComponent('/engine/stockfish-19-lite-single.wasm');
    activeWorker = new Worker(`/engine/stockfish-19-lite-single.js#${wasmUrl}`);
  } catch (err) {
    console.warn('[Stockfish] WASM worker failed, falling back to ASM.js:', err);
    try {
      activeWorker = new Worker('/engine/stockfish-19-asm.js');
    } catch (fallbackErr) {
      console.error('[Stockfish] Failed to initialize worker fallback:', fallbackErr);
      return null;
    }
  }

  return activeWorker;
}

// Convert centipawns or mate distance into a standardized pawns number
function parseScore(scoreType, scoreVal, isBlackTurn) {
  let val = parseInt(scoreVal, 10);
  if (isNaN(val)) val = 0;

  // Convert mate score to high pawn evaluation (+15.0 or -15.0)
  if (scoreType === 'mate') {
    const mateScore = val > 0 ? 15.0 : -15.0;
    return isBlackTurn ? -mateScore : mateScore;
  }

  // Stockfish scores from the perspective of the side to move; convert to White perspective
  const pawns = val / 100.0;
  return isBlackTurn ? -pawns : pawns;
}

// Evaluate a single FEN position using Stockfish UCI commands with a safety watchdog
function evaluateSinglePosition(worker, fen, depth = 8, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let bestMove = '';
    let evalScore = 0.0;
    let pvLine = [];
    let isDone = false;
    let timer = null;

    // Parse turn from FEN string ('w' or 'b')
    const fenParts = fen.split(' ');
    const isBlackTurn = (fenParts[1] || 'w') === 'b';

    const cleanup = () => {
      isDone = true;
      if (timer) clearTimeout(timer);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    };

    const onMessage = (e) => {
      if (isDone) return;
      const line = typeof e.data === 'string' ? e.data : '';

      // Extract evaluation and principal variation (PV) from search info
      if (line.startsWith('info') && line.includes('score')) {
        const cpMatch = line.match(/score cp (-?\d+)/);
        const mateMatch = line.match(/score mate (-?\d+)/);

        if (cpMatch) {
          evalScore = parseScore('cp', cpMatch[1], isBlackTurn);
        } else if (mateMatch) {
          evalScore = parseScore('mate', mateMatch[1], isBlackTurn);
        }

        const pvMatch = line.match(/ pv (.+)$/);
        if (pvMatch) {
          pvLine = pvMatch[1].trim().split(/\s+/);
        }
      }

      // 'bestmove' signals that evaluation for this position is complete
      if (line.startsWith('bestmove')) {
        cleanup();
        const parts = line.split(' ');
        bestMove = parts[1] || '';
        resolve({
          fen,
          eval: evalScore,
          bestMove,
          pv: pvLine,
        });
      }
    };

    const onError = (err) => {
      if (isDone) return;
      console.warn('[Stockfish] Worker error on position:', fen, err);
      cleanup();
      resolve({
        fen,
        eval: 0.0,
        bestMove: '',
        pv: [],
      });
    };

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);

    // Watchdog timer: if engine takes longer than timeoutMs, force stop and resolve
    timer = setTimeout(() => {
      if (!isDone) {
        try {
          worker.postMessage('stop');
        } catch {}
        cleanup();
        resolve({
          fen,
          eval: evalScore,
          bestMove: bestMove || pvLine[0] || '',
          pv: pvLine,
        });
      }
    }, timeoutMs);

    // Send UCI commands to set position and search to target depth
    try {
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go depth ${depth}`);
    } catch (postErr) {
      cleanup();
      resolve({
        fen,
        eval: 0.0,
        bestMove: '',
        pv: [],
      });
    }
  });
}

// Synchronizes with Stockfish worker using the UCI isready / readyok handshake
function waitForReady(worker, timeout = 1200) {
  return new Promise((resolve) => {
    let timer = null;
    const onMsg = (e) => {
      const line = typeof e.data === 'string' ? e.data : '';
      if (line.includes('readyok')) {
        if (timer) clearTimeout(timer);
        worker.removeEventListener('message', onMsg);
        resolve();
      }
    };
    worker.addEventListener('message', onMsg);
    timer = setTimeout(() => {
      worker.removeEventListener('message', onMsg);
      resolve();
    }, timeout);
    try {
      worker.postMessage('isready');
    } catch {
      resolve();
    }
  });
}

// Evaluate an entire array of FEN positions sequentially
export async function evaluatePgnPositions(fens = [], onProgress = null, depth = 10) {
  const worker = getStockfishWorker();
  if (!worker) {
    throw new Error('Stockfish Web Worker could not be started');
  }

  isEvaluating = true;
  const results = [];
  const total = fens.length;

  try {
    try {
      worker.postMessage('ucinewgame');
    } catch {}
    await waitForReady(worker);

    for (let i = 0; i < total; i++) {
      if (!isEvaluating) {
        break; // Cancelled
      }

      const fen = fens[i];
      const evaluation = await evaluateSinglePosition(worker, fen, depth);
      results.push({
        ply: i,
        ...evaluation,
      });

      if (typeof onProgress === 'function') {
        onProgress(i + 1, total);
      }
    }
  } finally {
    isEvaluating = false;
  }

  return results;
}

// Stop current evaluation and terminate worker to free memory
export function terminateStockfish() {
  isEvaluating = false;
  if (activeWorker) {
    try {
      activeWorker.postMessage('stop');
      activeWorker.terminate();
    } catch {}
    activeWorker = null;
  }
}
