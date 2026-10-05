import { el, replay } from './dom';

/** Big centred callout word ("Great!", "Board clear!") with an optional subtitle. */
export class Toast {
  readonly node = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
  // built once; each callout only swaps text, so the DOM never grows
  private readonly big = el('div', { class: 'big' });
  private readonly small = el('div', { class: 'small' });

  constructor() {
    this.node.append(this.big, this.small);
  }

  show(big: string, small: string, topPx: number, tier: number): void {
    this.node.style.top = `${topPx}px`;
    this.node.className = `toast tier-${tier}`;
    this.big.textContent = big;
    this.small.textContent = small;
    this.small.hidden = !small;
    replay(this.node, 'show');
  }
}
