import { HUD_FX, SCORE_UI } from '../config';
import { num, t } from '../i18n';
import { ComboPill } from './combo';
import { el, ICONS, replay } from './dom';

export interface HudHandlers {
  onPause(): void;
  onRestart(): void;
  onSound(): void;
  onCamera(): void;
}

/** Top bar: pause + restart (left), score + best + combo (centre), sound (right). */
export class Hud {
  readonly node: HTMLDivElement;
  readonly combo = new ComboPill();
  private readonly scoreEl = el('div', { class: 'score', 'aria-live': 'polite' }, ['0']);
  private readonly bestVal = el('span', {}, ['0']);
  private readonly soundBtn: HTMLButtonElement;
  private readonly bestEl: HTMLDivElement;
  /** Mode info next to the best: Blitz clock, Daily goal, "Zen". */
  private readonly chip = el('span', { class: 'chip', hidden: '' });
  private target = 0;
  private shown = 0;

  constructor(h: HudHandlers) {
    const pause = el('button', { class: 'btn', 'aria-label': t('hud.pause'), html: ICONS.pause });
    const restart = el('button', {
      class: 'btn restart',
      'aria-label': t('hud.restart'),
      html: ICONS.restart,
    });
    this.soundBtn = el('button', { class: 'btn', 'aria-label': t('hud.mute'), html: ICONS.soundOn });
    pause.addEventListener('click', h.onPause);
    restart.addEventListener('click', h.onRestart);
    this.soundBtn.addEventListener('click', h.onSound);
    const camera = el('button', { class: 'btn', 'aria-label': t('hud.camera'), html: ICONS.camera });
    camera.addEventListener('click', h.onCamera);
    const best = el('div', { class: 'best' });
    best.innerHTML = ICONS.crown;
    best.append(this.bestVal);
    this.bestEl = best;
    this.node = el('div', { class: 'hud' }, [
      el('div', { class: 'side' }, [pause, restart]),
      el('div', { class: 'scorebox' }, [
        el('div', { class: 'topline' }, [best, this.chip]),
        this.scoreEl,
        this.combo.node,
      ]),
      el('div', { class: 'side right' }, [camera, this.soundBtn]),
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

  /**
   * Per-mode info: `best` hides the crown (Zen has none); `chip` is a short label with an icon
   * (null = hidden); `urgent` makes it pulse red (last seconds of Blitz); `done` turns it gold.
   */
  setInfo(o: {
    best: boolean;
    chip: string | null;
    icon?: string;
    urgent?: boolean;
    done?: boolean;
    label?: string;
  }): void {
    this.bestEl.hidden = !o.best;
    this.chip.hidden = o.chip === null;
    if (o.chip === null) return;
    const html = `${o.icon ?? ''}<span></span>`;
    if (this.chip.dataset.icon !== (o.icon ?? '')) {
      this.chip.innerHTML = html;
      this.chip.dataset.icon = o.icon ?? '';
    }
    const span = this.chip.querySelector('span');
    if (span && span.textContent !== o.chip) span.textContent = o.chip;
    this.chip.classList.toggle('urgent', o.urgent === true);
    this.chip.classList.toggle('done', o.done === true);
    if (o.label) this.chip.setAttribute('aria-label', o.label);
    else this.chip.removeAttribute('aria-label');
  }

  /** Short pop on the chip (goal reached, a Blitz second ticking away). */
  kickChip(): void {
    replay(this.chip, 'kick');
  }

  setBest(best: number): void {
    this.bestVal.textContent = num(best);
  }

  setSound(on: boolean): void {
    this.soundBtn.innerHTML = on ? ICONS.soundOn : ICONS.soundOff;
    this.soundBtn.setAttribute('aria-label', on ? t('hud.mute') : t('hud.unmute'));
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
