/**
 * Scores par map Valorant via l'API MediaWiki publique de Liquipedia.
 * Pattern identique à liquipedia-scores.js (CS2) mais adapté aux templates
 * Valorant, plus simples : {{Map|map=X|score1=13|score2=8|finished=true}}
 * (pas de séparation CT/T).
 *
 * Mêmes quotas : 1 req/2s général, 1 action=parse/30s. Cache wikitext
 * partagé avec le CS2 store (SQLite, survit aux redémarrages).
 */

import { getCachedWikitext, setCachedWikitext } from "./cs2-history-store.js";

const LIQUIPEDIA_BASE = "https://liquipedia.net/valorant/api.php";
const LIQUIPEDIA_USER_AGENT = "SplitApp/1.0 (https://github.com/Arthur5243/Split.-main)";

const GENERAL_THROTTLE_MS = 2100;
const PARSE_THROTTLE_MS = 31000;

if (!globalThis.__liquipediaValoThrottle) {
  globalThis.__liquipediaValoThrottle = { lastGeneral: 0, lastParse: 0, rateLimitedUntil: 0 };
}
const _lqt = globalThis.__liquipediaValoThrottle;

async function throttleGeneral() {
  const wait = _lqt.lastGeneral + GENERAL_THROTTLE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  _lqt.lastGeneral = Date.now();
}

async function throttleParse() {
  const wait = _lqt.lastParse + PARSE_THROTTLE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  _lqt.lastParse = Date.now();
  _lqt.lastGeneral = Date.now();
}

async function liquipediaFetch(params, { isParse = false } = {}) {
  if (Date.now() < _lqt.rateLimitedUntil) throw new Error("liquipedia-valo rate-limited");
  if (isParse) await throttleParse(); else await throttleGeneral();
  const url = LIQUIPEDIA_BASE + "?" + new URLSearchParams({ ...params, format: "json" }).toString();
  const res = await fetch(url, { headers: { "User-Agent": LIQUIPEDIA_USER_AGENT } });
  if (res.status === 429) {
    _lqt.rateLimitedUntil = Date.now() + 30 * 60 * 1000;
    throw new Error("liquipedia-valo HTTP 429");
  }
  if (!res.ok) throw new Error("liquipedia-valo HTTP " + res.status);
  return res.json();
}

async function searchTournamentPages(query) {
  const json = await liquipediaFetch({ action: "query", list: "search", srsearch: query, srlimit: "3" });
  return (json?.query?.search || []).map((r) => r.title);
}

async function getWikitext(pageTitle) {
  const cacheKey = "valo:" + pageTitle;
  const cached = getCachedWikitext(cacheKey);
  if (cached !== undefined) return cached;
  const json = await liquipediaFetch({ action: "parse", page: pageTitle, prop: "wikitext" }, { isParse: true });
  const text = json?.parse?.wikitext?.["*"];
  if (typeof text !== "string") return null;
  setCachedWikitext(cacheKey, text);
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
  let depth = 0, j = start;
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
  const idx = MONTHS.indexOf(m[1].toLowerCase());
  if (idx === -1) return null;
  return `${m[3]}-${String(idx + 1).padStart(2, "0")}-${String(parseInt(m[2], 10)).padStart(2, "0")}`;
}

function parseMatchBlock(block) {
  const opponent1 = getTeamOpponentSlug(block, "opponent1");
  const opponent2 = getTeamOpponentSlug(block, "opponent2");
  if (!opponent1 || !opponent2) return null;
  const finished = getParam(block, "finished") === "true";
  const date = parseLiquipediaDate(getParam(block, "date"));

  const maps = [];
  for (let n = 1; n <= 9; n++) {
    const mapParam = getParam(block, "map" + n);
    if (!mapParam) break;
    const mb = /\{\{Map[\s\S]*\}\}/.exec(mapParam);
    if (!mb) continue;
    const mapBlock = mb[0];
    // Valorant templates : plusieurs variantes coexistent
    //   {{Map|map=Sunset|score1=13|score2=8|finished=true}}    (le plus courant)
    //   {{Map|map=X|t1atk=6|t1def=7|t2atk=7|t2def=5|finished=true}} (moins fréquent)
    const s1 = parseInt(getParam(mapBlock, "score1") ?? "", 10);
    const s2 = parseInt(getParam(mapBlock, "score2") ?? "", 10);
    let score1 = Number.isFinite(s1) ? s1 : null;
    let score2 = Number.isFinite(s2) ? s2 : null;
    if (score1 == null || score2 == null) {
      // Fallback : somme des demi-manches
      const sumHalf = (side) => {
        let total = 0, hit = false;
        for (const suf of ["atk", "def", "t", "ct", "attack", "defense"]) {
          const v = getParam(mapBlock, side + suf);
          if (v != null && v !== "") { total += parseInt(v, 10) || 0; hit = true; }
        }
        return hit ? total : null;
      };
      score1 = sumHalf("t1");
      score2 = sumHalf("t2");
    }
    const mapName = getParam(mapBlock, "map") || getParam(mapBlock, "mapname");
    if (score1 == null || score2 == null) continue;
    const mapFinished = getParam(mapBlock, "finished") === "true";
    if (!mapFinished && score1 === 0 && score2 === 0) continue;
    maps.push({ map: mapName, score1, score2 });
  }

  return { opponent1, opponent2, finished, date, maps };
}

const SLUG_ALIASES = {
  kc: "karmine corp",
  "karmine corp gc": "karmine corp gc",
  tl: "team liquid",
  fnc: "fnatic",
  nrg: "nrg",
  th: "team heretics",
  heretics: "team heretics",
  vit: "team vitality",
  vitality: "team vitality",
  xlg: "xi lai gaming",
  tec: "the union",
  edg: "edward gaming",
  drx: "drx",
  gen: "gen.g esports",
  "gen.g": "gen.g esports",
  paper: "paper rex",
  prx: "paper rex",
  t1: "t1",
  brs: "boom esports",
  boom: "boom esports",
  loud: "loud",
  furia: "furia esports",
  mibr: "mibr",
  lev: "leviatan",
  leviatan: "leviatan",
  "100t": "100 thieves",
  "100 thieves": "100 thieves",
  c9: "cloud9",
  cloud9: "cloud9",
  sen: "sentinels",
  eg: "evil geniuses",
  g2: "g2 esports",
  mkoi: "movistar koi",
  "movistar koi": "movistar koi",
  bbl: "bbl esports",
  gx: "giantx",
  giantx: "giantx",
  navi: "natus vincere",
  m8: "made in brazil",
  "2game": "2game esports",
  ns: "nongshim red force",
  gc: "global esports",
  ge: "global esports",
  tlnz: "talon esports",
  talon: "talon esports",
  rrq: "rex regum qeon",
  aur: "aurora gaming",
  fut: "fut esports",
  koi: "movistar koi",
  te: "trace esports",
  tec_valo: "trace esports",
  drg: "dragon ranger gaming",
  jdg: "jdg esports",
  ag: "all gamers",
  fpx: "funplus phoenix",
  bilibili: "bilibili gaming",
};

function similar(a, b) {
  const clean = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const ca = clean(a), cb = clean(b);
  if (!ca || !cb) return false;
  return ca === cb || ca.includes(cb) || cb.includes(ca);
}

function slugMatchesName(slug, name) {
  if (!slug || !name) return false;
  if (similar(slug, name)) return true;
  const alias = SLUG_ALIASES[slug.toLowerCase()];
  return alias ? similar(alias, name) : false;
}

function findMatchInWikitext(wikitext, team1Name, team2Name, dateStr) {
  const blocks = extractTemplateBlocks(wikitext, "Match");
  const candidates = blocks.map(parseMatchBlock).filter(Boolean);
  if (candidates.length === 0) return { maps: null, matchCount: 0 };

  const isUsable = (m) => m.finished || m.maps.length > 0;
  const sameOrder = candidates.filter((m) => isUsable(m) && slugMatchesName(m.opponent1, team1Name) && slugMatchesName(m.opponent2, team2Name));
  const swapped = candidates.filter((m) => isUsable(m) && slugMatchesName(m.opponent1, team2Name) && slugMatchesName(m.opponent2, team1Name));

  function closest(list) {
    if (list.length <= 1) return list[0] || null;
    if (!dateStr) return list[0];
    return list.reduce((best, cur) => {
      if (!cur.date) return best;
      if (!best || !best.date) return cur;
      return Math.abs(new Date(cur.date) - new Date(dateStr)) < Math.abs(new Date(best.date) - new Date(dateStr)) ? cur : best;
    }, null);
  }

  const found = closest(sameOrder);
  if (found) return { maps: found.maps.length > 0 ? found.maps : null, matchCount: candidates.length };
  const foundSw = closest(swapped);
  if (foundSw) {
    const maps = foundSw.maps.length > 0 ? foundSw.maps.map((m) => ({ map: m.map, score1: m.score2, score2: m.score1 })) : null;
    return { maps, matchCount: candidates.length };
  }
  return { maps: null, matchCount: candidates.length };
}

const INDEX_PAGE_TITLE_RE = /(^|\/)(s|a|b|c|d)-tier tournaments|qualifier tournaments|tier tournaments/i;
const MAX_PAGES_PER_MATCH = 3;

/**
 * Cherche les scores par map d'un match Valorant sur Liquipedia.
 * team1Name/team2Name : noms côté PandaScore. tournamentName/serieName :
 * pour affiner la recherche wiki. dateStr : YYYY-MM-DD.
 * Renvoie [{map, score1, score2}, ...] dans l'ordre team1/team2, ou null.
 */
export async function getValorantMapScoresFromLiquipedia(team1Name, team2Name, tournamentName, dateStr, serieName) {
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
  const pages = [];
  for (const q of queries) {
    let results;
    try { results = await searchTournamentPages(q); }
    catch (e) { console.log(`[liquipedia-valo] search(${q}) → ERREUR:`, e.message); continue; }
    for (const title of results || []) {
      if (seen.has(title)) continue;
      seen.add(title);
      if (INDEX_PAGE_TITLE_RE.test(title)) {
        console.log(`[liquipedia-valo] "${title}" → page d'index, skip`);
        continue;
      }
      pages.push(title);
    }
  }
  if (pages.length === 0) {
    console.log(`[liquipedia-valo] search(${team1Name} vs ${team2Name}) → aucune page`);
    return null;
  }

  let fetched = 0;
  for (const title of pages) {
    if (fetched >= MAX_PAGES_PER_MATCH) {
      console.log(`[liquipedia-valo] ${team1Name} vs ${team2Name} → ${MAX_PAGES_PER_MATCH} pages sans succès, abandon`);
      break;
    }
    let wikitext;
    const wasCached = getCachedWikitext("valo:" + title) !== undefined;
    try { wikitext = await getWikitext(title); }
    catch (e) { console.log(`[liquipedia-valo] wikitext(${title}) → ERREUR:`, e.message); continue; }
    if (!wasCached) fetched++;
    if (!wikitext) continue;
    const { maps, matchCount } = findMatchInWikitext(wikitext, team1Name, team2Name, dateStr);
    if (maps) {
      console.log(`[liquipedia-valo] "${title}" → trouvé ${maps.length} map(s) pour ${team1Name} vs ${team2Name}`);
      return maps;
    }
    if (matchCount > 0) {
      console.log(`[liquipedia-valo] "${title}" → ${matchCount} matchs mais aucun ne matche`);
    }
  }
  return null;
}
