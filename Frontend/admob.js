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
// ce calque, on repère la fenêtre de pub à l'intérieur et on l'entoure d'un
// grand cadre "PUB" (plus grand que la pop-up) tant qu'elle est affichée.
let adLabelWatching = false;
// Padding du cadre PUB autour de la pub : négatif = cadre à l'intérieur du
// calque (collé à la pop-up). L'utilisateur veut un cadre qui "colle" vraiment
// autour, pas un gros halo qui dépasse.
const AD_FRAME_PAD = -2;
function watchAdOverlays() {
  if (adLabelWatching || typeof MutationObserver === "undefined") return;
  adLabelWatching = true;
  let frame = null;
  let scheduled = false;
  let tracking = false;
  let lastClosedAt = 0;

  const isVisible = (el) => {
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) !== 0;
  };

  const isAdOverlay = (el) => {
    if (!(el instanceof HTMLElement) || el === frame || el.id === "root") return false;
    if (["SCRIPT", "STYLE", "LINK", "NOSCRIPT", "HEAD", "BODY"].includes(el.tagName)) return false;
    if (getComputedStyle(el).position !== "fixed" || !isVisible(el)) return false;
    const r = el.getBoundingClientRect();
    return r.width >= window.innerWidth * 0.6 && r.height >= window.innerHeight * 0.4;
  };

  const findOverlay = () => {
    const candidates = [...document.documentElement.children, ...(document.body ? document.body.children : [])];
    return candidates.find(isAdOverlay) || null;
  };

  // On encadre directement le calque pub lui-même (bounding box), pas un
  // élément interne : Monetag Vignette est quasi plein écran, donc l'inner
  // "popup" détecté par heuristique était systématiquement bien plus petit
  // que l'affiche réelle → cadre trop petit. On prend aussi le plus grand
  // iframe/div enfant si significativement différent (cas où Monetag met un
  // backdrop + une pop-up centrée).
  const findAdBox = (overlay) => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const overlayRect = overlay.getBoundingClientRect();
    // Si l'overlay est presque plein écran, cherche une pop-up centrée dedans
    // (iframe ou div) nettement plus petite que le viewport pour entourer
    // uniquement l'affiche, pas tout le fond assombri.
    if (overlayRect.width >= vw * 0.9 && overlayRect.height >= vh * 0.9) {
      let best = null, bestArea = 0;
      for (const el of overlay.querySelectorAll("iframe, div, section, article")) {
        if (!isVisible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 240 || r.height < 160) continue;
        if (r.width >= vw * 0.95 || r.height >= vh * 0.95) continue;
        const area = r.width * r.height;
        if (area > bestArea) { best = r; bestArea = area; }
      }
      if (best) return best;
    }
    return overlayRect;
  };

  const buildFrame = () => {
    const f = document.createElement("div");
    f.setAttribute("role", "note");
    f.setAttribute("aria-label", "Publicité : annonce d'un partenaire, pas de Split");
    Object.assign(f.style, {
      position: "fixed", zIndex: "2147483647", pointerEvents: "none", boxSizing: "border-box",
      border: "3px solid #CCF71D", borderRadius: "14px",
      boxShadow: "0 0 0 2px rgba(0,0,0,0.85), 0 0 20px rgba(204,247,29,0.45)",
    });
    const tab = document.createElement("div");
    Object.assign(tab.style, {
      position: "absolute", left: "50%", top: "0", transform: "translate(-50%, -100%)",
      background: "#CCF71D", color: "#000", borderRadius: "10px 10px 0 0", padding: "4px 16px 3px",
      textAlign: "center", whiteSpace: "nowrap", boxShadow: "0 -2px 10px rgba(0,0,0,0.5)",
    });
    const title = document.createElement("div");
    title.textContent = "PUB";
    Object.assign(title.style, { font: "900 16px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", letterSpacing: "0.18em" });
    const sub = document.createElement("div");
    sub.textContent = "Annonce partenaire";
    Object.assign(sub.style, { font: "700 9px/1.3 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", marginTop: "1px" });
    tab.append(title, sub);
    f.append(tab);
    return f;
  };

  const place = (overlay) => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const box = findAdBox(overlay);
    const tabH = 36;
    const left = Math.max(2, box.left - AD_FRAME_PAD);
    const top = Math.max(2 + tabH, box.top - AD_FRAME_PAD);
    const right = Math.min(vw - 2, box.left + box.width + AD_FRAME_PAD);
    const bottom = Math.min(vh - 2, box.top + box.height + AD_FRAME_PAD);
    Object.assign(frame.style, { left: `${left}px`, top: `${top}px`, width: `${Math.max(80, right - left)}px`, height: `${Math.max(60, bottom - top)}px` });
  };

  const track = () => {
    const overlay = findOverlay();
    if (!overlay) {
      if (tracking) { tracking = false; lastClosedAt = Date.now(); scheduleReinject(); }
      if (frame) { frame.remove(); frame = null; }
      return;
    }
    if (!frame) frame = buildFrame();
    if (frame.parentNode !== document.documentElement || frame !== document.documentElement.lastElementChild) document.documentElement.appendChild(frame);
    place(overlay);
    requestAnimationFrame(track);
  };

  const sync = () => {
    scheduled = false;
    if (!tracking && findOverlay()) {
      tracking = true;
      track();
    }
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "hidden"] });
  schedule();

  // Expose un hook pour que scheduleReinject sache si on est en train de
  // regarder une pub : l'anti-rebond du script Monetag doit se faire sur le
  // moment où la pub se ferme, pas sur l'heure d'ouverture.
  watchAdOverlays._getLastClosedAt = () => lastClosedAt;
  watchAdOverlays._isTracking = () => tracking;
}

// Re-injecte le script Monetag Vignette REINJECT_DELAY_MS après la fermeture
// de la pub précédente. Monetag conserve son propre anti-rebond côté serveur,
// donc on peut sans risque réinjecter : si c'est trop tôt pour Monetag, rien
// ne s'affichera.
const VIGNETTE_SRC = "https://n6wxm.com/vignette.min.js";
const VIGNETTE_ZONE = "11993926";
const REINJECT_DELAY_MS = 3 * 60 * 1000;
let reinjectTimer = null;
function reinjectVignette() {
  const s = document.createElement("script");
  s.dataset.zone = VIGNETTE_ZONE;
  s.src = VIGNETTE_SRC;
  (document.body || document.documentElement).appendChild(s);
}
function scheduleReinject() {
  if (reinjectTimer) clearTimeout(reinjectTimer);
  reinjectTimer = setTimeout(() => {
    // Si une pub est déjà affichée (rare : le user a rouvert avant), on
    // reporte.
    if (watchAdOverlays._isTracking && watchAdOverlays._isTracking()) {
      scheduleReinject();
      return;
    }
    reinjectVignette();
  }, REINJECT_DELAY_MS);
}

// Vignette Monetag (zone 11993926) : désormais chargée par le snippet officiel
// dans `index.html` (requis par Monetag pour que la vérification de domaine
// passe). Monetag applique ses propres règles de fréquence côté serveur, on
// n'a plus à retarder le chargement du script côté client.
function scheduleVignette() { /* no-op : voir index.html */ }

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
