/**
 * Intégration OddsPapi pour CS2 — pourcentages de victoire (%) basés sur
 * les cotes de bookmaker, contrairement au système "maison" (historique de
 * victoires) utilisé côté Valorant (calculé côté frontend, cf App.jsx
 * computeMatchOdds). Décision explicite du projet : donner un résultat
 * plus "pro" côté CS2 (les bookmakers, c'est leur métier), quitte à ce que
 * les deux jeux n'aient pas la même logique de calcul.
 *
 * Flux : PandaScore donne le match (2 noms d'équipe + date) -> on cherche
 * le fixture OddsPapi correspondant (par nom + proximité de date) -> on
 * récupère ses cotes -> on les convertit en % (vig retiré) -> on attache
 * odds1/odds2 sur l'objet match, exactement comme le fait déjà le système
 * maison de Valorant, pour que le frontend n'ait rien à changer.
 */

const ODDSPAPI_BASE = "https://api.oddspapi.io/v4";
const ODDSPAPI_API_KEY = process.env.ODDSPAPI_API_KEY;
const CS2_SPORT_ID = 17;
const MATCH_WINNER_MARKET_ID = "171"; // confirmé par test réel : outcome 171 = participant1, 172 = participant2
// Pinnacle = référence du secteur pour la précision des cotes (marge la
// plus faible, les autres bookmakers s'alignent souvent sur ses lignes).
// On l'utilise en priorité ; à défaut on moyenne les bookmakers dispo.
const PREFERRED_BOOKMAKER = "pinnacle";

async function oddspapiFetch(path, params = {}) {
  if (!ODDSPAPI_API_KEY) {
    throw new Error("ODDSPAPI_API_KEY n'est pas définie dans les variables d'environnement Railway.");
  }
  const qs = new URLSearchParams({ ...params, apiKey: ODDSPAPI_API_KEY }).toString();
  const url = `${ODDSPAPI_BASE}${path}?${qs}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OddsPapi ${path} → HTTP ${res.status}`);
  }
  return res.json();
}

// --- Normalisation de noms (même logique que vlr-scores.js/liquipedia-scores.js) ---
function normalize(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
function looseNormalize(s) {
  return normalize(s)
    .replace(/[-.'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Petit cache mémoire pour la liste des fixtures à venir (coûteux à
// re-demander à chaque match individuellement) — 10 min, comme le reste du
// projet. Une seule requête /fixtures couvre tous les matchs du jour.
let fixturesCache = null; // { time, data }
const FIXTURES_CACHE_TTL_MS = 10 * 60 * 1000;

async function getUpcomingCS2Fixtures() {
  if (fixturesCache && Date.now() - fixturesCache.time < FIXTURES_CACHE_TTL_MS) {
    return fixturesCache.data;
  }
  const today = new Date();
  const in7days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const fixtures = await oddspapiFetch("/fixtures", {
    sportId: CS2_SPORT_ID,
    from: fmt(today),
    to: fmt(in7days),
  });
  const data = Array.isArray(fixtures) ? fixtures : [];
  fixturesCache = { time: Date.now(), data };
  return data;
}

// Trouve le fixture OddsPapi correspondant à un match PandaScore, par noms
// d'équipe (tolérant aux variantes) + proximité de date (±1 jour, comme les
// autres sources du projet, pour absorber un éventuel décalage UTC/heure
// locale).
function findFixture(fixtures, team1Name, team2Name, dateStr) {
  const n1 = looseNormalize(team1Name);
  const n2 = looseNormalize(team2Name);
  const targetDate = dateStr ? new Date(dateStr + "T00:00:00").getTime() : null;

  for (const f of fixtures) {
    const fn1 = looseNormalize(f.participant1Name);
    const fn2 = looseNormalize(f.participant2Name);
    const direct = (fn1 === n1 && fn2 === n2) || (fn1.includes(n1) && fn2.includes(n2));
    const swapped = (fn1 === n2 && fn2 === n1) || (fn1.includes(n2) && fn2.includes(n1));
    if (!direct && !swapped) continue;

    if (targetDate && f.startTime) {
      const fixtureDate = new Date(f.startTime).getTime();
      const daysApart = Math.abs(fixtureDate - targetDate) / 86400000;
      if (daysApart > 1) continue;
    }
    return { fixture: f, swapped };
  }
  return null;
}

// Extrait le prix décimal (participant1, participant2) du marché "vainqueur
// du match" pour un bookmaker donné, ou null si absent/suspendu.
function extractMoneylinePrices(bookmakerOdds) {
  const market = bookmakerOdds?.markets?.[MATCH_WINNER_MARKET_ID];
  if (!market || !market.marketActive) return null;
  const price1 = market.outcomes?.["171"]?.players?.["0"]?.price;
  const price2 = market.outcomes?.["172"]?.players?.["0"]?.price;
  if (typeof price1 !== "number" || typeof price2 !== "number") return null;
  return { price1, price2 };
}

// Convertit deux cotes décimales en % normalisés (somme = 100), en retirant
// la marge du bookmaker (l'overround) — sinon les deux % additionnés
// dépassent toujours 100% (c'est la marge du bookmaker).
function pricesToPercentages(price1, price2) {
  const raw1 = 1 / price1;
  const raw2 = 1 / price2;
  const overround = raw1 + raw2;
  const p1 = Math.round((raw1 / overround) * 100);
  return { odds1: p1, odds2: 100 - p1 };
}

// Récupère les % de victoire pour UN match (déjà identifié par ses deux
// noms d'équipe PandaScore + sa date). Renvoie null si le fixture ou les
// cotes ne sont pas trouvées — l'appelant garde alors son repli existant
// (pas de %, ou le système maison) plutôt que d'afficher une erreur.
async function getCS2WinPercentages(team1Name, team2Name, dateStr) {
  if (!team1Name || !team2Name) return null;

  let fixtures;
  try {
    fixtures = await getUpcomingCS2Fixtures();
  } catch (e) {
    console.log(`[oddspapi] fixtures → ERREUR: ${e.message}`);
    return null;
  }

  const found = findFixture(fixtures, team1Name, team2Name, dateStr);
  if (!found) return null;

  let odds;
  try {
    odds = await oddspapiFetch("/odds", { fixtureId: found.fixture.fixtureId });
  } catch (e) {
    console.log(`[oddspapi] odds(${found.fixture.fixtureId}) → ERREUR: ${e.message}`);
    return null;
  }

  const allBookmakers = odds?.bookmakerOdds || {};
  let prices = null;

  // 1) Pinnacle en priorité (référence du secteur).
  if (allBookmakers[PREFERRED_BOOKMAKER]) {
    prices = extractMoneylinePrices(allBookmakers[PREFERRED_BOOKMAKER]);
  }
  // 2) À défaut, moyenne des cotes de tous les bookmakers actifs
  //    disponibles sur ce marché (limite l'effet d'un bookmaker isolé mal
  //    calibré).
  if (!prices) {
    const collected = [];
    for (const name of Object.keys(allBookmakers)) {
      if (!allBookmakers[name]?.bookmakerIsActive) continue;
      const p = extractMoneylinePrices(allBookmakers[name]);
      if (p) collected.push(p);
    }
    if (collected.length > 0) {
      prices = {
        price1: collected.reduce((sum, p) => sum + p.price1, 0) / collected.length,
        price2: collected.reduce((sum, p) => sum + p.price2, 0) / collected.length,
      };
    }
  }
  if (!prices) return null;

  const pct = pricesToPercentages(prices.price1, prices.price2);
  // Si le fixture OddsPapi avait les équipes dans l'ordre inverse de
  // PandaScore, on retourne les % pour que odds1 corresponde bien à
  // team1Name (celui demandé par l'appelant), pas à participant1 côté
  // OddsPapi.
  return found.swapped ? { odds1: pct.odds2, odds2: pct.odds1 } : pct;
}

export { getCS2WinPercentages };
