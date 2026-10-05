import type { AchievementId } from '../core/progress';

/**
 * Native services behind one adapter. The web build has none of them (everything reports
 * unavailable and does nothing); the Capacitor implementations are added in phase 7.
 */
export interface Services {
  readonly gameCenter: {
    available(): boolean;
    /** Silent sign-in at launch; resolves false if the player declines or it is unavailable. */
    signIn(): Promise<boolean>;
    submitBest(score: number): Promise<void>;
    unlock(id: AchievementId): Promise<void>;
    showLeaderboard(): Promise<void>;
  };
  readonly review: {
    available(): boolean;
    request(): Promise<void>;
  };
  readonly reminders: {
    available(): boolean;
    /** Ask the OS for permission. Resolves true if granted. */
    enable(): Promise<boolean>;
    schedule(at: Date, title: string, body: string): Promise<void>;
    cancel(): Promise<void>;
  };
}

const no = (): boolean => false;
const nothing = async (): Promise<void> => undefined;

export function webServices(): Services {
  return {
    gameCenter: {
      available: no,
      signIn: async () => false,
      submitBest: nothing,
      unlock: nothing,
      showLeaderboard: nothing,
    },
    review: { available: no, request: nothing },
    reminders: { available: no, enable: async () => false, schedule: nothing, cancel: nothing },
  };
}
