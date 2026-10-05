// Tiny time-based tween runner. All animation goes through dt; nothing is per-frame.

export type Ease = (k: number) => number;

export const linear: Ease = (k) => k;
export const easeOutCubic: Ease = (k) => 1 - (1 - k) ** 3;
export const easeInCubic: Ease = (k) => k * k * k;
export const easeInQuad: Ease = (k) => k * k;
const BACK = 1.5;
export const easeOutBack: Ease = (k) => 1 + (BACK + 1) * (k - 1) ** 3 + BACK * (k - 1) ** 2;

/** Exponential smoothing factor for a rate (per second) over dt. */
export const damp = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

export interface TweenSpec {
  /** Seconds before it starts. */
  delay?: number;
  /** Seconds. */
  dur: number;
  ease?: Ease;
  /** `e` = eased progress, `k` = raw progress, both 0..1. */
  update: (e: number, k: number) => void;
  done?: () => void;
}

interface Running extends TweenSpec {
  t: number;
}

export class Tweens {
  private list: Running[] = [];

  add(spec: TweenSpec): void {
    this.list.push({ ...spec, t: -(spec.delay ?? 0) });
  }

  /** Run a callback after `delay` seconds of game time. */
  after(delay: number, fn: () => void): void {
    this.add({ delay, dur: 0, update: () => undefined, done: fn });
  }

  get active(): number {
    return this.list.length;
  }

  update(dt: number): void {
    // iterate a snapshot: callbacks may add tweens
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const tw = list[i];
      if (!tw) continue;
      tw.t += dt;
      if (tw.t < 0) continue;
      const k = tw.dur <= 0 ? 1 : Math.min(1, tw.t / tw.dur);
      tw.update((tw.ease ?? linear)(k), k);
      if (k >= 1) {
        list.splice(i, 1);
        tw.done?.();
      }
    }
  }

  /** Jump every tween to its end (e.g. on reset). */
  finishAll(): void {
    for (let guard = 0; this.list.length && guard < 8; guard++) {
      const list = this.list;
      this.list = [];
      for (const tw of list) {
        tw.update((tw.ease ?? linear)(1), 1);
        tw.done?.();
      }
    }
  }
}
