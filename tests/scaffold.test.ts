import { describe, expect, it } from 'vitest';
import { BOARD } from '../src/config';

describe('scaffold', () => {
  it('loads config', () => {
    expect(BOARD.size).toBe(9);
  });
});
