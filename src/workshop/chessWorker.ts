// The chess opponent thinks here, off the main thread, so deep searches never drop a frame.
import { ChessBrain } from './chessAsk';
import type { ChessAsk, ChessReply } from './chessAsk';

const brain = new ChessBrain();
// in a worker `self` is the worker scope (the DOM lib types it as Window)
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<ChessAsk>) => void) | null;
  postMessage(m: ChessReply): void;
};
scope.onmessage = (e) => scope.postMessage(brain.answer(e.data));
