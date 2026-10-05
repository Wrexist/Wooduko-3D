// Bot playtest: `npm run sim` (optionally SIM_GAMES=n). Writes shots/playtest.md.
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GENERATOR, GENERATOR_PROTOTYPE } from '../../src/config';
import type { RuleSet } from '../../src/core/rules';
import { casual, playGame, skilled, summarize, table } from './bot';
import type { Bot, Summary } from './bot';

const GAMES = Number(process.env.SIM_GAMES ?? 200);

const CONFIGS: [string, RuleSet][] = [
  ['prototype generator, strict combo', { generator: GENERATOR_PROTOTYPE, grace: 0 }],
  ['new generator, strict combo', { generator: GENERATOR, grace: 0 }],
  ['new generator, grace 1', { generator: GENERATOR, grace: 1 }],
  ['new generator, grace 2', { generator: GENERATOR, grace: 2 }],
];

function run(bot: Bot, games: number): Summary[] {
  return CONFIGS.map(([label, rules]) => {
    const stats = Array.from({ length: games }, (_, i) => playGame(bot, i + 1, rules));
    return summarize(label, stats);
  });
}

describe('bot playtest', () => {
  it('runs and reports', () => {
    const t0 = Date.now();
    const sections: string[] = [`# Bot playtest (${new Date().toISOString().slice(0, 10)})`];
    for (const [bot, games] of [
      [casual, GAMES],
      [skilled, Math.max(20, Math.round(GAMES / 4))],
    ] as const) {
      const rows = run(bot, games);
      sections.push(`\n## ${bot.name} bot\n\n${table(rows)}`);
      // the new generator must never deal a tray where nothing fits
      for (const r of rows.slice(1)) expect(r.deadTrayRate).toBe(0);
    }
    const report = `${sections.join('\n')}\n\n_${((Date.now() - t0) / 1000).toFixed(0)} s_\n`;
    mkdirSync('shots', { recursive: true });
    writeFileSync('shots/playtest.md', report);
    console.log(report);
  });
});
