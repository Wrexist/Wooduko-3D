import { el, replay } from './dom';

/** Big centred callout word ("Great!", "Board clear!") with an optional subtitle. */
export class Toast {
  readonly node = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });

  show(big: string, small: string, topPx: number, tier: number): void {
    this.node.style.top = `${topPx}px`;
    this.node.className = `toast tier-${tier}`;
    this.node.replaceChildren(el('div', { class: 'big' }, [big]));
    if (small) this.node.append(el('div', { class: 'small' }, [small]));
    replay(this.node, 'show');
  }
}
