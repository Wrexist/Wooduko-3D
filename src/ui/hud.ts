import { SCORE_UI } from '../config';
import { ComboPill } from './combo';
import { el, ICONS, replay } from './dom';

export interface HudHandlers {
  onPause(): void;
  onRestart(): void;
  onSound(): void;
}

/** Top bar: pause + restart (left), score + best + combo (centre), sound (right). */
export class Hud {
  readonly node: HTMLDivElement;
  readonly combo = new ComboPill();
  private readonly scoreEl = el('div', { class: 'score', 'aria-live': 'polite' }, ['0']);
  private readonly bestVal = el('span', {}, ['0']);
  private readonly soundBtn: HTMLButtonElement;
  private target = 0;
  private shown = 0;

  constructor(h: HudHandlers) {
    const pause = el('button', { class: 'btn', 'aria-label': 'Pause', html: ICONS.pause });
    const restart = el('button', { class: 'btn restart', 'aria-label': 'Restart game', html: ICONS.restart });
    this.soundBtn = el('button', { class: 'btn', 'aria-label': 'Mute sound', html: ICONS.soundOn });
    pause.addEventListener('click', h.onPause);
    restart.addEventListener('click', h.onRestart);
    this.soundBtn.addEventListener('click', h.onSound);
    const best = el('div', { class: 'best' });
    best.innerHTML = ICONS.crown;
    best.append(this.bestVal);
    this.node = el('div', { class: 'hud' }, [
      el('div', { class: 'side' }, [pause, restart]),
      el('div', { class: 'scorebox' }, [best, this.scoreEl, this.combo.node]),
      el('div', { class: 'side right' }, [this.soundBtn]),
    ]);
  }

  /** Bottom edge of the HUD in px (camera fits the board below it). */
  get bottom(): number {
    return this.node.getBoundingClientRect().bottom;
  }

  setVisible(on: boolean): void {
    this.node.classList.toggle('hidden', !on);
  }

  setScore(score: number, instant = false): void {
    this.target = score;
    if (instant) {
      this.shown = score;
      this.scoreEl.textContent = String(score);
    }
  }

  bump(): void {
    replay(this.scoreEl, 'bump');
  }

  setBest(best: number): void {
    this.bestVal.textContent = String(best);
  }

  setSound(on: boolean): void {
    this.soundBtn.innerHTML = on ? ICONS.soundOn : ICONS.soundOff;
    this.soundBtn.setAttribute('aria-label', on ? 'Mute sound' : 'Unmute sound');
  }

  /** Smooth count-up. */
  update(dt: number): void {
    if (Math.abs(this.target - this.shown) > 0.5) {
      this.shown += (this.target - this.shown) * Math.min(1, dt * SCORE_UI.countRate);
      const txt = String(Math.round(this.shown));
      if (this.scoreEl.textContent !== txt) this.scoreEl.textContent = txt;
    } else if (this.shown !== this.target) {
      this.shown = this.target;
      this.scoreEl.textContent = String(this.target);
    }
  }
}
