/**
 * Score par map CS2 via odds-api.io (déjà utilisé dans ce projet pour les
 * cotes Valorant historiques, cf odds.js — même clé ODDS_API_KEY réutilisée
 * ici, aucune nouvelle inscription nécessaire).
 *
 * Contrairement aux tentatives précédentes (hltv-next bloqué par Cloudflare,
 * hltv-match-api qui nécessite un vrai navigateur + un solveur de captcha
 * payant) : odds-api.io est un fournisseur de données officiel avec une API
 * REST classique, pas de scraping, pas de navigateur, pas de captcha.
 *
 * D'après leur doc (docs.odds-api.io) : chaque event peut porter un objet
 * `scores` avec des clés de période `map1`, `map2`, ... spécifiquement pour
 * l'esport (score par map). On cherche l'event correspondant à notre match
 * PandaScore via /events/search (par nom d'équipe), puis on récupère le
 * détail complet via /events/{id} pour lire ces scores.
 *
 * Défensif comme le reste de l'app : clé absente, event introuvable, champ
 * scores absent -> on renvoie `null`, jamais un score inventé. L'appelant
 * (cs2-routes.js) retombe alors sur son repli PandaScore existant.
 */

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_BASE = "https://api.odds-api.io/v3";

if (!ODDS_API_KEY) {
  console.warn(
    "ℹ️  ODDS_API_KEY n'est pas définie : le score par map CS2 via odds-api.io est désactivé (repli sur PandaScore/csgo/games)."
  );
}

// Même comparateur que vlr-scores.js/cs2-scores.js (insensible à la casse/accents).
function similar(a, b) {
  const clean = (s) =>
    (s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const ca = clean(a);
  const cb = clean(b);
  if (!ca || !cb) return false;
  return ca === cb || ca.includes(cb) || cb.includes(ca);
}

// Le champ qui identifie le jeu peut s'appeler league/title/game/category
// selon les events (même incertitude défensive que isValorantEvent dans
// odds.js) : on reste large sur les mots-clés CS2/CS:GO/Counter-Strike.
function isCs2Event(ev) {
  const haystack = [ev.league, ev.title, ev.game, ev.sport_title, ev.category]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    haystack.includes("cs2") ||
    haystack.includes("csgo") ||
    haystack.includes("cs:go") ||
    haystack.includes("counter-strike") ||
    haystack.includes("counter strike")
  );
}

async function searchEvents(query) {
  const url = `${ODDS_BASE}/events/search?query=${encodeURIComponent(query)}&apiKey=${ODDS_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("odds-api.io /events/search HTTP " + res.status);
  const json = await res.json();
  return Array.isArray(json) ? json : json.data || json.events || [];
}

async function getEventDetail(eventId) {
  const url = `${ODDS_BASE}/events/${eventId}?apiKey=${ODDS_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("odds-api.io /events/" + eventId + " HTTP " + res.status);
  return res.json();
}

/**
 * Cherche le score par map d'un match CS2 sur odds-api.io, à partir des
 * noms d'équipe PandaScore. Renvoie un tableau [{map, score1, score2}, ...]
 * — score1/score2 dans le MÊME ordre que team1Name/team2Name passés en
 * paramètre — ou `null` si non trouvé/erreur/pas de données. Jamais de
 * score inventé.
 */
async function getMapScoresFromOddsApi(team1Name, team2Name) {
  if (!ODDS_API_KEY || !team1Name || !team2Name) return null;

  let events;
  try {
    events = await searchEvents(team1Name);
  } catch (e) {
    console.log(`[oddsapi] events/search(${team1Name}) → ERREUR:`, e.message);
    return null;
  }
  if (!Array.isArray(events) || events.length === 0) {
    console.log(`[oddsapi] events/search(${team1Name}) → 0 résultat`);
    return null;
  }

  const found = events.find((ev) => {
    if (!isCs2Event(ev)) return false;
    const home = ev.home || (ev.participants && ev.participants[0]);
    const away = ev.away || (ev.participants && ev.participants[1]);
    return (
      (similar(home, team1Name) && similar(away, team2Name)) ||
      (similar(home, team2Name) && similar(away, team1Name))
    );
  });
  if (!found) {
    console.log(
      `[oddsapi] aucune correspondance CS2 pour ${team1Name} vs ${team2Name} parmi ${events.length} résultats : ` +
        events.map((ev) => (ev.home || "?") + " vs " + (ev.away || "?") + " [" + (ev.league || ev.title || "?") + "]").join(" | ")
    );
    return null;
  }

  let detail;
  try {
    detail = await getEventDetail(found.id);
  } catch (e) {
    console.log(`[oddsapi] events/${found.id} → ERREUR:`, e.message);
    return null;
  }

  const scores = detail && detail.scores;
  const periods = scores && scores.periods;
  if (!periods) {
    console.log(`[oddsapi] event ${found.id} (${team1Name} vs ${team2Name}) → pas de scores.periods disponibles`);
    return null;
  }

  const home = detail.home || found.home;
  const sameOrder = similar(home, team1Name);

  const mapKeys = Object.keys(periods)
    .filter((k) => /^map\d+$/.test(k))
    .sort((a, b) => parseInt(a.slice(3), 10) - parseInt(b.slice(3), 10));

  const maps = mapKeys
    .map((k) => periods[k])
    .filter((p) => p && p.home != null && p.away != null)
    .map((p) => ({
      map: null, // odds-api.io ne fournit pas le nom de la map, juste le score
      score1: sameOrder ? p.home : p.away,
      score2: sameOrder ? p.away : p.home,
    }));

  return maps.length > 0 ? maps : null;
}

export { getMapScoresFromOddsApi };
