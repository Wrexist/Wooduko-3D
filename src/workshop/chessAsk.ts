// Messages between the chess controller and the worker where the computer thinks.
import { chooseChessMove, Engine, makeMove, newGame } from '../core/chess';
import type { ChessOpponent } from '../core/chess';

export type ChessAsk =
  | {
      readonly id: number;
      readonly kind: 'move';
      readonly moves: readonly number[];
      readonly opp: ChessOpponent;
    }
  | { readonly id: number; readonly kind: 'hint'; readonly moves: readonly number[] };

export interface ChessReply {
  readonly id: number;
  readonly move: number;
}

/** Hints think this long, at full strength. */
const HINT_MS = 900;

/** Answers questions with one engine, so its transposition table carries over between moves. */
export class ChessBrain {
  private readonly engine = new Engine();

  answer(a: ChessAsk): ChessReply {
    // the game is replayed from its moves, so repetitions and the 50-move count are known
    const p = newGame();
    for (const m of a.moves) makeMove(p, m);
    const move =
      a.kind === 'move' ? chooseChessMove(this.engine, p, a.opp) : this.engine.think(p, HINT_MS, 64).move;
    return { id: a.id, move };
  }
}
