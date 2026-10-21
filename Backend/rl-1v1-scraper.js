/**
 * Scraper Liquipedia pour les matchs Rocket League 1v1.
 *
 * PandaScore ne couvre pas le 1v1 — on scrape directement Liquipedia.
 *
 * Approche :
 *   1. Toutes les heures, fetch le wikitext du hub "1v1" pour trouver les
 *      pages des tournois 1v1 récents / en cours / à venir.
 *   2. Pour chaque page, fetch son wikitext et parse les {{Match}} /
 *      {{MatchMaps}} pour extraire les matchs.
 *   3. Store le résultat dans un fichier JSON persistant (/data/rl-1v1-matches.json)
 *      + mémoire. L'endpoint HTTP sert depuis la mémoire → pas de latence.
 *
 * Rate limit Liquipedia (partagé avec les autres scrapers via globalThis) :
 *   - 1 req générale toutes les ~2s
 *   - action=parse : 1 toutes les ~31s
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = existsSync("/data") ? "/data" : join(__dirname, "data");
try { if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true }); } catch {}
const PERSIST_PATH = join(DATA_DIR, "rl-1v1-matches.json");

const WIKI = "rocketleague";
const API = `https://liquipedia.net/${WIKI}/api.php`;
const UA =
  process.env.LIQUIPEDIA_USER_AGENT ||
  "SplitApp/1.0 (contact: arthur.pro.busi@gmail.com)";

const HUB_PAGE = "1v1";

if (!globalThis.__liquipediaThrottle) {
  globalThis.__liquipediaThrottle = { lastGeneral: 0, lastParse: 0, rateLimitedUntil: 0 };
}
const T = globalThis.__liquipediaThrottle;
const GEN_MS = 2100;
const PARSE_MS = 31000;

async function throttleGeneral() {
  const w = T.lastGeneral + GEN_MS - Date.now();
  if (w > 0) await new Promise(r => setTimeout(r, w));
  T.lastGeneral = Date.now();
}
async function throttleParse() {
  const w = T.lastParse + PARSE_MS - Date.now();
  if (w > 0) await new Promise(r => setTimeout(r, w));
  T.lastParse = Date.now();
  T.lastGeneral = Date.now();
}

async function liquiFetch(params, { parse = false } = {}) {
  if (Date.now() < T.rateLimitedUntil) throw new Error("rl-1v1 rate-limited");
  if (parse) await throttleParse();
  else await throttleGeneral();
  const url = API + "?" + new URLSearchParams({ ...params, format: "json" }).toString();
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Encoding": "gzip" } });
  if (res.status === 429) {
    T.rateLimitedUntil = Date.now() + 30 * 60 * 1000;
    throw new Error("rl-1v1 HTTP 429 — cooldown 30min");
  }
  if (!res.ok) throw new Error("rl-1v1 HTTP " + res.status);
  return res.json();
}

async function getWikitext(page) {
  const json = await liquiFetch({ action: "parse", page, prop: "wikitext" }, { parse: true });
  const text = json?.parse?.wikitext?.["*"];
  return typeof text === "string" ? text : null;
}

function extractTemplateBlocks(text, templateName) {
  const blocks = [];
  const marker = "{{" + templateName;
  let i = 0;
  while (true) {
    const start = text.indexOf(marker, i);
    if (start === -1) break;
    const after = text[start + marker.length];
    if (after !== "|" && after !== "}" && after !== "\n" && after !== " ") {
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

function getOpponentName(block, key) {
  const raw = getParam(block, key);
  if (!raw) return null;
  const m1 = /\{\{(?:1Opponent|Opponent|SoloOpponent|LiteralOpponent)\|([^|}]+)/.exec(raw);
  if (m1) return m1[1].trim();
  const m2 = /\[\[([^\]|]+)/.exec(raw);
  if (m2) return m2[1].trim();
  const stripped = raw.replace(/\{\{[^}]+\}\}/g, "").trim();
  return stripped || null;
}

const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
function parseLiquiDate(raw) {
  if (!raw) return null;
  let m = /([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/.exec(raw);
  if (m) {
    const idx = MONTHS.indexOf(m[1].toLowerCase());
    if (idx === -1) return null;
    return `${m[3]}-${String(idx + 1).padStart(2, "0")}-${String(parseInt(m[2], 10)).padStart(2, "0")}`;
  }
  m = /(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function parseIsoDateTime(raw) {
  if (!raw) return null;
  const m = /(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/.exec(raw);
  if (m) return `${m[1]}T${m[2]}:00Z`;
  const d = parseLiquiDate(raw);
  if (d) return `${d}T00:00:00Z`;
  return null;
}

function parseMatchBlock(block, tournament) {
  const opp1 = getOpponentName(block, "opponent1");
  const opp2 = getOpponentName(block, "opponent2");
  if (!opp1 || !opp2) return null;

  const finished = getParam(block, "finished") === "true";
  const date = getParam(block, "date");
  const begin_at = parseIsoDateTime(date);

  const games = [];
  for (let n = 1; n <= 11; n++) {
    const mapParam = getParam(block, "map" + n);
    if (!mapParam) break;
    const mapBlockMatch = /\{\{Map[\s\S]*\}\}/.exec(mapParam);
    const mapBlock = mapBlockMatch ? mapBlockMatch[0] : mapParam;
    const s1 = getParam(mapBlock, "score1");
    const s2 = getParam(mapBlock, "score2");
    const mf = getParam(mapBlock, "finished");
    if (s1 != null && s2 != null) {
      games.push({
        game: "Game " + (n),
        score1: parseInt(s1, 10) || 0,
        score2: parseInt(s2, 10) || 0,
        finished: mf === "true",
      });
    }
  }

  let series1 = games.filter(g => g.finished && g.score1 > g.score2).length;
  let series2 = games.filter(g => g.finished && g.score2 > g.score1).length;
  const rawW1 = getParam(block, "winner");
  if (!series1 && !series2 && rawW1) {
    const w = parseInt(rawW1, 10);
    if (w === 1) series1 = 1;
    else if (w === 2) series2 = 1;
  }

  let status = "upcoming";
  if (finished) status = "finished";
  else if (games.some(g => g.finished)) status = "running";

  return {
    id: `rl1v1-${tournament.slug}-${opp1}-${opp2}-${date || ""}`.replace(/\s+/g, "_"),
    tournament_name: tournament.name,
    tournament_slug: tournament.slug,
    tournament_tier: tournament.tier || null,
    opponents: [
      { opponent: { name: opp1, acronym: null, image_url: null } },
      { opponent: { name: opp2, acronym: null, image_url: null } },
    ],
    results: [
      { score: series1, team_id: 0 },
      { score: series2, team_id: 1 },
    ],
    status,
    begin_at,
    end_at: null,
    live_map_scores: games,
    source: "liquipedia-1v1",
  };
}

const SEEN_PAGE_RE = /\[\[([A-Za-z0-9_\- ,():/]+(?:1v1|One[_ ]on[_ ]One|Showdown|Duel)[^\]|]*)/gi;

function extractCandidateTournamentPages(hubText) {
  const found = new Set();
  let m;
  while ((m = SEEN_PAGE_RE.exec(hubText)) !== null) {
    const title = m[1].trim();
    if (!title || title.toLowerCase() === "1v1") continue;
    if (title.length > 120) continue;
    found.add(title.replace(/ /g, "_"));
  }
  const tplMarker = "{{HiddenSort";
  if (hubText.includes(tplMarker)) {
    const linkRe = /\[\[([^\]|#]+)[\|\]]/g;
    let mm;
    while ((mm = linkRe.exec(hubText)) !== null) {
      const t = mm[1].trim();
      if (/1v1|showdown|duel/i.test(t) && !/^file:/i.test(t) && !/^category:/i.test(t)) {
        found.add(t.replace(/ /g, "_"));
      }
    }
  }
  return Array.from(found).slice(0, 20);
}

let STATE = { generated_at: 0, matches: [], errors: [] };
try {
  if (existsSync(PERSIST_PATH)) {
    STATE = JSON.parse(readFileSync(PERSIST_PATH, "utf8")) || STATE;
    console.log(`[rl-1v1] loaded ${STATE.matches?.length || 0} matchs depuis ${PERSIST_PATH}`);
  }
} catch (e) {
  console.log("[rl-1v1] persist load error:", e.message);
}

function persist() {
  try {
    writeFileSync(PERSIST_PATH, JSON.stringify(STATE, null, 2), "utf8");
  } catch (e) {
    console.log("[rl-1v1] persist write error:", e.message);
  }
}

async function discoverTournaments() {
  console.log("[rl-1v1] discover: fetching hub page", HUB_PAGE);
  const text = await getWikitext(HUB_PAGE);
  if (!text) {
    console.log("[rl-1v1] hub page vide — fallback liste");
    return [];
  }
  const pages = extractCandidateTournamentPages(text);
  console.log("[rl-1v1] discover: " + pages.length + " candidats");
  return pages.map(p => ({ slug: p, name: p.replace(/_/g, " "), tier: null }));
}

async function scrapeTournament(t) {
  try {
    const text = await getWikitext(t.slug);
    if (!text) return [];
    const matchBlocks = [
      ...extractTemplateBlocks(text, "Match"),
      ...extractTemplateBlocks(text, "MatchMaps"),
    ];
    const matches = [];
    for (const b of matchBlocks) {
      const parsed = parseMatchBlock(b, t);
      if (parsed) matches.push(parsed);
    }
    return matches;
  } catch (e) {
    console.log(`[rl-1v1] scrape "${t.slug}" error:`, e.message);
    return [];
  }
}

let busy = false;
async function refreshAll() {
  if (busy) { console.log("[rl-1v1] refresh déjà en cours — skip"); return; }
  busy = true;
  const errors = [];
  try {
    const tournaments = await discoverTournaments();
    if (!tournaments.length) {
      console.log("[rl-1v1] aucun tournoi découvert");
      busy = false;
      return;
    }
    const all = [];
    for (const t of tournaments.slice(0, 10)) {
      try {
        const ms = await scrapeTournament(t);
        console.log(`[rl-1v1] "${t.slug}": ${ms.length} matchs`);
        all.push(...ms);
      } catch (e) {
        errors.push({ slug: t.slug, error: e.message });
      }
    }
    const dedup = new Map();
    for (const m of all) dedup.set(m.id, m);
    STATE = {
      generated_at: Date.now(),
      matches: Array.from(dedup.values()),
      errors,
    };
    persist();
    console.log(`[rl-1v1] refresh terminé: ${STATE.matches.length} matchs totaux`);
  } catch (e) {
    console.log("[rl-1v1] refresh fatal:", e.message);
  } finally {
    busy = false;
  }
}

const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export function startRL1v1Worker() {
  if (STATE.matches.length === 0 || Date.now() - STATE.generated_at > REFRESH_INTERVAL_MS) {
    setTimeout(() => refreshAll().catch(() => {}), 30 * 1000);
  }
  setInterval(() => refreshAll().catch(() => {}), REFRESH_INTERVAL_MS);
  console.log("[rl-1v1] worker démarré (refresh/h)");
}

export function getRL1v1Snapshot() {
  const now = Date.now();
  const matches = STATE.matches || [];
  const upcoming = matches.filter(m => m.status === "upcoming");
  const live = matches.filter(m => m.status === "running");
  const results = matches.filter(m => m.status === "finished");
  return {
    generated_at: STATE.generated_at,
    age_minutes: STATE.generated_at ? Math.round((now - STATE.generated_at) / 60000) : null,
    counts: { upcoming: upcoming.length, live: live.length, results: results.length },
    upcoming,
    live,
    results,
    errors: STATE.errors || [],
  };
}

export async function forceRL1v1Refresh() {
  await refreshAll();
  return getRL1v1Snapshot();
}
