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

const ADSENSE_PUB_ID = "ca-pub-7218024010278471";
const ADSENSE_SLOT_ID = "";

let adReady = false;

function isAdSenseLoaded() {
  return typeof window.adsbygoogle !== "undefined";
}

function initAdMob() {
  if (!ADSENSE_PUB_ID) {
    console.log("[ads] AdSense not configured, using placeholder");
    return;
  }
  if (isAdSenseLoaded()) {
    adReady = true;
    console.log("[ads] AdSense ready");
  } else {
    const check = setInterval(() => {
      if (isAdSenseLoaded()) {
        adReady = true;
        console.log("[ads] AdSense ready (delayed)");
        clearInterval(check);
      }
    }, 1000);
    setTimeout(() => clearInterval(check), 10000);
  }
}

function getAdSlotHtml() {
  if (!adReady || !ADSENSE_PUB_ID) return null;
  return { pubId: ADSENSE_PUB_ID, slotId: ADSENSE_SLOT_ID || "" };
}

function isNative() {
  return false;
}

async function showInterstitial() {
  return false;
}

export { initAdMob, showInterstitial, isNative, getAdSlotHtml, ADSENSE_PUB_ID };
