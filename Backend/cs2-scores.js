/**
 * Tout ce qui est spécifique à PandaScore/CS2 : fetch (avec retry 429 +
 * petit cache mémoire, même logique que server.js pour Valorant), score par
 * map, et classification des ÉQUIPES en région (Europe / Americas / Asia).
 *
 * Différence majeure avec Valorant (vlr-scores.js) : PandaScore fournit
 * lui-même le score par manche (13-9 etc.) pour CS2 via /csgo/games/{id},
 * simplement verrouillé derrière un round de requêtes supplémentaire (une
 * par map) — contrairement à Valorant où cette donnée n'existe carrément pas
 * chez PandaScore et nécessite un pont externe vers vlr.gg. Donc ici : pas
 * de scraping tiers, juste PandaScore lui-même, deux niveaux d'appel.
 *
 * Tout est défensif comme côté Valorant : un champ absent/imprévu -> on
 * renvoie `null` et on retente plus tard (cf cs2-history-store.js), jamais
 * de crash, jamais de score inventé.
 */

const PANDASCORE_API_KEY = process.env.PANDASCORE_API_KEY;
const PANDASCORE_BASE = "https://api.pandascore.co";
// CS2 utilise le préfixe historique /csgo/ dans toute l'API PandaScore (pas
// de préfixe /cs2/ — cf leur doc "Counter-Strike 2 migration guide").
const CS2_SLUG = "csgo";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pandaFetch(path, attempt = 0) {
  const res = await fetch(PANDASCORE_BASE + path, {
    headers: { Authorization: "Bearer " + PANDASCORE_API_KEY },
  });
  if (res.status === 429 && attempt < 4) {
    await sleep(800 * (attempt + 1));
    return pandaFetch(path, attempt + 1);
  }
  if (!res.ok) {
    throw new Error("PandaScore HTTP " + res.status + " (" + path + ")");
  }
  return res.json();
}

const cache = new Map();
async function cachedFetch(key, path) {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.time < 60_000) return hit.data;
  const data = await pandaFetch(path);
  cache.set(key, { data, time: now });
  return data;
}

async function mapWithConcurrency(items, limit, fn) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// --- Région par équipe (Europe / Americas / Asia) ---------------------
// Contrairement à VCT (Valorant), les tournois CS2 (Majors, IEM, BLAST...)
// ne sont pas des ligues fermées par région : les stages finaux mélangent
// des équipes de partout (cf. RMR Valve — Europe / Americas / Asia). La
// région se classe donc par ÉQUIPE (via son pays, champ `location` renvoyé
// par PandaScore, code ISO 3166-1 alpha-2), pas par match/tournoi.
// Liste volontairement large plutôt qu'exhaustive : un pays absent retombe
// simplement sur aucune région connue (l'équipe reste affichée quand même).
const COUNTRY_REGION = {
  // Europe
  FR: "EUROPE", DE: "EUROPE", GB: "EUROPE", UK: "EUROPE", ES: "EUROPE", IT: "EUROPE", PL: "EUROPE",
  PT: "EUROPE", DK: "EUROPE", SE: "EUROPE", NO: "EUROPE", FI: "EUROPE", NL: "EUROPE", BE: "EUROPE",
  CH: "EUROPE", AT: "EUROPE", UA: "EUROPE", RU: "EUROPE", BY: "EUROPE", RO: "EUROPE", BG: "EUROPE",
  CZ: "EUROPE", SK: "EUROPE", HU: "EUROPE", GR: "EUROPE", RS: "EUROPE", HR: "EUROPE", SI: "EUROPE",
  LT: "EUROPE", LV: "EUROPE", EE: "EUROPE", IE: "EUROPE", IS: "EUROPE", MK: "EUROPE", BA: "EUROPE",
  MD: "EUROPE", KZ: "EUROPE", LU: "EUROPE", CY: "EUROPE", AL: "EUROPE", ME: "EUROPE",
  // Americas
  US: "AMERICAS", CA: "AMERICAS", BR: "AMERICAS", AR: "AMERICAS", CL: "AMERICAS", PE: "AMERICAS",
  UY: "AMERICAS", MX: "AMERICAS", CO: "AMERICAS", EC: "AMERICAS", PY: "AMERICAS", BO: "AMERICAS",
  VE: "AMERICAS", CR: "AMERICAS", PA: "AMERICAS", DO: "AMERICAS",
  // Asia (+ Océanie et Moyen-Orient, regroupées avec l'Asie côté circuit CS2 "APAC/MESA")
  CN: "ASIA", KR: "ASIA", JP: "ASIA", MN: "ASIA", IN: "ASIA", ID: "ASIA", MY: "ASIA", SG: "ASIA",
  TH: "ASIA", PH: "ASIA", VN: "ASIA", AU: "ASIA", NZ: "ASIA", TW: "ASIA", HK: "ASIA", SA: "ASIA",
  JO: "ASIA", TR: "ASIA", AE: "ASIA", QA: "ASIA", KW: "ASIA", PK: "ASIA", IL: "ASIA", LB: "ASIA",
};

function classifyTeamRegion(location) {
  if (!location) return null;
  return COUNTRY_REGION[String(location).toUpperCase()] || null;
}

// --- Score par map (round score, ex: 13-9) via PandaScore lui-même -----
// Pour chaque `game` (map) d'un match terminé, /csgo/games/{id} renvoie
// (entre autres) les objets `counter_terrorists` / `terrorists`, chacun
// avec `id` (id équipe), `name`, et `round_score` (score de manches cumulé
// sur cette map, tous camps confondus). On rattache chaque score au bon
// t1/t2 via l'id d'équipe, comme le fait déjà server.js avec `results`.
async function fetchGameMapScore(gameId, team1Id, team2Id) {
  let game;
  try {
    game = await pandaFetch("/" + CS2_SLUG + "/games/" + gameId);
  } catch (e) {
    return null; // pas encore dispo / erreur réseau -> on retentera plus tard
  }
  if (!game || game.finished !== true) return null;

  const sides = [game.counter_terrorists, game.terrorists].filter(Boolean);
  const side1 = sides.find((s) => String(s.id) === String(team1Id));
  const side2 = sides.find((s) => String(s.id) === String(team2Id));
  if (!side1 || !side2 || side1.round_score == null || side2.round_score == null) return null;

  return {
    map: (game.map && (game.map.name || game.map.slug)) || null,
    score1: side1.round_score,
    score2: side2.round_score,
  };
}

// Récupère le score par map de TOUTES les maps jouées d'un match terminé.
// `gamesMeta` = m.games tel que renvoyé par PandaScore sur le match lui-même
// (liste des ids de map avec leur `status`) ; on ne va chercher le détail
// que pour celles marquées "finished", dans l'ordre (position croissante).
async function getMapScoresForMatch(match, team1Id, team2Id) {
  const games = Array.isArray(match.games) ? match.games : [];
  const playedGames = games
    .filter((g) => g && g.status === "finished")
    .sort((a, b) => (a.position || 0) - (b.position || 0));
  if (playedGames.length === 0) return null;

  const results = new Array(playedGames.length).fill(null);
  await mapWithConcurrency(playedGames, 2, async (g) => {
    const idx = playedGames.indexOf(g);
    results[idx] = await fetchGameMapScore(g.id, team1Id, team2Id);
  });

  if (results.some((r) => r === null)) return null; // incomplet -> on retente le lot entier plus tard
  return results;
}

export {
  pandaFetch,
  cachedFetch,
  mapWithConcurrency,
  sleep,
  classifyTeamRegion,
  getMapScoresForMatch,
  CS2_SLUG,
  PANDASCORE_API_KEY,
};
