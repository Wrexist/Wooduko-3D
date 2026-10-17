// Messages between the checkers controller and the worker where the computer thinks.
import { chooseMove, hintMove } from '../core/checkers';
import type { CBoard, CMove, COpponent, Side } from '../core/checkers';

export type CheckersAsk =
  | {
      readonly id: number;
      readonly kind: 'move';
      readonly board: CBoard;
      readonly side: Side;
      readonly opp: COpponent;
    }
  | { readonly id: number; readonly kind: 'hint'; readonly board: CBoard; readonly side: Side };

export interface CheckersReply {
  readonly id: number;
  readonly move: CMove | null;
}

export function answer(a: CheckersAsk): CheckersReply {
  return {
    id: a.id,
    move: a.kind === 'move' ? chooseMove(a.board, a.side, a.opp) : hintMove(a.board, a.side),
  };
}
