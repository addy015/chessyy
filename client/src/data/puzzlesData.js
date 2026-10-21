// Homepage Puzzles data

export const PUZZLES = [
  {
    id: "puz_opera_1858",
    title: "Opera Game Decoy",
    source: "Paul Morphy, 1858",
    theme: "Queen Sacrifice & Back-Rank Mate",
    fen: "4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 0 1",
    turn: "w", // White to move
    rating: 1250,
    solution: ["Qb8+", "Nxb8", "Rd8#"],
    hint: "Sacrifice your Queen on the 8th rank to deflect the Knight defender."
  },
  {
    id: "puz_backrank_deflection",
    title: "Heavy Artillery Deflection",
    source: "Master Tournament Archive",
    theme: "Back-Rank Overload",
    fen: "3r2k1/5ppp/8/8/8/8/4qPPP/3R1RK1 b - - 0 1",
    turn: "b", // Black to move
    rating: 1180,
    solution: ["Qxd1", "Rxd1", "Rxd1#"],
    hint: "Overwhelm the first rank with a devastating Queen sacrifice."
  },
  {
    id: "puz_philidor_smothered",
    title: "Philidor Smothered Mate",
    source: "François-André Philidor, 1777",
    theme: "Classic Smothered Checkmate",
    fen: "5r1k/6pp/8/3Q2N1/8/8/6PP/6K1 w - - 0 1",
    turn: "w", // White to move
    rating: 1420,
    solution: ["Nf7+", "Kg8", "Nh6+", "Kh8", "Qg8+", "Rxg8", "Nf7#"],
    hint: "Use double-check to force King to h8, then sacrifice the Queen to box in the King."
  },
  {
    id: "puz_blackburne_strike",
    title: "Blackburne Lightning Strike",
    source: "Joseph Henry Blackburne",
    theme: "Coordination Mate in 1",
    fen: "r1b1k2r/pppp1ppp/8/8/6nq/1BP5/PP3PP1/RNBQ1RK1 b kq - 0 1",
    turn: "b", // Black to move
    rating: 950,
    solution: ["Qh2#"],
    hint: "Combine the Queen and Knight on the unprotected h2 outpost."
  },
  {
    id: "puz_backrank_corridor",
    title: "Corridor Checkmate",
    source: "Fischer Training Exercise",
    theme: "Back-Rank Mate in 1",
    fen: "6k1/5ppp/8/8/8/8/4QPPP/6K1 w - - 0 1",
    turn: "w", // White to move
    rating: 800,
    solution: ["Qe8#"],
    hint: "Exploit the opponent's un-advanced pawn shield on the 8th rank."
  },
  {
    id: "puz_center_pin",
    title: "Central Pin Decapitation",
    source: "Capablanca Tactical Study",
    theme: "Exploiting the Absolute Pin",
    fen: "r3k2r/pppq1ppp/2n5/4p3/8/5N2/PPPP1PPP/R1BQR1K1 w kq - 0 1",
    turn: "w", // White to move
    rating: 1100,
    solution: ["Nxe5", "Nxe5", "Rxe5+"],
    hint: "Strike the pinned e5 pawn along the open e-file."
  },
  {
    id: "puz_arabian_mate",
    title: "Arabian Checkmate",
    source: "Historical Tactical Pattern",
    theme: "Rook & Knight Coordination",
    fen: "7k/5R2/5N2/8/8/8/8/6K1 w - - 0 1",
    turn: "w", // White to move
    rating: 850,
    solution: ["Rh7#"],
    hint: "Deliver checkmate in the corner using the Rook protected by the Knight."
  },
  {
    id: "puz_greek_gift",
    title: "Classic Greek Gift Sacrifice",
    source: "Gioachino Greco, 1619",
    theme: "Bishop Sacrifice on h7",
    fen: "r1bq1rk1/ppp2ppp/2n1pn2/3p4/2PP4/2NBPN2/PP1Q1PPP/R3K2R w KQ - 0 1",
    turn: "w", // White to move
    rating: 1350,
    solution: ["Bxh7+", "Kxh7", "Ng5+"],
    hint: "Sacrifice your light-squared Bishop on h7 to shatter Black's King shield."
  }
];

// Picks a random puzzle from the collection (optionally excluding the current one)
export function getRandomPuzzle(excludeId = null) {
  const filtered = excludeId ? PUZZLES.filter(p => p.id !== excludeId) : PUZZLES;
  const pool = filtered.length > 0 ? filtered : PUZZLES;
  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex];
}
