import { describe, expect, it } from 'vitest';
import { playMove } from '../src/core/rules';
import { tutorialSteps } from '../src/core/tutorial';

describe('tutorial steps', () => {
  const steps = tutorialSteps();
  const kinds = ['row', 'col', 'box'] as const;

  it('has three steps', () => {
    expect(steps).toHaveLength(3);
  });

  it.each(steps.map((s, i) => [i, s] as const))('step %i clears exactly its lesson unit', (i, step) => {
    const m = playMove(step.game, step.slot, ...step.target);
    expect(m).not.toBeNull();
    expect(m?.clear.list).toEqual([{ kind: kinds[i], index: expect.any(Number) }]);
    expect(m?.boardClear).toBe(false);
  });

  it('every placed group is 4-connected and inside the board', () => {
    for (const s of steps) {
      for (const g of s.game.board.groups) {
        for (const [r, c] of g.cells) {
          expect(r).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThan(9);
        }
      }
    }
  });
});
