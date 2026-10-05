import { HUD_FX, SCORE_UI } from '../config';
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

  /** Lowest visible HUD pixel, including the combo pill when it shows (for things placed below). */
  get contentBottom(): number {
    const pill = this.combo.node;
    const pillBottom = pill.classList.contains('show') ? pill.getBoundingClientRect().bottom : 0;
    return Math.max(this.bottom, pillBottom);
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

  /**
   * The score just passed the old best: a big crown rises from (x, y) and flies into the best label,
   * which then pulses. Reduced motion: only the pulse.
   */
  celebrateBest(x: number, y: number, reduced: boolean): void {
    const label = this.bestVal.parentElement;
    if (!label) return;
    const done = (): void => replay(label, 'pulse');
    if (reduced || typeof document.body.animate !== 'function') return done();
    const crown = el('div', { class: 'flying-crown', 'aria-hidden': 'true', html: ICONS.crown });
    document.body.append(crown);
    const r = label.getBoundingClientRect();
    const tx = r.left + r.width / 2;
    const ty = r.top + r.height / 2;
    const anim = crown.animate(
      [
        { transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(0.4)`, opacity: 0 },
        {
          transform: `translate(${x}px, ${y - 40}px) translate(-50%, -50%) scale(2.4)`,
          opacity: 1,
          offset: 0.35,
        },
        { transform: `translate(${tx}px, ${ty}px) translate(-50%, -50%) scale(0.7)`, opacity: 1 },
      ],
      { duration: HUD_FX.crownMs, easing: 'cubic-bezier(.3,.7,.3,1)' },
    );
    anim.onfinish = (): void => {
      crown.remove();
      done();
    };
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
