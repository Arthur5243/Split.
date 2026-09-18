/**
 * AdMob wrapper for Capacitor.
 * When running inside Capacitor (Android APK), uses real AdMob interstitials.
 * When running in browser, falls back to the built-in placeholder.
 *
 * Setup:
 * 1. npm install @capacitor-community/admob
 * 2. Set your ad unit ID below
 * 3. Build: npm run build && npx cap sync android
 */

const INTERSTITIAL_AD_UNIT = "ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ"; // Replace with your real ad unit ID
const TEST_AD_UNIT = "ca-app-pub-3940256099942544/1033173712"; // Google test interstitial

let admobPlugin = null;
let initialized = false;

function isNative() {
  return window.Capacitor?.isNativePlatform?.() === true;
}

async function init() {
  if (initialized || !isNative()) return false;
  try {
    const mod = await import("@capacitor-community/admob");
    admobPlugin = mod.AdMob;
    await admobPlugin.initialize({ initializeForTesting: false });
    initialized = true;
    console.log("[admob] initialized");
    return true;
  } catch (e) {
    console.warn("[admob] init failed:", e.message);
    return false;
  }
}

async function showInterstitial() {
  if (!initialized || !admobPlugin) return false;
  try {
    await admobPlugin.prepareInterstitial({
      adId: INTERSTITIAL_AD_UNIT === "ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ"
        ? TEST_AD_UNIT
        : INTERSTITIAL_AD_UNIT,
      isTesting: INTERSTITIAL_AD_UNIT === "ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ",
    });
    await admobPlugin.showInterstitial();
    console.log("[admob] interstitial shown");
    return true;
  } catch (e) {
    console.warn("[admob] interstitial error:", e.message);
    return false;
  }
}

export { init as initAdMob, showInterstitial, isNative };
