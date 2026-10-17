import { describe, expect, it } from 'vitest';
import {
  chessOpponent,
  chessStars,
  chooseChessMove,
  CHESS_LEVELS,
  Engine,
  fromFen,
  insufficient,
  legalMoves,
  makeMove,
  MATE,
  moveName,
  newGame,
  perft,
  status,
  unmakeMove,
} from '../src/core/chess';

const play = (fen: string, names: string[]) => {
  const p = fromFen(fen);
  for (const n of names) {
    const m = legalMoves(p).find((x) => moveName(x) === n);
    if (m === undefined) throw new Error(`illegal ${n}`);
    makeMove(p, m);
  }
  return p;
};

describe('chess rules (perft)', () => {
  it('start position', () => {
    const p = newGame();
    expect(perft(p, 1)).toBe(20);
    expect(perft(p, 2)).toBe(400);
    expect(perft(p, 3)).toBe(8902);
    expect(perft(p, 4)).toBe(197281);
  });

  it('Kiwipete: castling, en passant, promotions, pins', () => {
    const p = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    expect(perft(p, 1)).toBe(48);
    expect(perft(p, 2)).toBe(2039);
    expect(perft(p, 3)).toBe(97862);
  });

  it('position 3: en passant edge cases', () => {
    const p = fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
    expect(perft(p, 4)).toBe(43238);
  });

  it('position 4: promotions and castling under attack', () => {
    const p = fromFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
    expect(perft(p, 3)).toBe(9467);
  });

  it('position 5', () => {
    const p = fromFen('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8');
    expect(perft(p, 3)).toBe(62379);
  });

  it('make / unmake restores the hash exactly', () => {
    const p = newGame();
    const { lo, hi } = p;
    for (const m of legalMoves(p)) {
      makeMove(p, m);
      unmakeMove(p);
    }
    expect([p.lo, p.hi]).toEqual([lo, hi]);
  });
});

describe('chess status', () => {
  it("fool's mate is mate", () => {
    expect(
      status(
        play('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ['f2f3', 'e7e5', 'g2g4', 'd8h4']),
      ),
    ).toBe('mate');
  });
  it('stalemate', () => {
    expect(status(fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))).toBe('stalemate');
  });
  it('threefold repetition', () => {
    const p = play('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', [
      'a1a2',
      'e8d8',
      'a2a1',
      'd8e8',
      'a1a2',
      'e8d8',
      'a2a1',
      'd8e8',
    ]);
    expect(status(p)).toBe('repetition');
  });
  it('insufficient material', () => {
    expect(insufficient(fromFen('4k3/8/8/8/8/8/8/2B1K3 w - - 0 1'))).toBe(true);
    expect(insufficient(fromFen('4k3/8/8/8/8/8/8/R3K3 w - - 0 1'))).toBe(false);
  });
  it('stars: help costs stars', () => {
    expect(chessStars(0)).toBe(3);
    expect(chessStars(2)).toBe(2);
    expect(chessStars(5)).toBe(1);
  });
});

describe('chess engine', () => {
  it('finds mate in one', () => {
    const p = fromFen('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
    const r = new Engine().think(p, 1000, 4);
    expect(moveName(r.move)).toBe('a1a8');
    expect(r.score).toBeGreaterThan(MATE - 10);
  });

  it('finds mate in two', () => {
    // 1. Qf8+ Kxf8 ... no: a classic back-rank pattern with a rook lift
    const p = fromFen('r5k1/5ppp/8/8/8/8/1Q3PPP/1R4K1 w - - 0 1');
    const r = new Engine().think(p, 2000, 6);
    expect(r.score).toBeGreaterThan(MATE - 10);
  });

  it('takes a hanging queen', () => {
    const p = fromFen('4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1');
    expect(moveName(new Engine().think(p, 500, 4).move)).toBe('d2d5');
  });

  it('every level answers with a legal move in time', () => {
    const p = newGame();
    const e = new Engine();
    for (let n = 1; n <= CHESS_LEVELS.length; n += 7) {
      const t0 = Date.now();
      const m = chooseChessMove(e, p, chessOpponent(n));
      expect(legalMoves(p)).toContain(m);
      expect(Date.now() - t0).toBeLessThan(chessOpponent(n).ms * 5 + 500);
    }
  });

  it('the strongest level beats the weakest', () => {
    let rnd = 7;
    const rand = () => (rnd = (rnd * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const strong = new Engine();
    const weak = new Engine();
    const p = newGame();
    let result = 'play';
    for (let ply = 0; ply < 160 && result === 'play'; ply++) {
      const m =
        p.side === 1
          ? chooseChessMove(strong, p, { ms: 150, depth: 4, noise: 0, blunder: 0 }, rand)
          : chooseChessMove(weak, p, chessOpponent(1), rand);
      makeMove(p, m);
      result = status(p);
    }
    expect(result).toBe('mate');
    expect(p.side).toBe(-1);
  }, 60000);
});
