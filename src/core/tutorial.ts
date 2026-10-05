import { BOARD } from '../config';
import { components, emptyBoard, place } from './board';
import { createRng, makeWoodSeed } from './generator';
import { ORIENTATIONS } from './shapes';
import type { BoardState, Cell, GameState, Piece } from './types';

export interface TutorialStep {
  readonly text: string;
  readonly game: GameState;
  /** Tray slot holding the piece to drag. */
  readonly slot: number;
  /** Where the piece must go (top-left of its bounding box). */
  readonly target: readonly [r0: number, c0: number];
}

const TUTORIAL_SEED = 2718;

function findShape(baseId: string, w: number, h: number): number {
  const s = ORIENTATIONS.find((o) => o.baseId === baseId && o.w === w && o.h === h);
  if (!s) throw new Error(`tutorial shape ${baseId} ${w}×${h} missing`);
  return s.index;
}

/** Fill `cells` as a few chunky groups so the board looks like a real game. */
function boardWith(cells: readonly Cell[], seed: number): BoardState {
  const rng = createRng(seed);
  let board = emptyBoard();
  const chunk = 3;
  for (let i = 0; i < cells.length; i += chunk) {
    for (const part of components(cells.slice(i, i + chunk))) {
      const cx = part.reduce((a, p) => a + p[1], 0) / part.length + 0.5;
      const cy = part.reduce((a, p) => a + p[0], 0) / part.length + 0.5;
      board = place(board, part, [cx, cy], makeWoodSeed(rng)).board;
    }
  }
  return board;
}

function step(
  text: string,
  cells: readonly Cell[],
  shapeIndex: number,
  target: [number, number],
  seed: number,
): TutorialStep {
  const rng = createRng(seed);
  const piece: Piece = { shapeIndex, seed: makeWoodSeed(rng) };
  const tray: (Piece | null)[] = [null, piece, null];
  return {
    text,
    slot: 1,
    target,
    game: { board: boardWith(cells, seed + 1), tray, score: 0, streak: 0, rng: rng.state, over: false },
  };
}

const N = BOARD.size;
const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/** Three guided placements: a row, a column, a 3×3 square. */
export function tutorialSteps(): TutorialStep[] {
  const row = 4;
  const rowCells = range(N)
    .filter((c) => c !== 3 && c !== 4)
    .map((c): Cell => [row, c]);
  const col = 6;
  const colCells = range(N)
    .filter((r) => r < 2 || r > 4)
    .map((r): Cell => [r, col]);
  const boxHole = new Set(['3,3', '3,4', '4,3']);
  const boxCells: Cell[] = [];
  for (let r = 3; r < 6; r++)
    for (let c = 3; c < 6; c++) if (!boxHole.has(`${r},${c}`)) boxCells.push([r, c]);
  const l3 = ORIENTATIONS.find(
    (o) =>
      o.baseId === 'l3' &&
      o.cells.length === 3 &&
      o.cells.some(([r, c]) => r === 0 && c === 0) &&
      o.cells.some(([r, c]) => r === 0 && c === 1) &&
      o.cells.some(([r, c]) => r === 1 && c === 0),
  );
  if (!l3) throw new Error('tutorial l3 missing');
  // A few blocks off to the side so each step looks like a real board (and is not a board clear).
  const rowExtras: Cell[] = [
    [1, 1],
    [1, 2],
    [2, 1],
    [7, 6],
    [7, 7],
  ];
  const colExtras: Cell[] = [
    [0, 1],
    [1, 1],
    [7, 2],
    [8, 2],
    [8, 3],
  ];
  const boxExtras: Cell[] = [
    [0, 7],
    [0, 8],
    [7, 0],
    [8, 0],
    [8, 1],
  ];
  return [
    step(
      'Drag the block into the gap to fill the row.',
      [...rowCells, ...rowExtras],
      findShape('i2', 2, 1),
      [row, 3],
      TUTORIAL_SEED,
    ),
    step(
      'Columns clear too. Drop it in the column.',
      [...colCells, ...colExtras],
      findShape('i3', 1, 3),
      [2, col],
      TUTORIAL_SEED + 10,
    ),
    step('Fill a 3×3 square to clear it.', [...boxCells, ...boxExtras], l3.index, [3, 3], TUTORIAL_SEED + 20),
  ];
}
