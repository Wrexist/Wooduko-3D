import { t } from '../i18n';
import { el, replay } from './dom';

/**
 * Gold "Combo ×N" pill under the score. Appears at streak ≥ 2 and kicks on every increase.
 * After a miss that the combo grace forgave, it dims and pulses: "clear on your next move or lose it".
 */
export class ComboPill {
  readonly node = el('div', { class: 'combo', 'aria-live': 'polite' });
  private shown = 0;

  set(streak: number, atRisk = false): void {
    if (streak >= 2) {
      this.node.textContent = t('combo.pill', { n: streak });
      this.node.classList.add('show');
      this.node.classList.toggle('risk', atRisk);
      this.node.setAttribute(
        'aria-label',
        atRisk ? t('combo.risk', { n: streak }) : t('combo.pill', { n: streak }),
      );
      if (streak !== this.shown) replay(this.node, 'kick');
    } else this.node.classList.remove('show', 'kick', 'risk');
    this.shown = streak;
  }
}
