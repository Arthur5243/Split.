/**
 * Scraper Liquipedia pour le tournoi RL 1v1 "FuuRy KNOCKOUT SERIES".
 * Page : https://liquipedia.net/rocketleague/FuuRy/KNOCKOUT_SERIES
 *
 * Format : 7 nuits de ladder (groupe) + 1 playoffs single-elim 4 joueurs.
 * On scrape toute la page, on extrait tous les {{Match}} blocks avec leurs
 * sections (Night 1..7 / Playoffs), et on stocke en mémoire + JSON persistant.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = existsSync("/data") ? "/data" : join(__dirname, "data");
try { if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true }); } catch {}
const PERSIST_PATH = join(DATA_DIR, "rl-knockout-series.json");

const PAGE = "FuuRy/KNOCKOUT_SERIES";
const API = "https://liquipedia.net/rocketleague/api.php";
const UA = process.env.LIQUIPEDIA_USER_AGENT || "SplitApp/1.0 (contact: arthur.pro.busi@gmail.com)";

// Partage du throttle global avec les autres scrapers Liquipedia du projet.
if (!globalThis.__liquipediaThrottle) {
  globalThis.__liquipediaThrottle = { lastGeneral: 0, lastParse: 0, rateLimitedUntil: 0 };
}
const T = globalThis.__liquipediaThrottle;
const PARSE_MS = 31000;

async function throttleParse() {
  const w = T.lastParse + PARSE_MS - Date.now();
  if (w > 0) await new Promise(r => setTimeout(r, w));
  T.lastParse = Date.now();
  T.lastGeneral = Date.now();
}

async function fetchWikitext(page) {
  if (Date.now() < T.rateLimitedUntil) throw new Error("knockout-series rate-limited");
  await throttleParse();
  const url = API + "?" + new URLSearchParams({ action: "parse", page, prop: "wikitext", format: "json" }).toString();
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Encoding": "gzip" } });
  if (res.status === 429) {
    T.rateLimitedUntil = Date.now() + 30 * 60 * 1000;
    throw new Error("knockout-series HTTP 429 — cooldown 30min");
  }
  if (!res.ok) throw new Error("knockout-series HTTP " + res.status);
  const json = await res.json();
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
    if (after !== "|" && after !== "}" && after !== "\n" && after !== " ") { i = start + marker.length; continue; }
    let depth = 0;
    let j = start;
    while (j < text.length) {
      if (text.startsWith("{{", j)) { depth++; j += 2; }
      else if (text.startsWith("}}", j)) { depth--; j += 2; if (depth === 0) break; }
      else j++;
    }
    blocks.push({ start, end: j, text: text.slice(start, j) });
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

function parseIsoDateTime(raw) {
  if (!raw) return null;
  const m = /(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/.exec(raw);
  if (m) return `${m[1]}T${m[2]}:00Z`;
  const m2 = /(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}T00:00:00Z`;
  return null;
}

// Détermine la section à laquelle appartient un match (position dans le wikitext).
// On repère les `== Night X ==` / `== Playoffs ==` et on classe le match par la
// section qui le précède.
function buildSectionMap(wikitext) {
  const re = /^(==+)\s*([^=]+?)\s*==+\s*$/gm;
  const sections = [];
  let m;
  while ((m = re.exec(wikitext)) !== null) {
    sections.push({ pos: m.index, title: m[2].trim() });
  }
  return sections;
}

function sectionAt(sections, pos) {
  let current = { title: "Overview", pos: -1 };
  for (const s of sections) {
    if (s.pos <= pos) current = s;
    else break;
  }
  return current.title;
}

function classifySection(title) {
  const t = (title || "").toLowerCase();
  if (/playoff|final|bracket/.test(t)) return "playoffs";
  if (/night|ladder|group|day|phase/.test(t)) return "ladder";
  return "other";
}

function parseMatchBlock(block, section) {
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
        game: "Game " + n,
        score1: parseInt(s1, 10) || 0,
        score2: parseInt(s2, 10) || 0,
        finished: mf === "true",
      });
    }
  }

  let series1 = games.filter(g => g.finished && g.score1 > g.score2).length;
  let series2 = games.filter(g => g.finished && g.score2 > g.score1).length;
  const rawW = getParam(block, "winner");
  if (!series1 && !series2 && rawW) {
    const w = parseInt(rawW, 10);
    if (w === 1) series1 = 1;
    else if (w === 2) series2 = 1;
  }

  let status = "upcoming";
  if (finished) status = "finished";
  else if (games.some(g => g.finished)) status = "running";

  return {
    id: `rl-knockout-${section.title}-${opp1}-${opp2}-${date || ""}`.replace(/\s+/g, "_"),
    section: section.title,
    stage: classifySection(section.title),
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
    source: "liquipedia-knockout-series",
  };
}

let STATE = { generated_at: 0, matches: [], errors: [] };
try {
  if (existsSync(PERSIST_PATH)) {
    STATE = JSON.parse(readFileSync(PERSIST_PATH, "utf8")) || STATE;
    console.log(`[rl-knockout] loaded ${STATE.matches?.length || 0} matchs depuis ${PERSIST_PATH}`);
  }
} catch (e) {
  console.log("[rl-knockout] persist load error:", e.message);
}

function persist() {
  try {
    writeFileSync(PERSIST_PATH, JSON.stringify(STATE, null, 2), "utf8");
  } catch (e) {
    console.log("[rl-knockout] persist write error:", e.message);
  }
}

let busy = false;
async function refresh() {
  if (busy) { console.log("[rl-knockout] refresh en cours — skip"); return; }
  busy = true;
  const errors = [];
  try {
    console.log("[rl-knockout] fetching", PAGE);
    const text = await fetchWikitext(PAGE);
    if (!text) {
      console.log("[rl-knockout] wikitext vide");
      busy = false;
      return;
    }
    const sections = buildSectionMap(text);
    console.log(`[rl-knockout] ${sections.length} sections détectées:`, sections.map(s => s.title).slice(0, 15).join(" | "));
    // Extract tous les Match / MatchMaps blocs dans l'ordre d'apparition.
    const rawBlocks = [
      ...extractTemplateBlocks(text, "Match"),
      ...extractTemplateBlocks(text, "MatchMaps"),
    ].sort((a, b) => a.start - b.start);
    console.log(`[rl-knockout] ${rawBlocks.length} blocks Match trouvés`);
    const matches = [];
    const seen = new Set();
    for (let i = 0; i < rawBlocks.length; i++) {
      const b = rawBlocks[i];
      let section = { title: sectionAt(sections, b.start) };
      // Fallback : si aucune section wiki n'est tombée dessus (section
      // = "Overview" par défaut), classer par position — format fixe
      // 7 nights × 4 matches = 28 matchs ladder, puis playoffs.
      if (!section.title || section.title === "Overview") {
        if (i < 28) section = { title: "Night " + (Math.floor(i / 4) + 1) };
        else section = { title: "Playoffs" };
      }
      const parsed = parseMatchBlock(b.text, section);
      if (!parsed) continue;
      if (seen.has(parsed.id)) continue;
      seen.add(parsed.id);
      matches.push(parsed);
    }
    STATE = { generated_at: Date.now(), matches, errors };
    persist();
    const bySection = {};
    for (const m of matches) bySection[m.section] = (bySection[m.section] || 0) + 1;
    console.log(`[rl-knockout] refresh ok: ${matches.length} matchs. Par section:`, bySection);
  } catch (e) {
    console.log("[rl-knockout] refresh fatal:", e.message);
    errors.push({ scope: "refresh", error: e.message });
  } finally {
    busy = false;
  }
}

const REFRESH_MS = 60 * 60 * 1000; // 1h

export function startRLKnockoutSeriesWorker() {
  if (STATE.matches.length === 0 || Date.now() - STATE.generated_at > REFRESH_MS) {
    setTimeout(() => refresh().catch(() => {}), 45 * 1000);
  }
  setInterval(() => refresh().catch(() => {}), REFRESH_MS);
  console.log("[rl-knockout] worker démarré (refresh/h)");
}

export function getRLKnockoutSeriesSnapshot() {
  const matches = STATE.matches || [];
  const ladder = matches.filter(m => m.stage === "ladder");
  const playoffs = matches.filter(m => m.stage === "playoffs");
  const other = matches.filter(m => m.stage === "other");
  // Regroupe le ladder par section (Night 1, Night 2, ...).
  const bySection = new Map();
  for (const m of ladder) {
    if (!bySection.has(m.section)) bySection.set(m.section, []);
    bySection.get(m.section).push(m);
  }
  const nights = Array.from(bySection.entries()).map(([name, ms]) => ({ name, matches: ms }));
  return {
    generated_at: STATE.generated_at,
    age_minutes: STATE.generated_at ? Math.round((Date.now() - STATE.generated_at) / 60000) : null,
    counts: { ladder: ladder.length, playoffs: playoffs.length, other: other.length },
    nights,
    playoffs,
    other,
    errors: STATE.errors || [],
  };
}

export async function forceRLKnockoutSeriesRefresh() {
  await refresh();
  return getRLKnockoutSeriesSnapshot();
}
