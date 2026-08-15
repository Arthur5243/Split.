/**
 * Score par map CS2 via Liquipedia (wiki communautaire officiel de la
 * scène esport, catégorie "counterstrike"), en PRIORITÉ sur odds-api.io et
 * PandaScore /csgo/games/{id} — cf cs2-routes.js pour l'ordre complet.
 *
 * Contrairement aux autres sources, Liquipedia n'a pas d'API "score par
 * match" toute prête : il faut (1) retrouver la page wiki du TOURNOI, (2)
 * en récupérer le wikitext brut via l'API MediaWiki, (3) parser dedans les
 * blocs `{{Match|...}}` qui listent chaque rencontre. Format confirmé sur de
 * vraies pages (ex. Nuke fini 13-9 côté CT/T mélangés) :
 *
 *   {{Match
 *   |date=August 10, 2026 - 15:00 CEST
 *   |finished=true
 *   |opponent1={{TeamOpponent|natus-vincere}}
 *   |opponent2={{TeamOpponent|team-liquid}}
 *   |map1={{Map|map=Nuke|finished=true|t1firstside=ct|t1t=5|t1ct=8|t2t=4|t2ct=1}}
 *   |map2={{Map|map=Mirage|finished=true|...}}
 *   }}
 *
 * -> score équipe 1 sur une map = t1t + t1ct (manches gagnées côté T +
 * côté CT, cumulées sur toute la map), équipe 2 = t2t + t2ct. Validé y
 * compris sur des maps avec plusieurs prolongations (les totaux tombent
 * juste des deux côtés).
 *
 * RATE LIMIT (règles d'usage de l'API Liquipedia — à respecter strictement
 * pour ne jamais se faire bannir l'IP Railway, ce qui couperait aussi les
 * autres features du site qui appellent Liquipedia) :
 *   - Un User-Agent descriptif est OBLIGATOIRE sur chaque requête (Liquipedia
 *     bloque les User-Agent génériques/absents). Configurable via la
 *     variable d'env LIQUIPEDIA_USER_AGENT (mettre le nom de l'app + une
 *     façon de te contacter, ex. lien du repo GitHub) ; à défaut, un
 *     User-Agent par défaut est utilisé mais DEVRAIT être personnalisé.
 *   - `action=query&list=search` (recherche de page) : max 1 requête/2s.
 *   - `action=parse` (récupération du wikitext complet d'une page) : bien
 *     plus coûteux côté serveur Liquipedia -> max 1 requête/30s, et on
 *     plafonne en plus le nombre de NOUVELLES pages de tournoi allant
 *     jusqu'à cet appel à MAX_NEW_PAGES_PER_CYCLE par cycle d'enrichissement
 *     (cf resetLiquipediaCycleCap, appelée par cs2-routes.js à chaque
 *     nouveau passage). Une fois une page de tournoi récupérée, elle est
 *     gardée en cache mémoire indéfiniment : une page de tournoi déjà
 *     TERMINÉ ne change plus, donc jamais besoin de la re-fetch.
 *   - Si une clé API personnelle Liquipedia existe (cf
 *     https://liquipedia.net/api-access), la passer via LIQUIPEDIA_API_KEY
 *     lève ces plafonds côté serveur ; sans clé, on reste volontairement
 *     très prudent avec les délais ci-dessus.
 *
 * Défensif comme le reste de l'app : équipe non trouvée, page introuvable,
 * plafond de fetch atteint pour ce cycle, wikitext imprévu -> on renvoie
 * `null` à chaque étage et on retente au prochain cycle (cf
 * cs2-history-store.js), jamais de score inventé ni de crash.
 */

const LIQUIPEDIA_BASE = "https://liquipedia.net/counterstrike/api.php";
const LIQUIPEDIA_API_KEY = process.env.LIQUIPEDIA_API_KEY || null;
const USER_AGENT =
  process.env.LIQUIPEDIA_USER_AGENT ||
  "SplitApp/1.0 (score par map CS2 ; contact via variable d'env LIQUIPEDIA_USER_AGENT non configurée)";

function buildHeaders() {
  const headers = { "User-Agent": USER_AGENT, Accept: "application/json" };
  if (LIQUIPEDIA_API_KEY) headers["Authorization"] = "Apikey " + LIQUIPEDIA_API_KEY;
  return headers;
}

// --- Rate limiting (2 files d'attente séparées : recherche vs fetch page) ---
const SEARCH_MIN_SPACING_MS = 2000;
const FETCH_MIN_SPACING_MS = 30_000;
let lastSearchAt = 0;
let lastFetchAt = 0;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttleSearch() {
  const wait = lastSearchAt + SEARCH_MIN_SPACING_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastSearchAt = Date.now();
}

async function throttleFetch() {
  const wait = lastFetchAt + FETCH_MIN_SPACING_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastFetchAt = Date.now();
}

if (!LIQUIPEDIA_API_KEY) {
  console.warn(
    "ℹ️  LIQUIPEDIA_API_KEY n'est pas définie : le score par map CS2 via Liquipedia reste actif mais très prudent " +
      "(1 nouvelle page de tournoi/30s max, " + "3 nouvelles pages max par cycle). Demande une clé sur " +
      "https://liquipedia.net/api-access pour lever ces limites."
  );
}

// --- Cache mémoire des pages de tournoi déjà fetchées (jamais invalidé : ---
// --- une page de tournoi terminé ne change plus) ----------------------
const pageCache = new Map(); // pageTitle -> wikitext
let newPagesFetchedThisCycle = 0;
const MAX_NEW_PAGES_PER_CYCLE = 3;

// À appeler par cs2-routes.js au début de chaque cycle d'enrichissement
// (un "cycle" = un appel à enrichWithMapScores), pour autoriser à nouveau
// jusqu'à MAX_NEW_PAGES_PER_CYCLE nouvelles pages sur ce cycle-ci. Les pages
// déjà en cache restent instantanément disponibles, sans repasser par le
// throttle de 30s.
function resetLiquipediaCycleCap() {
  newPagesFetchedThisCycle = 0;
}

async function searchTournamentPage(query) {
  if (!query) return null;
  await throttleSearch();
  const url =
    LIQUIPEDIA_BASE +
    "?action=query&list=search&srsearch=" +
    encodeURIComponent(query) +
    "&srlimit=3&format=json";
  const res = await fetch(url, { headers: buildHeaders() });
  if (!res.ok) throw new Error("Liquipedia search HTTP " + res.status);
  const json = await res.json();
  const results = (json && json.query && json.query.search) || [];
  return results.length > 0 ? results[0].title : null;
}

async function fetchWikitext(pageTitle) {
  if (pageCache.has(pageTitle)) return pageCache.get(pageTitle);
  if (newPagesFetchedThisCycle >= MAX_NEW_PAGES_PER_CYCLE) return null; // plafond du cycle -> on retentera au prochain
  await throttleFetch();
  const url =
    LIQUIPEDIA_BASE + "?action=parse&page=" + encodeURIComponent(pageTitle) + "&prop=wikitext&format=json";
  const res = await fetch(url, { headers: buildHeaders() });
  if (!res.ok) throw new Error("Liquipedia parse HTTP " + res.status);
  const json = await res.json();
  const wikitext = json && json.parse && json.parse.wikitext && json.parse.wikitext["*"];
  if (!wikitext) return null;
  pageCache.set(pageTitle, wikitext);
  newPagesFetchedThisCycle++;
  return wikitext;
}

// --- Extraction des blocs {{Match|...}} (scan à profondeur d'accolades, --
// --- car ils contiennent des sous-templates imbriqués {{Map|...}}/{{...}}) ---
function extractMatchBlocks(wikitext) {
  const blocks = [];
  const startRe = /\{\{\s*Match\s*[|}]/gi;
  let m;
  while ((m = startRe.exec(wikitext))) {
    const start = m.index;
    let depth = 0;
    let i = start;
    let end = -1;
    while (i < wikitext.length) {
      if (wikitext.startsWith("{{", i)) {
        depth++;
        i += 2;
        continue;
      }
      if (wikitext.startsWith("}}", i)) {
        depth--;
        i += 2;
        if (depth === 0) {
          end = i;
          break;
        }
        continue;
      }
      i++;
    }
    if (end === -1) break; // bloc non refermé (wikitext tronqué/imprévu) -> on s'arrête proprement
    blocks.push(wikitext.slice(start, end));
    startRe.lastIndex = end;
  }
  return blocks;
}

function parseInlineParams(str) {
  const out = {};
  for (const part of str.split("|")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

// `{{TeamOpponent|natus-vincere}}`, `{{1Opponent|NAVI|type=team}}`, ou texte
// brut selon le format du template utilisé sur la page -> on récupère dans
// tous les cas le 1er paramètre positionnel (le nom/slug de l'équipe).
function extractOpponentName(raw) {
  if (!raw) return null;
  raw = raw.trim();
  const tmplMatch = raw.match(/^\{\{\s*[^|}]+\|([^|}]+)/);
  if (tmplMatch) return tmplMatch[1].trim();
  const cleaned = raw.replace(/[{}]/g, "").trim();
  return cleaned || null;
}

function parseMatchBlock(block) {
  const dateMatch = block.match(/\|date=([^|\n]*)/i);
  const opp1Match = block.match(/\|opponent1=(\{\{.*?\}\}|[^|\n]*)/i);
  const opp2Match = block.match(/\|opponent2=(\{\{.*?\}\}|[^|\n]*)/i);

  const maps = [];
  const mapRe = /\|map\d+=\{\{Map\|([^}]*)\}\}/gi;
  let mm;
  while ((mm = mapRe.exec(block))) {
    const params = parseInlineParams(mm[1]);
    if (params.finished !== "true") continue; // map pas (encore) jouée -> on s'arrête d'y attacher un score
    const t1t = Number(params.t1t);
    const t1ct = Number(params.t1ct);
    const t2t = Number(params.t2t);
    const t2ct = Number(params.t2ct);
    if (![t1t, t1ct, t2t, t2ct].every(Number.isFinite)) continue;
    maps.push({ map: params.map || null, score1: t1t + t1ct, score2: t2t + t2ct });
  }

  return {
    opponent1: opp1Match ? extractOpponentName(opp1Match[1]) : null,
    opponent2: opp2Match ? extractOpponentName(opp2Match[1]) : null,
    dateRaw: dateMatch ? dateMatch[1].trim() : null,
    maps,
  };
}

// --- Comparaison de noms d'équipe : normalisation + alias, même logique --
// --- (insensible casse/accents/ponctuation) que vlr-scores.js/oddsapi-scores.js ---
function normalize(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Table volontairement large plutôt qu'exhaustive : les cas où l'abréviation
// n'apparaît PAS comme sous-chaîne contiguë du nom complet (ex. "tl" pour
// "Team Liquid" — le "l" de Team ne compte pas). Les cas simples (Vitality,
// FaZe Clan, Astralis...) se résolvent déjà via la sous-chaîne, pas besoin
// d'entrée ici. À compléter au fil des matchs manqués (cf logs `[liquipedia]`).
const TEAM_ALIASES = {
  navi: "natus vincere",
  tl: "team liquid",
  gl: "gamerlegion",
  vp: "virtus pro",
  mouz: "mousesports",
  eg: "evil geniuses",
  col: "complexity gaming",
  c9: "cloud9",
  og: "og esports",
  big: "big",
  paiN: "pain gaming",
  mibr: "made in brazil",
  "9z": "9z team",
  fnc: "fnatic",
  hero: "heroic",
};

function teamsMatch(nameA, nameB) {
  const a = normalize(nameA);
  const b = normalize(nameB);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const aliasA = TEAM_ALIASES[a];
  const aliasB = TEAM_ALIASES[b];
  const na = aliasA ? normalize(aliasA) : a;
  const nb = aliasB ? normalize(aliasB) : b;
  return na === nb || na.includes(nb) || nb.includes(na);
}

// --- Comparaison de date : tolérance ±1 jour pour absorber les fuseaux ---
// --- horaires (Liquipedia donne l'heure locale du tournoi, PandaScore de l'UTC) ---
const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function parseLiquipediaDate(raw) {
  if (!raw) return null;
  const m = raw.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (month == null) return null;
  return Date.UTC(Number(m[3]), month, Number(m[2]));
}

function datesWithinTolerance(pandaDateStr, liquiTimestamp) {
  if (!pandaDateStr || liquiTimestamp == null) return false;
  const panda = Date.parse(pandaDateStr + "T00:00:00Z");
  if (Number.isNaN(panda)) return false;
  return Math.abs(panda - liquiTimestamp) <= 26 * 60 * 60 * 1000; // 26h : marge d'1 jour + fuseaux
}

// Cherche, parmi tous les blocs Match d'une page de tournoi, celui qui
// oppose team1Name/team2Name (dans un ordre ou l'autre) — départagé par la
// date si plusieurs rencontres existent entre les deux mêmes équipes sur la
// page (poule + playoffs, BO répétés...). Renvoie les maps dans le MÊME
// ordre team1/team2 que fourni en entrée, ou `null` si rien de concluant.
function findMatch(blocks, team1Name, team2Name, dateStr) {
  const candidates = blocks
    .map(parseMatchBlock)
    .filter((b) => {
      if (b.maps.length === 0) return false;
      const orderOk = teamsMatch(b.opponent1, team1Name) && teamsMatch(b.opponent2, team2Name);
      const revOk = teamsMatch(b.opponent1, team2Name) && teamsMatch(b.opponent2, team1Name);
      return orderOk || revOk;
    });
  if (candidates.length === 0) return null;

  let picked = candidates[0];
  if (candidates.length > 1) {
    const withDate = candidates.find((b) => datesWithinTolerance(dateStr, parseLiquipediaDate(b.dateRaw)));
    if (withDate) picked = withDate;
  }

  const sameOrder = teamsMatch(picked.opponent1, team1Name);
  return picked.maps.map((mp) => ({
    map: mp.map,
    score1: sameOrder ? mp.score1 : mp.score2,
    score2: sameOrder ? mp.score2 : mp.score1,
  }));
}

/**
 * Point d'entrée utilisé par cs2-routes.js. Essaie de retrouver la page de
 * tournoi Liquipedia via le nom de ligue PUIS le nom de série (serie) si le
 * 1er ne donne rien, en extrait le wikitext (caché indéfiniment une fois
 * récupéré), puis cherche dedans le match team1 vs team2 à la date donnée.
 *
 * Renvoie [{map, score1, score2}, ...] dans l'ordre team1Name/team2Name, ou
 * `null` si non trouvé/pas encore dispo/plafond de fetch atteint ce cycle.
 */
async function getMapScoresFromLiquipedia(team1Name, team2Name, leagueName, serieName, dateStr) {
  if (!team1Name || !team2Name) return null;

  const queries = [leagueName, serieName].filter(Boolean);
  for (const query of queries) {
    let pageTitle;
    try {
      pageTitle = await searchTournamentPage(query);
    } catch (e) {
      console.log(`[liquipedia] recherche "${query}" → ERREUR:`, e.message);
      continue;
    }
    if (!pageTitle) continue;

    let wikitext;
    try {
      wikitext = await fetchWikitext(pageTitle);
    } catch (e) {
      console.log(`[liquipedia] page "${pageTitle}" → ERREUR:`, e.message);
      continue;
    }
    if (!wikitext) continue; // pas en cache + plafond de nouvelles pages atteint ce cycle -> on retentera au prochain

    const blocks = extractMatchBlocks(wikitext);
    const found = findMatch(blocks, team1Name, team2Name, dateStr);
    if (found) return found;
  }
  return null;
}

export { getMapScoresFromLiquipedia, resetLiquipediaCycleCap };
