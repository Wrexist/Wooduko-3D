import { afterEach, describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../src/core/progress';
import { THEMES } from '../src/config';
import { dictionaries, num, pickLanguage, setLanguage, t } from '../src/i18n';
import type { Key } from '../src/i18n';

const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();

describe('i18n', () => {
  afterEach(() => setLanguage('en'));

  it('every language has every key, non-empty, with the same placeholders', () => {
    const en = dictionaries.en;
    for (const [lang, d] of Object.entries(dictionaries)) {
      for (const k of Object.keys(en) as Key[]) {
        expect(d[k], `${lang}:${k}`).toBeTruthy();
        expect(placeholders(d[k]), `${lang}:${k}`).toEqual(placeholders(en[k]));
      }
    }
  });

  it('has text for every achievement and wood', () => {
    for (const a of ACHIEVEMENTS) {
      expect(dictionaries.en[`ach.${a.id}` as Key]).toBeTruthy();
      expect(dictionaries.en[`ach.${a.id}.desc` as Key]).toBeTruthy();
    }
    for (const th of THEMES) expect(dictionaries.en[`wood.${th.id}` as Key]).toBeTruthy();
  });

  it('follows the device language, falling back to English', () => {
    expect(pickLanguage(['sv-SE', 'en-US'])).toBe('sv');
    expect(pickLanguage(['de-DE', 'en-GB'])).toBe('en');
    expect(pickLanguage(['fr-FR'])).toBe('en');
  });

  it('fills placeholders and formats numbers per language', () => {
    expect(t('combo.pill', { n: 3 })).toBe('Combo ×3');
    expect(num(12345)).toBe('12,345');
    setLanguage('sv');
    expect(t('combo.pill', { n: 3 })).toBe('Kombo ×3');
    expect(num(12345).replace(/\s/g, ' ')).toBe('12 345');
  });
});
