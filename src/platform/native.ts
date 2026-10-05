// Capacitor (iOS) implementations of the platform adapters. Only used inside the native app;
// the web build keeps the web fallbacks (see main.ts).
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Haptics as CapHaptics, ImpactStyle } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { InAppReview } from '@capacitor-community/in-app-review';
import { GAME_CENTER, NATIVE } from '../config';
import type { AchievementId } from '../core/progress';
import type { Haptics } from './haptics';
import type { Services } from './services';
import type { KeyValueStore } from './storage';

export const isNative = (): boolean => Capacitor.isNativePlatform();

/**
 * iOS can wipe WKWebView localStorage, so native saves live in Preferences (UserDefaults).
 * On first native launch, anything already in localStorage is copied over once.
 */
export async function nativeStorage(keys: readonly string[]): Promise<KeyValueStore> {
  const migrated = await Preferences.get({ key: NATIVE.migratedKey });
  if (!migrated.value) {
    for (const key of keys) {
      try {
        const v = localStorage.getItem(key);
        if (v !== null) await Preferences.set({ key, value: v });
      } catch {
        // no localStorage: nothing to migrate
      }
    }
    await Preferences.set({ key: NATIVE.migratedKey, value: '1' });
  }
  return {
    get: async (key) => (await Preferences.get({ key })).value,
    set: async (key, value) => Preferences.set({ key, value }),
    remove: async (key) => Preferences.remove({ key }),
  };
}

/**
 * Maps the game's vibration patterns onto the Taptic Engine: a single pulse becomes an impact
 * (light / medium / heavy by length), a pattern plays one impact per "on" segment.
 */
export function nativeHaptics(): Haptics {
  let enabled = true;
  const style = (ms: number): ImpactStyle =>
    ms <= NATIVE.hapticLightMs
      ? ImpactStyle.Light
      : ms <= NATIVE.hapticMediumMs
        ? ImpactStyle.Medium
        : ImpactStyle.Heavy;
  const impact = (ms: number): void => {
    // the shortest pulses are snap ticks: the picker-wheel "selection" click, not an impact
    if (ms <= NATIVE.hapticSelectionMs) {
      void CapHaptics.selectionStart()
        .then(() => CapHaptics.selectionChanged())
        .catch(() => undefined);
      return;
    }
    void CapHaptics.impact({ style: style(ms) }).catch(() => undefined);
  };
  return {
    setEnabled: (on) => {
      enabled = on;
    },
    pulse: (pattern) => {
      if (!enabled) return;
      if (typeof pattern === 'number') return impact(pattern);
      let t = 0;
      pattern.forEach((ms, i) => {
        if (i % 2 === 0) window.setTimeout(() => impact(ms), t);
        t += ms;
      });
    },
  };
}

interface GrainGameCenter {
  signIn(): Promise<{ authenticated: boolean }>;
  submitScore(o: { leaderboardId: string; score: number }): Promise<void>;
  unlockAchievement(o: { achievementId: string }): Promise<void>;
  showLeaderboard(o: { leaderboardId: string }): Promise<void>;
}

const REMINDER_ID = 1;

export function nativeServices(): Services {
  const gc = registerPlugin<GrainGameCenter>('GrainGameCenter');
  let signedIn = false;
  const quiet = <T>(p: Promise<T>): Promise<void> => p.then(() => undefined).catch(() => undefined);
  return {
    gameCenter: {
      available: () => true,
      signIn: async () => {
        try {
          signedIn = (await gc.signIn()).authenticated;
        } catch {
          signedIn = false;
        }
        return signedIn;
      },
      submitBest: (score) => quiet(gc.submitScore({ leaderboardId: GAME_CENTER.leaderboard, score })),
      unlock: (id: AchievementId) =>
        quiet(
          gc.unlockAchievement({ achievementId: `${GAME_CENTER.achievementPrefix}${id.replace(/-/g, '_')}` }),
        ),
      showLeaderboard: () => quiet(gc.showLeaderboard({ leaderboardId: GAME_CENTER.leaderboard })),
    },
    review: {
      available: () => true,
      request: () => quiet(InAppReview.requestReview()),
    },
    reminders: {
      available: () => true,
      enable: async () => {
        try {
          const p = await LocalNotifications.requestPermissions();
          return p.display === 'granted';
        } catch {
          return false;
        }
      },
      schedule: (at, title, body) =>
        quiet(
          LocalNotifications.schedule({
            notifications: [{ id: REMINDER_ID, title, body, schedule: { at } }],
          }),
        ),
      cancel: () => quiet(LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] })),
    },
  };
}

/** Light status bar text over the dark wood, then hide the launch screen once the first frame is up. */
export async function nativeChrome(): Promise<void> {
  await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
  await SplashScreen.hide({ fadeOutDuration: NATIVE.splashFadeMs }).catch(() => undefined);
}
