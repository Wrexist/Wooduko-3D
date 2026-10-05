import { el, replay } from './dom';

/** Gold "Combo ×N" pill under the score. Appears at streak ≥ 2 and kicks on every increase. */
export class ComboPill {
  readonly node = el('div', { class: 'combo', 'aria-live': 'polite' });
  private shown = 0;

  set(streak: number): void {
    if (streak >= 2) {
      this.node.textContent = `Combo ×${streak}`;
      this.node.classList.add('show');
      if (streak !== this.shown) replay(this.node, 'kick');
    } else this.node.classList.remove('show', 'kick');
    this.shown = streak;
  }
}
