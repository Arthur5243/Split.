/**
 * Scraper Liquipedia générique pour les matchs Rocket League tier 1/2/3.
 *
 * Comble le trou laissé par PandaScore qui ne renvoie plus les matchs RL
 * depuis quelques jours. Approche :
 *   1. Un pool de "seed pages" pointant sur les saisons RLCS en cours
 *      (par défaut la saison 2026 et ses éventuels sous-stages).
 *   2. Pour chaque seed, on fetch le wikitext via Apify (contourne le WAF
 *      Liquipedia qui 429 l'IP Railway), on parse les liens internes
 *      `[[Rocket_League_Championship_Series/2026/...]]` pour découvrir les
 *      sous-pages (Kick-Off, Majors, Opens, Qualifiers régionaux…), puis
 *      on les ajoute à la file de scrape.
 *   3. Pour chaque page découverte, on extrait les blocs {{Match}} /
 *      {{MatchMaps}} et on retient ceux qui ont des opponents "normaux"
 *      (filtre placeholders "Winner of X").
 *
 * Le scraper expose getRLLiquipediaMatchesSnapshot() qui renvoie trois
 * listes compatibles avec les endpoints /api/rl-upcoming|live|results.
 * Les routes RL mergent ces données avec PandaScore pour combler les
 * trous.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = existsSync("/data") ? "/data" : join(__dirname, "data");
try { if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true }); } catch {}
const PERSIST_PATH = join(DATA_DIR, "rl-liquipedia-matches.json");

const API = "https://liquipedia.net/rocketleague/api.php";
const UA = process.env.LIQUIPEDIA_USER_AGENT || "SplitApp/1.0 (https://app.splitapp.fr)";
const APIFY_TOKEN = process.env.APIFY_TOKEN || "";
const APIFY_WEB_FETCH_URL = "https://api.apify.com/v2/acts/apify~web-fetch/run-sync-get-dataset-items";

// Pages racines à scraper en priorité (les sous-pages sont découvertes par
// parsing des liens internes). Overridable via RL_LIQUIPEDIA_SEED_PAGES
// (CSV).
const DEFAULT_SEED_PAGES = [
  "Rocket_League_Championship_Series/2026",
  "Rocket_League_Championship_Series/2026/Kick-Off_Weekend",
  "Rocket_League_Championship_Series/2026/Boston_Major/North_America/Open_1",
  "Rocket_League_Championship_Series/2026/Boston_Major/Europe/Open_1",
  "Rocket_League_Championship_Series/2026/Boston_Major/South_America/Open_1",
  "Rocket_League_Championship_Series/2026/Boston_Major/Oceania/Open_1",
  "Rocket_League_Championship_Series/2026/Boston_Major/Middle_East_%26_North_Africa/Open_1",
  "Rocket_League_Championship_Series/2026/Boston_Major/Asia/Open_1",
  "Rocket_League_Championship_Series/2026/Boston_Major/Sub-Saharan_Africa/Open_1",
];
const SEED_PAGES = (process.env.RL_LIQUIPEDIA_SEED_PAGES
  ? process.env.RL_LIQUIPEDIA_SEED_PAGES.split(",").map(s => s.trim()).filter(Boolean)
  : DEFAULT_SEED_PAGES);

const MAX_PAGES_PER_CYCLE = 12; // borne pour pas faire 20min de scrape
const DISCOVERY_MAX_DEPTH = 1;  // 1 = seeds + leurs sous-pages directes

// --- Throttle partagé entre tous les scrapers Liquipedia ---
if (!globalThis.__liquipediaThrottle) {
  globalThis.__liquipediaThrottle = { lastGeneral: 0, lastParse: 0, rateLimitedUntil: 0 };
}
const T = globalThis.__liquipediaThrottle;
const PARSE_MS = 31000;
let localRateLimitedUntil = 0;

async function throttleParse() {
  const w = T.lastParse + PARSE_MS - Date.now();
  if (w > 0) await new Promise(r => setTimeout(r, w));
  T.lastParse = Date.now();
  T.lastGeneral = Date.now();
}

// --- Fetch (Apify prioritaire, direct en fallback) ---
async function fetchViaApify(targetUrl) {
  const apifyUrl = APIFY_WEB_FETCH_URL + "?token=" + encodeURIComponent(APIFY_TOKEN);
  const res = await fetch(apifyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: targetUrl }),
  });
  if (!res.ok) throw new Error("rl-lqp Apify HTTP " + res.status);
  const items = await res.json();
  if (!Array.isArray(items) || items.length === 0) throw new Error("Apify dataset vide");
  const item = items[0];
  const httpStatus = item?.fetch?.httpStatusCode;
  if (httpStatus && httpStatus !== 200) throw new Error("Liquipedia via Apify HTTP " + httpStatus);
  const textRaw = item?.text;
  if (typeof textRaw !== "string") throw new Error("Apify pas de text");
  let json;
  try { json = JSON.parse(textRaw); } catch { throw new Error("Apify text pas du JSON"); }
  return json?.parse?.wikitext?.["*"] || null;
}

async function fetchDirect(targetUrl) {
  const res = await fetch(targetUrl, {
    headers: { "User-Agent": UA, "Accept": "application/json" },
  });
  if (res.status === 429) {
    localRateLimitedUntil = Date.now() + 30 * 60 * 1000;
    throw new Error("rl-lqp HTTP 429 — cooldown 30min");
  }
  if (!res.ok) throw new Error("rl-lqp HTTP " + res.status);
  const json = await res.json();
  return json?.parse?.wikitext?.["*"] || null;
}

async function fetchWikitext(page) {
  if (Date.now() < localRateLimitedUntil) throw new Error("rl-lqp rate-limited local");
  await throttleParse();
  const url = API + "?" + new URLSearchParams({ action: "parse", page, prop: "wikitext", format: "json" }).toString();
  if (APIFY_TOKEN) {
    try {
      const text = await fetchViaApify(url);
      if (text) return text;
    } catch (e) {
      // Fallback direct
    }
  }
  return fetchDirect(url);
}

// --- Parsing wikitext (porté de rl-knockout-series-scraper.js) ---
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
  const m1 = /\{\{(?:TeamOpponent|1Opponent|Opponent|SoloOpponent|LiteralOpponent)\|([^|}]+)/.exec(raw);
  if (m1) return m1[1].trim();
  const m2 = /\[\[([^\]|]+)/.exec(raw);
  if (m2) return m2[1].trim();
  const stripped = raw.replace(/\{\{[^}]+\}\}/g, "").trim();
  return stripped || null;
}

function parseIsoDateTime(raw) {
  if (!raw) return null;
  const m = /(\d{4})-(\d{2})-(\d{2})\s*(?:-\s*)?(\d{2}):(\d{2})/.exec(raw);
  if (m) {
    const y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
    const h = parseInt(m[4], 10), mm = parseInt(m[5], 10);
    let offsetMin = null;
    const tzOff = /data-tz=["']?([+-])(\d{1,2}):?(\d{2})?/i.exec(raw);
    if (tzOff) {
      const sign = tzOff[1] === "-" ? -1 : 1;
      offsetMin = sign * (parseInt(tzOff[2], 10) * 60 + parseInt(tzOff[3] || "0", 10));
    } else if (/CEST/i.test(raw)) offsetMin = 120;
    else if (/CET/i.test(raw)) offsetMin = 60;
    else if (/\bUTC\b|\bGMT\b|\bZ\b/i.test(raw)) offsetMin = 0;
    else {
      const isSummerDst = (mo >= 4 && mo <= 9) || (mo === 3 && d >= 29) || (mo === 10 && d < 25);
      offsetMin = isSummerDst ? 120 : 60;
    }
    const utcMs = Date.UTC(y, mo - 1, d, h, mm) - offsetMin * 60 * 1000;
    return new Date(utcMs).toISOString();
  }
  const m2 = /(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}T00:00:00Z`;
  return null;
}

const PLACEHOLDER_NAME_RE = /^(tbd|winner|loser|match|r\d|qf|sf|gf|bye)/i;
function isRealTeamName(name) {
  if (!name || typeof name !== "string") return false;
  const n = name.trim();
  if (!n || n === "TBD") return false;
  if (PLACEHOLDER_NAME_RE.test(n)) return false;
  return n.length >= 2 && n.length <= 60;
}

function parseMatchBlock(block, pageTitle, tournamentHint) {
  const opp1 = getOpponentName(block, "opponent1");
  const opp2 = getOpponentName(block, "opponent2");
  if (!opp1 || !opp2) return null;
  if (!isRealTeamName(opp1) || !isRealTeamName(opp2)) return null;

  const finishedFlag = getParam(block, "finished") === "true";
  const winnerParam = getParam(block, "winner");
  const hasWinnerParam = winnerParam === "1" || winnerParam === "2";
  const finished = finishedFlag || hasWinnerParam;
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

  const gamePlayed = (g, i) => {
    if (g.score1 == null || g.score2 == null || g.score1 === g.score2) return false;
    if (finished || g.finished) return true;
    for (let j = i + 1; j < games.length; j++) {
      const nx = games[j];
      if (nx.finished || (nx.score1 != null && nx.score2 != null && (nx.score1 > 0 || nx.score2 > 0))) return true;
    }
    return false;
  };
  let series1 = games.filter((g, i) => gamePlayed(g, i) && g.score1 > g.score2).length;
  let series2 = games.filter((g, i) => gamePlayed(g, i) && g.score2 > g.score1).length;
  if (!series1 && !series2 && hasWinnerParam) {
    if (winnerParam === "1") series1 = 1; else series2 = 1;
  }

  const anyGameStarted = games.some(g => g.finished || (g.score1 != null && g.score2 != null && (g.score1 > 0 || g.score2 > 0)));
  const beginMs = begin_at ? new Date(begin_at).getTime() : null;
  const minutesSinceStart = beginMs ? (Date.now() - beginMs) / 60000 : null;
  const startedRecently = minutesSinceStart != null && minutesSinceStart >= 0 && minutesSinceStart < 6 * 60;
  let status = "upcoming";
  if (finished) status = "finished";
  else if (anyGameStarted) status = startedRecently || minutesSinceStart == null ? "running" : "finished";
  else if (startedRecently) status = "running";

  const id = `rl-lqp-${pageTitle}-${opp1}-${opp2}-${date || ""}`.replace(/[\s/]+/g, "_");
  return {
    id,
    page: pageTitle,
    tournament_name: tournamentHint || pageTitle.replace(/_/g, " "),
    opponents: [
      { opponent: { id: `rl-lqp-t-${opp1}`, name: opp1, acronym: null, image_url: null } },
      { opponent: { id: `rl-lqp-t-${opp2}`, name: opp2, acronym: null, image_url: null } },
    ],
    results: [
      { score: series1, team_id: `rl-lqp-t-${opp1}` },
      { score: series2, team_id: `rl-lqp-t-${opp2}` },
    ],
    status,
    begin_at,
    end_at: null,
    live_map_scores: games,
    number_of_games: Math.max(5, games.length),
    source: "liquipedia",
  };
}

function findLinkedSubpages(wikitext, rootPrefix) {
  // Match [[Root/Subpage|Label]] or [[Root/Subpage]]
  const out = new Set();
  const re = /\[\[([^\]|#]+?)(?:\|[^\]]*)?\]\]/g;
  let m;
  while ((m = re.exec(wikitext)) !== null) {
    const t = m[1].trim();
    if (t.startsWith(rootPrefix) && t !== rootPrefix) {
      // Normalise espaces en underscore
      out.add(t.replace(/\s+/g, "_"));
    }
  }
  return [...out];
}

// --- State + persistance ---
let STATE = { generated_at: 0, pages: {}, matches: [], errors: [] };
try {
  if (existsSync(PERSIST_PATH)) {
    STATE = JSON.parse(readFileSync(PERSIST_PATH, "utf8")) || STATE;
    console.log(`[rl-lqp] loaded ${STATE.matches?.length || 0} matchs depuis ${PERSIST_PATH}`);
  }
} catch (e) {
  console.log("[rl-lqp] persist load error:", e.message);
}

function persist() {
  try {
    writeFileSync(PERSIST_PATH, JSON.stringify(STATE, null, 2), "utf8");
  } catch (e) {
    console.log("[rl-lqp] persist write error:", e.message);
  }
}

let busy = false;
async function refresh() {
  if (busy) { console.log("[rl-lqp] refresh en cours — skip"); return; }
  busy = true;
  const errors = [];
  const allMatches = [];
  const visited = new Set();
  // Seeds + discovery depth
  let queue = [...SEED_PAGES.map(p => ({ title: p, depth: 0 }))];
  let fetchedCount = 0;
  try {
    while (queue.length > 0 && fetchedCount < MAX_PAGES_PER_CYCLE) {
      const { title, depth } = queue.shift();
      if (visited.has(title)) continue;
      visited.add(title);
      console.log(`[rl-lqp] fetching "${title}" (depth=${depth})`);
      let text;
      try {
        text = await fetchWikitext(title);
        fetchedCount++;
      } catch (e) {
        console.log(`[rl-lqp] "${title}" → ERREUR:`, e.message);
        errors.push({ page: title, error: e.message });
        continue;
      }
      if (!text) continue;

      // Extract match blocks
      const rawBlocks = [
        ...extractTemplateBlocks(text, "Match"),
        ...extractTemplateBlocks(text, "MatchMaps"),
      ].sort((a, b) => a.start - b.start);
      let matchCount = 0;
      const seenIds = new Set(allMatches.map(m => m.id));
      for (const b of rawBlocks) {
        const parsed = parseMatchBlock(b.text, title, null);
        if (!parsed) continue;
        if (seenIds.has(parsed.id)) continue;
        seenIds.add(parsed.id);
        allMatches.push(parsed);
        matchCount++;
      }
      console.log(`[rl-lqp] "${title}" → ${matchCount} matchs extraits`);

      // Discovery : suivre les liens vers sous-pages
      if (depth < DISCOVERY_MAX_DEPTH) {
        // Pour chaque seed, le préfixe pertinent est la page elle-même
        const prefix = title + "/";
        const links = findLinkedSubpages(text, prefix);
        for (const l of links.slice(0, 10)) {
          if (!visited.has(l)) queue.push({ title: l, depth: depth + 1 });
        }
      }
    }
    STATE = { generated_at: Date.now(), pages: Object.fromEntries([...visited].map(t => [t, true])), matches: allMatches, errors };
    persist();
    console.log(`[rl-lqp] refresh ok: ${allMatches.length} matchs sur ${visited.size} pages (${fetchedCount} fetchés, ${queue.length} skipped par le cap ${MAX_PAGES_PER_CYCLE})`);
  } catch (e) {
    console.log("[rl-lqp] refresh fatal:", e.message);
    errors.push({ scope: "refresh", error: e.message });
  } finally {
    busy = false;
  }
}

const REFRESH_MS = 20 * 60 * 1000; // 20min succès
const RETRY_MS = 5 * 60 * 1000;    // 5min échec

export function startRLLiquipediaMatchesWorker() {
  const scheduleNext = async () => {
    const hadData = STATE.matches.length > 0;
    try {
      await refresh();
      const ok = STATE.matches.length > 0 || hadData;
      setTimeout(scheduleNext, ok ? REFRESH_MS : RETRY_MS);
    } catch {
      setTimeout(scheduleNext, RETRY_MS);
    }
  };
  // Premier refresh 3min après boot (laisse les autres scrapers Liquipedia
  // finir leur init pour pas spammer en même temps).
  setTimeout(scheduleNext, 180 * 1000);
  console.log(`[rl-lqp] worker démarré (1er refresh dans 3min, cycle ${REFRESH_MS / 60000}min succès, retry ${RETRY_MS / 60000}min échec, ${SEED_PAGES.length} seeds)`);
}

export function getRLLiquipediaMatchesSnapshot() {
  const matches = STATE.matches || [];
  const upcoming = matches.filter(m => m.status === "upcoming");
  const live = matches.filter(m => m.status === "running");
  const past = matches.filter(m => m.status === "finished");
  return {
    generated_at: STATE.generated_at,
    age_minutes: STATE.generated_at ? Math.round((Date.now() - STATE.generated_at) / 60000) : null,
    counts: { upcoming: upcoming.length, live: live.length, past: past.length, total: matches.length },
    pages: Object.keys(STATE.pages || {}),
    upcoming,
    live,
    past,
    errors: STATE.errors || [],
  };
}

export async function forceRLLiquipediaMatchesRefresh() {
  await refresh();
  return getRLLiquipediaMatchesSnapshot();
}
