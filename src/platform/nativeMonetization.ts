// AdMob (rewarded + interstitial, with UMP consent and ATT first) and RevenueCat (Remove ads).
// Loaded only inside the native app.
import {
  AdMob,
  AdmobConsentStatus,
  InterstitialAdPluginEvents,
  RewardAdPluginEvents,
} from '@capacitor-community/admob';
import { Purchases } from '@revenuecat/purchases-capacitor';
import { ADS, PURCHASES } from '../config';
import type { Monetization } from './monetization';

export function nativeMonetization(): Monetization {
  let started: Promise<void> | null = null;
  let ready = false;
  let rewardedLoaded = false;
  let interstitialLoaded = false;
  let privacyRequired = false;

  const loadRewarded = (): void => {
    if (!ready || rewardedLoaded) return;
    void AdMob.prepareRewardVideoAd({ adId: ADS.rewardedId, isTesting: ADS.testMode })
      .then(() => {
        rewardedLoaded = true;
      })
      .catch(() => undefined);
  };
  const loadInterstitial = (): void => {
    if (!ready || interstitialLoaded) return;
    void AdMob.prepareInterstitial({ adId: ADS.interstitialId, isTesting: ADS.testMode })
      .then(() => {
        interstitialLoaded = true;
      })
      .catch(() => undefined);
  };

  /** Consent first (EU), then ATT, then the SDK. Ads only load if consent allows. */
  const start = async (): Promise<void> => {
    try {
      let consent = await AdMob.requestConsentInfo();
      if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) {
        consent = await AdMob.showConsentForm();
      }
      // the enum isn't exported by the plugin; its value is the string 'REQUIRED'
      privacyRequired = String(consent.privacyOptionsRequirementStatus) === 'REQUIRED';
      if (!consent.canRequestAds) return;
      const att = await AdMob.trackingAuthorizationStatus();
      if (att.status === 'notDetermined') await AdMob.requestTrackingAuthorization();
      await AdMob.initialize({ initializeForTesting: ADS.testMode });
      ready = true;
      loadRewarded();
      loadInterstitial();
    } catch {
      ready = false;
    }
  };

  return {
    ads: {
      start: () => (started ??= start()),
      rewardedReady: () => ready && rewardedLoaded,
      showRewarded: async () => {
        if (!ready || !rewardedLoaded) return false;
        rewardedLoaded = false;
        let earned = false;
        const onReward = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
          earned = true;
        });
        await new Promise<void>((resolve) => {
          const handles: Promise<{ remove: () => Promise<void> }>[] = [];
          const finish = (): void => {
            for (const h of handles) void h.then((x) => x.remove());
            resolve();
          };
          handles.push(AdMob.addListener(RewardAdPluginEvents.Dismissed, finish));
          handles.push(AdMob.addListener(RewardAdPluginEvents.FailedToShow, finish));
          AdMob.showRewardVideoAd().catch(finish);
        });
        await onReward.remove();
        loadRewarded();
        return earned;
      },
      interstitialReady: () => ready && interstitialLoaded,
      showInterstitial: async () => {
        if (!ready || !interstitialLoaded) return;
        interstitialLoaded = false;
        await new Promise<void>((resolve) => {
          const handles: Promise<{ remove: () => Promise<void> }>[] = [];
          const finish = (): void => {
            for (const h of handles) void h.then((x) => x.remove());
            resolve();
          };
          handles.push(AdMob.addListener(InterstitialAdPluginEvents.Dismissed, finish));
          handles.push(AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, finish));
          AdMob.showInterstitial().catch(finish);
        });
        loadInterstitial();
      },
      privacyOptionsRequired: () => privacyRequired,
      showPrivacyOptions: async () => {
        await AdMob.showPrivacyOptionsForm().catch(() => undefined);
      },
    },
    purchases: purchases(),
  };
}

function purchases(): Monetization['purchases'] {
  const enabled = PURCHASES.revenueCatKey.length > 0;
  let configured: Promise<void> | null = null;
  const configure = (): Promise<void> =>
    (configured ??= Purchases.configure({ apiKey: PURCHASES.revenueCatKey }).catch(() => undefined));
  const hasEntitlement = (info: { entitlements: { active: Record<string, unknown> } }): boolean =>
    PURCHASES.entitlement in info.entitlements.active;
  const removeAdsPackage = async () => {
    const offerings = await Purchases.getOfferings();
    return (
      offerings.current?.availablePackages.find((p) => p.product.identifier === PURCHASES.productId) ??
      offerings.current?.availablePackages[0] ??
      null
    );
  };
  return {
    available: () => enabled,
    price: async () => {
      if (!enabled) return null;
      try {
        await configure();
        return (await removeAdsPackage())?.product.priceString ?? null;
      } catch {
        return null;
      }
    },
    owned: async () => {
      if (!enabled) return false;
      try {
        await configure();
        return hasEntitlement((await Purchases.getCustomerInfo()).customerInfo);
      } catch {
        return false;
      }
    },
    buy: async () => {
      if (!enabled) return false;
      try {
        await configure();
        const pkg = await removeAdsPackage();
        if (!pkg) return false;
        const result = await Purchases.purchasePackage({ aPackage: pkg });
        return hasEntitlement(result.customerInfo);
      } catch {
        // cancelled or failed: nothing changes
        return false;
      }
    },
    restore: async () => {
      if (!enabled) return false;
      try {
        await configure();
        return hasEntitlement((await Purchases.restorePurchases()).customerInfo);
      } catch {
        return false;
      }
    },
  };
}
