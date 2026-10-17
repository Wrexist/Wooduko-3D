// Messages between the chess controller and the worker where the computer thinks.
import { chooseChessMove, Engine, fromFen, makeMove, START_FEN, unmakeMove } from '../core/chess';
import type { ChessOpponent } from '../core/chess';
import { gradeOf, reasonFor } from '../core/chessSchool';
import type { Review } from '../core/chessSchool';

/** Every question carries the start position and the moves since, so the worker can replay them. */
interface Game {
  readonly fen?: string;
  readonly moves: readonly number[];
}

export type ChessQuestion =
  | (Game & { readonly kind: 'move'; readonly opp: ChessOpponent })
  | (Game & { readonly kind: 'hint' })
  /** How good was `played` (from the position after `moves`)? */
  | (Game & { readonly kind: 'review'; readonly played: number })
  /** The game review: score and best move of the position after `moves` (side to move's view). */
  | (Game & { readonly kind: 'eval' });

export type ChessAsk = ChessQuestion & { readonly id: number };

export interface ChessReply {
  readonly id: number;
  readonly move: number;
  /** `eval`: the score (side to move's view). */
  readonly score?: number;
  readonly review?: Review & { readonly bestScore: number; readonly playedScore: number };
}

/** Hints think this long, at full strength; a review spends this on each side of the move. */
const HINT_MS = 900;
const REVIEW_MS = 450;
/** Each position of a game review. */
const EVAL_MS = 260;

/** Answers questions with one engine, so its transposition table carries over between moves. */
export class ChessBrain {
  private readonly engine = new Engine();

  answer(a: ChessAsk): ChessReply {
    // replayed from the start, so repetitions and the 50-move count are known
    const p = fromFen(a.fen ?? START_FEN);
    for (const m of a.moves) makeMove(p, m);
    if (a.kind === 'move') return { id: a.id, move: chooseChessMove(this.engine, p, a.opp) };
    if (a.kind === 'hint') return { id: a.id, move: this.engine.think(p, HINT_MS, 64).move };
    if (a.kind === 'eval') {
      const r = this.engine.think(p, EVAL_MS, 64);
      return { id: a.id, move: r.move, score: r.score };
    }
    const best = this.engine.think(p, REVIEW_MS, 64);
    makeMove(p, a.played);
    const answer = this.engine.think(p, REVIEW_MS, 64);
    unmakeMove(p);
    const playedScore = -answer.score;
    // the deeper look after the move can find more than the first search did
    const bestScore = Math.max(best.score, playedScore);
    return {
      id: a.id,
      move: best.move,
      review: {
        grade: gradeOf(bestScore, playedScore),
        loss: Math.max(0, bestScore - playedScore),
        best: best.move,
        bestScore,
        playedScore,
        reason: reasonFor(p, a.played, best.move, bestScore, playedScore, answer.move),
      },
    };
  }
}
