import { el } from './dom';

const LIFETIME_MS = 1500;

/** "+N" that rises from a screen point and fades. */
export function floatText(parent: HTMLElement, text: string, x: number, y: number, gold: boolean): void {
  const node = el('div', { class: gold ? 'float gold' : 'float', 'aria-hidden': 'true' }, [text]);
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  parent.append(node);
  const remove = (): void => node.remove();
  node.addEventListener('animationend', remove);
  window.setTimeout(remove, LIFETIME_MS);
}
