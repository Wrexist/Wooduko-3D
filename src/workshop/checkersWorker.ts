// The checkers opponent thinks here, off the main thread, so deep searches never drop a frame.
import { answer } from './checkersAsk';
import type { CheckersAsk, CheckersReply } from './checkersAsk';

// in a worker `self` is the worker scope (the DOM lib types it as Window)
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<CheckersAsk>) => void) | null;
  postMessage(m: CheckersReply): void;
};
scope.onmessage = (e) => scope.postMessage(answer(e.data));
