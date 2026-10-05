import './ui/styles.css';
import { Capacitor } from '@capacitor/core';
import { PROGRESS, RETENTION, SAVE, TUTORIAL_KEY } from './config';
import { Game } from './game';
import { pickLanguage, setLanguage, t } from './i18n';
import { webHaptics } from './platform/haptics';
import type { Haptics } from './platform/haptics';
import { webMonetization } from './platform/monetization';
import type { Monetization } from './platform/monetization';
import { webServices } from './platform/services';
import type { Services } from './platform/services';
import { webStorage } from './platform/storage';
import type { KeyValueStore } from './platform/storage';
import { createGameStore, loadPersisted } from './state/store';

const randomSeed = (): number => (Math.random() * 0x100000000) >>> 0 || 1;

/** Every key the game persists (copied from localStorage into native storage on first launch). */
const STORAGE_KEYS = [
  SAVE.gameKey,
  SAVE.bestKey,
  SAVE.settingsKey,
  SAVE.legacyMuteKey,
  TUTORIAL_KEY,
  PROGRESS.statsKey,
  PROGRESS.achievementsKey,
  RETENTION.metaKey,
];

async function boot(): Promise<void> {
  const lang = pickLanguage(navigator.languages?.length ? navigator.languages : [navigator.language]);
  setLanguage(lang);
  document.documentElement.lang = lang;
  const canvas = document.getElementById('c');
  const uiRoot = document.getElementById('ui');
  if (!(canvas instanceof HTMLCanvasElement) || !uiRoot) throw new Error('Missing #c or #ui');
  canvas.setAttribute('aria-label', t('board.label'));

  const debug = import.meta.env.DEV || import.meta.env.VITE_DEBUG_HOOKS === '1';
  const native = Capacitor.isNativePlatform();
  // native adapters are loaded only inside the app, so the web bundle stays small
  const nat = native ? await import('./platform/native') : null;
  const storage: KeyValueStore = nat ? await nat.nativeStorage(STORAGE_KEYS) : webStorage();
  const haptics: Haptics = nat ? nat.nativeHaptics() : webHaptics();
  // test builds can inject fake native services to exercise Game Center / review / reminder paths
  const fake = debug ? (window as { __fakeServices?: Services }).__fakeServices : undefined;
  const services: Services = nat ? nat.nativeServices() : (fake ?? webServices());
  const fakeMoney = debug ? (window as { __fakeMonetization?: Monetization }).__fakeMonetization : undefined;
  const monetization: Monetization = native
    ? (await import('./platform/nativeMonetization')).nativeMonetization()
    : (fakeMoney ?? webMonetization());

  const deps = { storage, randomSeed };
  const store = createGameStore(deps, await loadPersisted(deps));
  const game = new Game({ canvas, uiRoot, store, haptics, services, monetization });
  // hide the launch screen once the first frame is on screen
  if (nat) requestAnimationFrame(() => requestAnimationFrame(() => void nat.nativeChrome()));
  if (debug) {
    // dev / test-build only: hooks for scripted screenshots and soak checks
    Object.assign(window, { __grain: { store, game } });
  }
}

boot().catch(async (err: unknown) => {
  console.error(err);
  const ui = document.getElementById('ui');
  if (ui) {
    ui.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'fatal';
    p.textContent = t('app.error');
    ui.append(p);
  }
  // never leave the native app stuck on the launch screen
  if (Capacitor.isNativePlatform()) {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide().catch(() => undefined);
  }
});
