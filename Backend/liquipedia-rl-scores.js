/**
 * Score par game Rocket League via l'API MediaWiki publique de Liquipedia.
 *
 * Même principe que liquipedia-scores.js (CS2) : on récupère le wikitext
 * d'une page de tournoi, puis on parse les templates {{Match}} / {{Map}}
 * pour en extraire les scores par game (buts).
 *
 * Différence avec CS2 : pas de CT/T sides, juste |score1=X|score2=Y dans
 * chaque {{Map}} (qui représente un game en RL, pas une map).
 *
 * QUOTAS Liquipedia (partagés avec le scraper CS2 si les 2 tournent) :
 *   - 1 requête toutes les 2s
 *   - action=parse : 1 toutes les 30s
 */

const LIQUIPEDIA_BASE = "https://liquipedia.net/rocketleague/api.php";
const LIQUIPEDIA_USER_AGENT = "SplitApp/1.0 (https://github.com/Arthur5243/Split.-main)";

const GENERAL_THROTTLE_MS = 2100;
const PARSE_THROTTLE_MS = 31000;

let lastGeneralCallAt = 0;
let lastParseCallAt = 0;

async function throttleGeneral() {
  const wait = lastGeneralCallAt + GENERAL_THROTTLE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeneralCallAt = Date.now();
}

async function throttleParse() {
  const wait = lastParseCallAt + PARSE_THROTTLE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastParseCallAt = Date.now();
  lastGeneralCallAt = Date.now();
}

async function liquipediaFetch(params, { isParse = false } = {}) {
  if (isParse) await throttleParse();
  else await throttleGeneral();
  const url = LIQUIPEDIA_BASE + "?" + new URLSearchParams({ ...params, format: "json" }).toString();
  const res = await fetch(url, { headers: { "User-Agent": LIQUIPEDIA_USER_AGENT } });
  if (!res.ok) throw new Error("liquipedia-rl HTTP " + res.status);
  return res.json();
}

async function searchTournamentPages(query) {
  const json = await liquipediaFetch({ action: "query", list: "search", srsearch: query, srlimit: "3" });
  const results = json?.query?.search || [];
  return results.map((r) => r.title);
}

const wikitextCache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function getCachedWikitext(key) {
  const hit = wikitextCache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) { wikitextCache.delete(key); return undefined; }
  return hit.value;
}
function setCachedWikitext(key, value) {
  wikitextCache.set(key, { value, at: Date.now() });
}
function invalidateCachedWikitext(key) {
  wikitextCache.delete(key);
}

async function getWikitext(pageTitle, { forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = getCachedWikitext(pageTitle);
    if (cached !== undefined) return cached;
  }
  const json = await liquipediaFetch({ action: "parse", page: pageTitle, prop: "wikitext" }, { isParse: true });
  const text = json?.parse?.wikitext?.["*"];
  if (typeof text !== "string") return null;
  setCachedWikitext(pageTitle, text);
  return text;
}

function extractTemplateBlocks(text, templateName) {
  const blocks = [];
  const marker = "{{" + templateName;
  let i = 0;
  while (true) {
    const start = text.indexOf(marker, i);
    if (start === -1) break;
    const after = text[start + marker.length];
    if (after !== "|" && after !== "}" && after !== "\n") {
      i = start + marker.length;
      continue;
    }
    let depth = 0;
    let j = start;
    while (j < text.length) {
      if (text.startsWith("{{", j)) { depth++; j += 2; }
      else if (text.startsWith("}}", j)) { depth--; j += 2; if (depth === 0) break; }
      else j++;
    }
    blocks.push(text.slice(start, j));
    i = j;
  }
  return blocks;
}

function getParam(block, key) {
  const re = new RegExp("\\|\\s*" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*=");
  const m = re.exec(block);
  if (!m) return null;
  let start = m.index + m[0].length;
  let depth = 0;
  let j = start;
  while (j < block.length) {
    if (block.startsWith("{{", j)) { depth++; j += 2; continue; }
    if (block.startsWith("}}", j)) { if (depth === 0) break; depth--; j += 2; continue; }
    if (block[j] === "|" && depth === 0) break;
    j++;
  }
  return block.slice(start, j).trim();
}

function getTeamOpponentSlug(block, key) {
  const raw = getParam(block, key);
  if (!raw) return null;
  const m = /\{\{TeamOpponent\|([^|}]+)/.exec(raw);
  return m ? m[1].trim() : null;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
function parseLiquipediaDate(raw) {
  if (!raw) return null;
  const m = /([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/.exec(raw);
  if (!m) return null;
  const monthIdx = MONTHS.indexOf(m[1].toLowerCase());
  if (monthIdx === -1) return null;
  const mm = String(monthIdx + 1).padStart(2, "0");
  const dd = String(parseInt(m[2], 10)).padStart(2, "0");
  return `${m[3]}-${mm}-${dd}`;
}

function parseMatchBlock(block) {
  const opponent1 = getTeamOpponentSlug(block, "opponent1");
  const opponent2 = getTeamOpponentSlug(block, "opponent2");
  if (!opponent1 || !opponent2) return null;
  const finished = getParam(block, "finished") === "true";
  const date = parseLiquipediaDate(getParam(block, "date"));

  const games = [];
  for (let n = 1; n <= 9; n++) {
    const mapParam = getParam(block, "map" + n);
    if (!mapParam) break;
    const mapBlockMatch = /\{\{Map[\s\S]*\}\}/.exec(mapParam);
    if (!mapBlockMatch) continue;
    const mapBlock = mapBlockMatch[0];
    const mapFinished = getParam(mapBlock, "finished");
    if (mapFinished && mapFinished !== "true") continue;
    const score1 = parseInt(getParam(mapBlock, "score1"), 10);
    const score2 = parseInt(getParam(mapBlock, "score2"), 10);
    if (Number.isNaN(score1) || Number.isNaN(score2)) continue;
    games.push({ game: "Game " + (games.length + 1), score1, score2 });
  }

  return { opponent1, opponent2, finished, date, games };
}

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

const SLUG_ALIASES = {
  flcn: "team falcons",
  falcons: "team falcons",
  ssg: "spacestation gaming",
  kc: "karmine corp",
  nip: "ninjas in pyjamas",
  "nip.estar": "ninjas in pyjamas",
  g2: "g2 esports",
  vit: "vitality",
  "team vitality": "vitality",
  faze: "faze clan",
  nrg: "nrg esports",
  geng: "gen.g",
  "gen.g": "gen.g",
  optic: "optic gaming",
  dignitas: "dignitas",
  moist: "moist esports",
  furia: "furia esports",
  bds: "team bds",
  endpoint: "endpoint cex",
  col: "complexity gaming",
  complexity: "complexity gaming",
  rng: "renegades",
  "twisted minds": "twisted minds",
  "fut": "fut esports",
  "gentle mates": "gentle mates",
  "shopify rebellion": "shopify rebellion",
  "oxygen esports": "oxygen esports",
  "rule one": "rule one",
  "pioneers": "pioneers",
};

function slugMatchesName(slug, name) {
  if (!slug || !name) return false;
  if (similar(slug, name)) return true;
  const aliasSlug = SLUG_ALIASES[slug.toLowerCase()];
  if (aliasSlug && similar(aliasSlug, name)) return true;
  const aliasName = SLUG_ALIASES[name.toLowerCase()];
  if (aliasName && similar(aliasName, slug)) return true;
  return false;
}

function findMatchInWikitext(wikitext, team1Name, team2Name, dateStr) {
  const blocks = extractTemplateBlocks(wikitext, "Match");
  const candidates = blocks.map(parseMatchBlock).filter(Boolean);
  if (candidates.length === 0) return { games: null, matchCount: 0 };

  const isUsable = (m) => m.finished || m.games.length > 0;
  const sameOrder = candidates.filter(
    (m) => isUsable(m) && slugMatchesName(m.opponent1, team1Name) && slugMatchesName(m.opponent2, team2Name)
  );
  const swapped = candidates.filter(
    (m) => isUsable(m) && slugMatchesName(m.opponent1, team2Name) && slugMatchesName(m.opponent2, team1Name)
  );

  function pickClosestByDate(list) {
    if (list.length <= 1) return list[0] || null;
    if (!dateStr) return list[0];
    return list.reduce((best, cur) => {
      if (!cur.date) return best;
      if (!best || !best.date) return cur;
      return Math.abs(new Date(cur.date) - new Date(dateStr)) < Math.abs(new Date(best.date) - new Date(dateStr)) ? cur : best;
    }, null);
  }

  const found = pickClosestByDate(sameOrder);
  if (found) return { games: found.games.length > 0 ? found.games : null, matchCount: candidates.length };

  const foundSwapped = pickClosestByDate(swapped);
  if (foundSwapped) {
    const games = foundSwapped.games.length > 0
      ? foundSwapped.games.map((g) => ({ game: g.game, score1: g.score2, score2: g.score1 }))
      : null;
    return { games, matchCount: candidates.length };
  }

  return { games: null, matchCount: candidates.length };
}

const INDEX_PAGE_TITLE_RE = /(^|\/)(s|a|b|c|d)-tier tournaments|qualifier tournaments|tier tournaments/i;
const MAX_PAGES_FETCHED_PER_MATCH = 3;

async function getGameScoresFromLiquipedia(team1Name, team2Name, tournamentName, dateStr, serieName) {
  if (!team1Name || !team2Name) return null;

  const queries = [];
  const year = dateStr && /^\d{4}/.test(dateStr) ? dateStr.slice(0, 4) : "";
  const names = [serieName, tournamentName].filter((n) => n && !/^\d{4}$/.test(n.trim()));
  for (const name of names) {
    queries.push(`${team1Name} ${team2Name} ${name} ${year}`.trim());
    queries.push(`${team1Name} ${team2Name} ${name}`);
  }
  queries.push(`${team1Name} ${team2Name}`);

  const seen = new Set();
  const pageTitles = [];
  for (const q of queries) {
    let results;
    try {
      results = await searchTournamentPages(q);
    } catch (e) {
      console.log(`[liquipedia-rl] search(${q}) → ERREUR:`, e.message);
      continue;
    }
    for (const title of results || []) {
      if (seen.has(title)) continue;
      seen.add(title);
      if (INDEX_PAGE_TITLE_RE.test(title)) continue;
      pageTitles.push(title);
    }
  }
  if (pageTitles.length === 0) {
    console.log(`[liquipedia-rl] search(${team1Name} ${team2Name}) → aucune page exploitable`);
    return null;
  }

  let fetchedCount = 0;
  const pagesToInvalidate = [];
  for (const pageTitle of pageTitles) {
    if (fetchedCount >= MAX_PAGES_FETCHED_PER_MATCH) break;
    let wikitext;
    const wasCached = getCachedWikitext(pageTitle) !== undefined;
    try {
      wikitext = await getWikitext(pageTitle);
    } catch (e) {
      console.log(`[liquipedia-rl] wikitext(${pageTitle}) → ERREUR:`, e.message);
      continue;
    }
    if (!wasCached) fetchedCount++;
    if (!wikitext) continue;

    const { games, matchCount } = findMatchInWikitext(wikitext, team1Name, team2Name, dateStr);
    if (games) {
      console.log(`[liquipedia-rl] ${team1Name} vs ${team2Name} → trouvé dans "${pageTitle}" (${games.length} games)`);
      return games;
    }

    if (wasCached && matchCount > 0) pagesToInvalidate.push(pageTitle);
    if (matchCount === 0) {
      console.log(`[liquipedia-rl] "${pageTitle}" → pas de {{Match}} exploitable`);
    } else {
      console.log(`[liquipedia-rl] "${pageTitle}" → ${matchCount} matchs mais aucun ne correspond à ${team1Name} vs ${team2Name}`);
    }
  }

  for (const pt of pagesToInvalidate) {
    invalidateCachedWikitext(pt);
  }

  return null;
}

export { getGameScoresFromLiquipedia, searchTournamentPages, getWikitext, findMatchInWikitext };
