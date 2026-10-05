// Every user-facing string, in one place. English + Swedish; follows the device language.
// Placeholders: {name}. Keys are stable; add a language by adding a dictionary.

const en = {
  'app.title': 'Grain',
  'app.subtitle': 'Wood block puzzle',
  'board.label': 'Wood block puzzle board',
  'app.error': 'Something went wrong while starting Grain. Please close the app and open it again.',

  'hud.pause': 'Pause',
  'hud.restart': 'Restart game',
  'hud.mute': 'Mute sound',
  'hud.unmute': 'Unmute sound',
  'combo.pill': 'Combo ×{n}',
  'combo.risk': 'Combo ×{n}, clear next move to keep it',

  'home.continue': 'Continue',
  'home.play': 'Play',
  'home.newGame': 'New game',
  'home.awards': 'Awards',
  'home.settings': 'Settings',
  'home.reminder': 'Want a gentle reminder on days you haven’t played?',
  'home.reminderYes': 'Yes, remind me',
  'home.reminderNo': 'Not now',

  'pause.title': 'Paused',
  'pause.resume': 'Resume',
  'pause.restart': 'Restart',
  'pause.home': 'Home',

  'settings.title': 'Settings',
  'settings.sound': 'Sound effects',
  'settings.music': 'Music',
  'settings.haptics': 'Haptics',
  'settings.reduceMotion': 'Reduce motion',
  'settings.hints': 'Almost-there hints',
  'settings.reminder': 'Daily reminder',
  'settings.reset': 'Reset progress',
  'common.done': 'Done',
  'common.cancel': 'Cancel',

  'confirm.restart.title': 'Start over?',
  'confirm.restart.body': 'Your current board and score will be lost.',
  'confirm.restart.ok': 'Restart',
  'confirm.newGame.title': 'New game?',
  'confirm.newGame.body': 'Your saved game will be replaced.',
  'confirm.newGame.ok': 'New game',
  'confirm.reset.title': 'Reset progress?',
  'confirm.reset.body': 'This deletes your best score, saved game, stats and awards. Settings are kept.',
  'confirm.reset.ok': 'Reset',

  'results.title': 'No room left',
  'results.newBest': 'New best score!',
  'results.best': 'Best {n}',
  'results.again': 'Play again',
  'results.home': 'Home',
  'results.reviveAd': 'Keep playing · watch an ad',
  'results.reviveFree': 'Keep playing',
  'word.revive': 'Second wind!',
  'settings.removeAds': 'Remove ads',
  'settings.removeAdsPrice': 'Remove ads · {price}',
  'settings.adsRemoved': 'Ads removed. Thank you!',
  'settings.restore': 'Restore purchases',
  'settings.restored': 'Purchases restored',
  'settings.nothingToRestore': 'Nothing to restore',
  'settings.privacy': 'Privacy choices',

  'awards.title': 'Awards',
  'awards.wood': 'Wood',
  'awards.achievements': 'Achievements',
  'awards.leaderboard': 'Game Center leaderboard',
  'awards.locked': '{name}, locked: {req}',
  'awards.unlock': 'Unlock: {req}',
  'awards.unlocked': 'Unlocked',
  'awards.lockedShort': 'Locked',
  'awards.woodUnlocked': '{name} wood unlocked',
  'stat.best': 'Best',
  'stat.games': 'Games',
  'stat.average': 'Average',
  'stat.lines': 'Lines',
  'stat.bestCombo': 'Best combo',
  'stat.boardClears': 'Board clears',

  'tutorial.region': 'Tutorial',
  'tutorial.step': 'Step {n} of {total}',
  'tutorial.skip': 'Skip',
  'tutorial.row': 'Drag the block into the gap to fill the row.',
  'tutorial.col': 'Columns clear too. Drop it in the column.',
  'tutorial.box': 'Fill a 3×3 square to clear it.',

  'word.nice': 'Nice!',
  'word.combo': 'Combo!',
  'word.fire': 'On fire!',
  'word.great': 'Great!',
  'word.excellent': 'Excellent!',
  'word.unreal': 'Unreal!',
  'word.boardClear': 'Board clear!',
  'word.lines': '{n} lines',

  'ach.first-clear': 'First cut',
  'ach.first-clear.desc': 'Clear your first line',
  'ach.combo-3': 'In the groove',
  'ach.combo-3.desc': 'Reach Combo ×3',
  'ach.combo-5': 'On a roll',
  'ach.combo-5.desc': 'Reach Combo ×5',
  'ach.triple': 'Triple cut',
  'ach.triple.desc': 'Clear 3 lines with one block',
  'ach.quad': 'Clean sweep',
  'ach.quad.desc': 'Clear 4 or more lines with one block',
  'ach.board-clear': 'Spotless',
  'ach.board-clear.desc': 'Clear the whole board',
  'ach.score-1k': 'Apprentice',
  'ach.score-1k.desc': 'Score 1,000 in one game',
  'ach.score-5k': 'Journeyman',
  'ach.score-5k.desc': 'Score 5,000 in one game',
  'ach.score-10k': 'Master carpenter',
  'ach.score-10k.desc': 'Score 10,000 in one game',
  'ach.games-10': 'Regular',
  'ach.games-10.desc': 'Finish 10 games',
  'ach.lines-500': 'Sawdust',
  'ach.lines-500.desc': 'Clear 500 lines in total',
  'ach.quests-3': 'Habit',
  'ach.quests-3.desc': 'Finish every daily quest 3 days in a row',
  'ach.quests-7': 'Devoted',
  'ach.quests-7.desc': 'Finish every daily quest 7 days in a row',

  'wood.maple': 'Maple',
  'wood.walnut': 'Walnut',
  'wood.cherry': 'Cherry',
  'wood.birch': 'Birch',
  'wood.driftwood': 'Driftwood',
  'wood.ebony': 'Ebony',
  'wood.oak': 'Oak',
  'wood.mahogany': 'Mahogany',

  'reminder.0.title': 'Your board is waiting',
  'reminder.0.body': 'A calm five-minute game?',
  'reminder.1.title': 'Fresh wood on the table',
  'reminder.1.body': 'Three new pieces are ready when you are.',
  'reminder.2.title': 'Time for a quick clear?',
  'reminder.2.body': 'Line them up, clear them out.',
} as const;

export type Key = keyof typeof en;

const sv: Record<Key, string> = {
  'app.title': 'Grain',
  'app.subtitle': 'Träklosspussel',
  'board.label': 'Spelplan för träklosspussel',
  'app.error': 'Något gick fel när Grain startade. Stäng appen och öppna den igen.',

  'hud.pause': 'Paus',
  'hud.restart': 'Börja om',
  'hud.mute': 'Stäng av ljud',
  'hud.unmute': 'Slå på ljud',
  'combo.pill': 'Kombo ×{n}',
  'combo.risk': 'Kombo ×{n}, rensa i nästa drag för att behålla den',

  'home.continue': 'Fortsätt',
  'home.play': 'Spela',
  'home.newGame': 'Nytt spel',
  'home.awards': 'Utmärkelser',
  'home.settings': 'Inställningar',
  'home.reminder': 'Vill du ha en vänlig påminnelse de dagar du inte har spelat?',
  'home.reminderYes': 'Ja, påminn mig',
  'home.reminderNo': 'Inte nu',

  'pause.title': 'Pausat',
  'pause.resume': 'Fortsätt',
  'pause.restart': 'Börja om',
  'pause.home': 'Hem',

  'settings.title': 'Inställningar',
  'settings.sound': 'Ljudeffekter',
  'settings.music': 'Musik',
  'settings.haptics': 'Vibrationer',
  'settings.reduceMotion': 'Minska rörelse',
  'settings.hints': 'Visa nästan fulla rader',
  'settings.reminder': 'Daglig påminnelse',
  'settings.reset': 'Nollställ framsteg',
  'common.done': 'Klar',
  'common.cancel': 'Avbryt',

  'confirm.restart.title': 'Börja om?',
  'confirm.restart.body': 'Din nuvarande spelplan och poäng försvinner.',
  'confirm.restart.ok': 'Börja om',
  'confirm.newGame.title': 'Nytt spel?',
  'confirm.newGame.body': 'Ditt sparade spel ersätts.',
  'confirm.newGame.ok': 'Nytt spel',
  'confirm.reset.title': 'Nollställa framsteg?',
  'confirm.reset.body':
    'Detta raderar ditt rekord, sparade spel, statistik och utmärkelser. Inställningarna sparas.',
  'confirm.reset.ok': 'Nollställ',

  'results.title': 'Det får inte plats',
  'results.newBest': 'Nytt rekord!',
  'results.best': 'Rekord {n}',
  'results.again': 'Spela igen',
  'results.home': 'Hem',
  'results.reviveAd': 'Fortsätt spela · se en reklam',
  'results.reviveFree': 'Fortsätt spela',
  'word.revive': 'Nytt andetag!',
  'settings.removeAds': 'Ta bort reklam',
  'settings.removeAdsPrice': 'Ta bort reklam · {price}',
  'settings.adsRemoved': 'Reklamen är borttagen. Tack!',
  'settings.restore': 'Återställ köp',
  'settings.restored': 'Köpen är återställda',
  'settings.nothingToRestore': 'Inga köp att återställa',
  'settings.privacy': 'Integritetsval',

  'awards.title': 'Utmärkelser',
  'awards.wood': 'Träslag',
  'awards.achievements': 'Prestationer',
  'awards.leaderboard': 'Game Center-topplista',
  'awards.locked': '{name}, låst: {req}',
  'awards.unlock': 'Lås upp: {req}',
  'awards.unlocked': 'Upplåst',
  'awards.lockedShort': 'Låst',
  'awards.woodUnlocked': '{name} upplåst',
  'stat.best': 'Rekord',
  'stat.games': 'Spel',
  'stat.average': 'Snitt',
  'stat.lines': 'Rader',
  'stat.bestCombo': 'Bästa kombo',
  'stat.boardClears': 'Tomma brädor',

  'tutorial.region': 'Introduktion',
  'tutorial.step': 'Steg {n} av {total}',
  'tutorial.skip': 'Hoppa över',
  'tutorial.row': 'Dra klossen till luckan för att fylla raden.',
  'tutorial.col': 'Kolumner rensas också. Släpp den i kolumnen.',
  'tutorial.box': 'Fyll en 3×3-ruta för att rensa den.',

  'word.nice': 'Snyggt!',
  'word.combo': 'Kombo!',
  'word.fire': 'Het!',
  'word.great': 'Grymt!',
  'word.excellent': 'Utmärkt!',
  'word.unreal': 'Otroligt!',
  'word.boardClear': 'Tom bräda!',
  'word.lines': '{n} rader',

  'ach.first-clear': 'Första snittet',
  'ach.first-clear.desc': 'Rensa din första rad',
  'ach.combo-3': 'I farten',
  'ach.combo-3.desc': 'Nå kombo ×3',
  'ach.combo-5': 'Ostoppbar',
  'ach.combo-5.desc': 'Nå kombo ×5',
  'ach.triple': 'Trippelsnitt',
  'ach.triple.desc': 'Rensa 3 rader med en kloss',
  'ach.quad': 'Rent hus',
  'ach.quad.desc': 'Rensa 4 eller fler rader med en kloss',
  'ach.board-clear': 'Skinande ren',
  'ach.board-clear.desc': 'Töm hela brädan',
  'ach.score-1k': 'Lärling',
  'ach.score-1k.desc': 'Få 1 000 poäng i ett spel',
  'ach.score-5k': 'Gesäll',
  'ach.score-5k.desc': 'Få 5 000 poäng i ett spel',
  'ach.score-10k': 'Mästersnickare',
  'ach.score-10k.desc': 'Få 10 000 poäng i ett spel',
  'ach.games-10': 'Stammis',
  'ach.games-10.desc': 'Spela klart 10 spel',
  'ach.lines-500': 'Sågspån',
  'ach.lines-500.desc': 'Rensa 500 rader totalt',
  'ach.quests-3': 'Vana',
  'ach.quests-3.desc': 'Klara alla dagens uppdrag 3 dagar i rad',
  'ach.quests-7': 'Hängiven',
  'ach.quests-7.desc': 'Klara alla dagens uppdrag 7 dagar i rad',

  'wood.maple': 'Lönn',
  'wood.walnut': 'Valnöt',
  'wood.cherry': 'Körsbär',
  'wood.birch': 'Björk',
  'wood.driftwood': 'Drivved',
  'wood.ebony': 'Ebenholts',
  'wood.oak': 'Ek',
  'wood.mahogany': 'Mahogny',

  'reminder.0.title': 'Brädan väntar på dig',
  'reminder.0.body': 'Ett lugnt spel på fem minuter?',
  'reminder.1.title': 'Nytt trä på bordet',
  'reminder.1.body': 'Tre nya klossar väntar när du är redo.',
  'reminder.2.title': 'Dags för en snabb rensning?',
  'reminder.2.body': 'Ställ upp dem, rensa bort dem.',
};

export type Language = 'en' | 'sv';
const DICTS: Record<Language, Record<Key, string>> = { en, sv };

/** Device language → supported language (Swedish if the device prefers it, else English). */
export function pickLanguage(prefs: readonly string[]): Language {
  for (const p of prefs) {
    const base = p.toLowerCase().split('-')[0];
    if (base === 'sv') return 'sv';
    if (base === 'en') return 'en';
  }
  return 'en';
}

let lang: Language = 'en';
let numberFormat = new Intl.NumberFormat('en-US');

export function setLanguage(l: Language): void {
  lang = l;
  numberFormat = new Intl.NumberFormat(l === 'sv' ? 'sv-SE' : 'en-US');
}

export const language = (): Language => lang;

/** Translate a key, filling {placeholders}. */
export function t(key: Key, vars: Record<string, string | number> = {}): string {
  const s = DICTS[lang][key] ?? en[key];
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

/** Locale-formatted whole number (1,234 / 1 234). */
export const num = (n: number): string => numberFormat.format(n);

/** For tests: every dictionary has every key. */
export const dictionaries = DICTS;
