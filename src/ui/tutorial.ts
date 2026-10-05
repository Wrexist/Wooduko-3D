import { TUTORIAL } from '../config';
import { el, ICONS } from './dom';

const LOOP = TUTORIAL.handLoop;
const PRESS_END = TUTORIAL.handPressEnd;
const MOVE_END = TUTORIAL.handMoveEnd;
const HOLD_END = TUTORIAL.handHoldEnd;
const PRESS = TUTORIAL.handPress;

const smooth = (k: number): number => k * k * (3 - 2 * k);

/** Coach overlay: step label, instruction, a pointing hand that mimes the drag, and Skip. */
export class TutorialOverlay {
  readonly node: HTMLDivElement;
  private readonly tip: HTMLDivElement;
  private readonly stepEl = el('div', { class: 'step' });
  private readonly textEl = el('div', { class: 'text' });
  private readonly hand = el('div', { class: 'hand', html: ICONS.hand, 'aria-hidden': 'true' });
  private t = 0;
  private from = { x: 0, y: 0 };
  private to = { x: 0, y: 0 };
  private handOn = true;

  constructor(onSkip: () => void) {
    const skip = el('button', { class: 'skip' }, ['Skip']);
    skip.addEventListener('click', onSkip);
    this.node = el('div', { class: 'tutorial hidden', role: 'region', 'aria-label': 'Tutorial' }, [
      (this.tip = el('div', { class: 'tip', 'aria-live': 'polite' }, [this.stepEl, this.textEl])),
      this.hand,
      skip,
    ]);
  }

  /** Bottom of the instruction text (px), so the camera can fit the board below it. */
  get bottom(): number {
    return this.tip.getBoundingClientRect().bottom;
  }

  get open(): boolean {
    return !this.node.classList.contains('hidden');
  }

  show(index: number, total: number, text: string): void {
    this.node.classList.remove('hidden');
    this.stepEl.textContent = `Step ${index + 1} of ${total}`;
    this.textEl.textContent = text;
    this.t = 0;
  }

  hide(): void {
    this.node.classList.add('hidden');
  }

  /** Screen points (px) for the hand path. */
  setPath(from: { x: number; y: number }, to: { x: number; y: number }): void {
    this.from = from;
    this.to = to;
  }

  /** Hide the hand while the player is dragging. */
  setHand(on: boolean): void {
    if (on && !this.handOn) this.t = 0;
    this.handOn = on;
  }

  update(dt: number, reduced: boolean): void {
    if (!this.open) return;
    if (!this.handOn) {
      this.hand.style.opacity = '0';
      return;
    }
    this.t = (this.t + dt) % LOOP;
    const k = this.t / LOOP;
    let x = this.from.x;
    let y = this.from.y;
    let s: number;
    let o = 1;
    if (k < PRESS_END) {
      const p = k / PRESS_END;
      o = Math.min(1, p * 2);
      s = 1 - PRESS * p;
    } else if (k < MOVE_END) {
      const p = smooth((k - PRESS_END) / (MOVE_END - PRESS_END));
      x += (this.to.x - this.from.x) * p;
      y += (this.to.y - this.from.y) * p;
      s = 1 - PRESS;
    } else {
      x = this.to.x;
      y = this.to.y;
      const p = (k - MOVE_END) / (1 - MOVE_END);
      s = 1 - PRESS + PRESS * Math.min(1, p * 3);
      o = k < HOLD_END ? 1 : 1 - (k - HOLD_END) / (1 - HOLD_END);
    }
    if (reduced) {
      // no travel: point at the target and pulse gently
      x = this.to.x;
      y = this.to.y;
      s = 1;
      o = 0.6 + 0.4 * Math.sin(k * Math.PI);
    }
    this.hand.style.opacity = String(o);
    this.hand.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  }
}
