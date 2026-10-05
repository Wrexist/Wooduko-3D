/**
 * Ads + "Remove ads" behind one adapter. The web build has neither (everything unavailable);
 * the native implementation (AdMob + RevenueCat) lives in nativeMonetization.ts.
 */
export interface Monetization {
  readonly ads: {
    /**
     * Consent (Google UMP, EU) → App Tracking Transparency → SDK init, in that order, then preload.
     * Safe to call more than once.
     */
    start(): Promise<void>;
    rewardedReady(): boolean;
    /** Resolves true only if the player watched to the reward. */
    showRewarded(): Promise<boolean>;
    interstitialReady(): boolean;
    showInterstitial(): Promise<void>;
    /** UMP requires a way to change consent later (shown in Settings when true). */
    privacyOptionsRequired(): boolean;
    showPrivacyOptions(): Promise<void>;
  };
  readonly purchases: {
    available(): boolean;
    /** Localised price of Remove ads, or null if the store didn't answer. */
    price(): Promise<string | null>;
    /** Does the player own Remove ads? (asks the store; cached locally by the caller) */
    owned(): Promise<boolean>;
    /** Resolves true if Remove ads is owned afterwards. */
    buy(): Promise<boolean>;
    restore(): Promise<boolean>;
  };
}

const no = (): boolean => false;
const nothing = async (): Promise<void> => undefined;

export function webMonetization(): Monetization {
  return {
    ads: {
      start: nothing,
      rewardedReady: no,
      showRewarded: async () => false,
      interstitialReady: no,
      showInterstitial: nothing,
      privacyOptionsRequired: no,
      showPrivacyOptions: nothing,
    },
    purchases: {
      available: no,
      price: async () => null,
      owned: async () => false,
      buy: async () => false,
      restore: async () => false,
    },
  };
}
