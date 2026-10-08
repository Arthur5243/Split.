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

// Les pubs Monetag (Vignette) sont injectées par leur script, hors de #root,
// en calque plein écran. On ne peut pas modifier leur contenu : on détecte
// ce calque et on affiche par-dessus un bandeau "PUBLICITÉ" tant qu'il est là.
let adLabelWatching = false;
function watchAdOverlays() {
  if (adLabelWatching || typeof MutationObserver === "undefined") return;
  adLabelWatching = true;
  let label = null;
  let scheduled = false;

  const isAdOverlay = (el) => {
    if (!(el instanceof HTMLElement) || el === label || el.id === "root") return false;
    if (["SCRIPT", "STYLE", "LINK", "NOSCRIPT", "HEAD", "BODY"].includes(el.tagName)) return false;
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width >= window.innerWidth * 0.6 && r.height >= window.innerHeight * 0.4;
  };

  const sync = () => {
    scheduled = false;
    const candidates = [...document.documentElement.children, ...(document.body ? document.body.children : [])];
    const hasOverlay = candidates.some(isAdOverlay);
    if (hasOverlay && !label) {
      label = document.createElement("div");
      label.setAttribute("role", "note");
      label.setAttribute("aria-label", "Publicité : annonce d'un partenaire, pas de Split");
      Object.assign(label.style, {
        position: "fixed", top: "calc(env(safe-area-inset-top, 0px) + 10px)", left: "50%", transform: "translateX(-50%)",
        zIndex: "2147483647", pointerEvents: "none", textAlign: "center", whiteSpace: "nowrap",
        background: "rgba(0,0,0,0.88)", border: "1px solid rgba(204,247,29,0.5)",
        borderRadius: "12px", padding: "6px 14px", boxShadow: "0 2px 12px rgba(0,0,0,0.6)",
        font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      });
      const title = document.createElement("div");
      title.textContent = "PUBLICITÉ";
      Object.assign(title.style, { color: "#CCF71D", font: "900 11px/1.2 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", letterSpacing: "0.12em" });
      const sub = document.createElement("div");
      sub.textContent = "Annonce d'un partenaire, pas de Split";
      Object.assign(sub.style, { color: "#bbb", font: "600 10px/1.3 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", marginTop: "2px" });
      label.append(title, sub);
      document.documentElement.appendChild(label);
    } else if (!hasOverlay && label) {
      label.remove();
      label = null;
    }
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "hidden"] });
  schedule();
}

// Vignette Monetag (format interstitiel) : son script est injecté seulement
// après VIGNETTE_DELAY_MS d'utilisation, pour qu'aucune pub n'apparaisse
// juste après l'ouverture de l'app.
const VIGNETTE_ZONE = "11985749";
const VIGNETTE_SRC = "https://n6wxm.com/vignette.min.js";
const VIGNETTE_DELAY_MS = 3 * 60 * 1000;
let vignetteScheduled = false;
function scheduleVignette() {
  if (vignetteScheduled) return;
  vignetteScheduled = true;
  setTimeout(() => {
    const s = document.createElement("script");
    s.dataset.zone = VIGNETTE_ZONE;
    s.src = VIGNETTE_SRC;
    (document.body || document.documentElement).appendChild(s);
  }, VIGNETTE_DELAY_MS);
}

function initAdMob() {
  watchAdOverlays();
  scheduleVignette();
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
