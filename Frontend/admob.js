/**
 * Ad integration for Split.
 *
 * Uses Google AdSense for web/PWA. The interstitial overlay in App.jsx
 * renders a real ad slot when AdSense is loaded, or falls back to
 * the placeholder visual.
 *
 * Setup:
 * 1. Sign up at adsense.google.com
 * 2. Add your publisher ID and slot ID below
 * 3. Google will give you a <script> tag — it's already loaded in index.html
 */

const ADSENSE_PUB_ID = ""; // e.g. "ca-pub-7218024010278471"
const ADSENSE_SLOT_ID = ""; // e.g. "4702203856"

let adReady = false;

function isAdSenseLoaded() {
  return typeof window.adsbygoogle !== "undefined";
}

function initAdMob() {
  if (!ADSENSE_PUB_ID || !ADSENSE_SLOT_ID) {
    console.log("[ads] AdSense not configured, using placeholder");
    return;
  }
  if (isAdSenseLoaded()) {
    adReady = true;
    console.log("[ads] AdSense ready");
  }
}

function getAdSlotHtml() {
  if (!adReady || !ADSENSE_PUB_ID || !ADSENSE_SLOT_ID) return null;
  return { pubId: ADSENSE_PUB_ID, slotId: ADSENSE_SLOT_ID };
}

function isNative() {
  return false;
}

async function showInterstitial() {
  return false;
}

export { initAdMob, showInterstitial, isNative, getAdSlotHtml, ADSENSE_PUB_ID };
