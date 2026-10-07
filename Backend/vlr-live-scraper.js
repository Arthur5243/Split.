/**
 * Scraper direct VLR.gg pour les scores par map des matchs LIVE Valorant.
 *
 * Intégré comme worker dans le backend (setInterval) — pas de process séparé.
 * Scrape la home VLR.gg pour trouver les matchs live, ouvre chaque page match
 * et lit les scores par map depuis le HTML (via cheerio).
 *
 * Les scores sont stockés dans un cache mémoire (liveScrapedScores) que
 * server.js consulte pour enrichir les matchs live/recently finished AVANT
 * que vlrggapi (ou PandaScore) n'ait le score — gain de temps de 5-15 min.
 */

import { load } from "cheerio";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PERSISTED_PATH = join(__dirname, "data", "scraped-map-scores.json");

const VLR_BASE_URL = "https://www.vlr.gg";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; SplitScoreBot/1.0; +https://github.com/Arthur5243/Split)",
  Accept: "text/html",
};

const liveScrapedScores = new Map();
const SCRAPED_TTL_MS = 4 * 60 * 60 * 1000; // 4h au lieu de 30min

// Table d'aliases: PandaScore name → VLR.gg name. Charge au boot et expose
// un reverse-lookup pour que getScrapedScores matche quand le scraper
// persiste "Xi Lai Gaming" alors que PandaScore utilise "XLG Gaming".
let TEAM_ALIAS_PANDA_TO_VLR = {};
let TEAM_ALIAS_VLR_TO_PANDA = {};
try {
  const aliasRaw = JSON.parse(readFileSync(join(__dirname, "data", "team-aliases.json"), "utf8"));
  for (const [pandaName, info] of Object.entries(aliasRaw)) {
    const vlr = info?.vlr_name;
    if (!vlr) continue;
    TEAM_ALIAS_PANDA_TO_VLR[pandaName.toLowerCase()] = vlr;
    TEAM_ALIAS_VLR_TO_PANDA[vlr.toLowerCase()] = pandaName;
  }
  console.log(`[vlr-scraper] ${Object.keys(TEAM_ALIAS_PANDA_TO_VLR).length} alias charges`);
} catch (e) {
  console.log(`[vlr-scraper] team-aliases.json pas charge: ${e.message}`);
}

// Charger les scores persistés au démarrage
try {
  const raw = JSON.parse(readFileSync(PERSISTED_PATH, "utf8"));
  for (const entry of raw) {
    const key = normalize(entry.team1) + ":" + normalize(entry.team2);
    liveScrapedScores.set(key, { ...entry, scrapedAt: Date.now() });
  }
  console.log(`[vlr-scraper] ${raw.length} score(s) persisté(s) rechargé(s)`);
} catch {}

function persistScores() {
  const entries = [];
  for (const [, entry] of liveScrapedScores) {
    if (entry.persisted) entries.push(entry);
  }
  try { writeFileSync(PERSISTED_PATH, JSON.stringify(entries, null, 2)); } catch {}
}

let consecutiveErrors = 0;
const MAX_BACKOFF_MS = 2 * 60 * 1000;
const BASE_INTERVAL_MS = 15_000;
const FINISHED_INTERVAL_MS = 2 * 60 * 1000;
const FINISHED_RETRY_MS = 10 * 60 * 1000;
const FINISHED_PER_RUN = 8;
const finishedLastTry = new Map();

function normalize(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function getScrapedScores(team1Name, team2Name) {
  const now = Date.now();
  // Build list of candidate names for each query team: raw + alias VLR
  // (ex: "XLG Gaming" → ["xlg gaming", "xi lai gaming"])
  const candidates = (name) => {
    const n = normalize(name);
    const out = new Set([n]);
    const vlr = TEAM_ALIAS_PANDA_TO_VLR[n];
    if (vlr) out.add(normalize(vlr));
    const panda = TEAM_ALIAS_VLR_TO_PANDA[n];
    if (panda) out.add(normalize(panda));
    return out;
  };
  const q1Set = candidates(team1Name);
  const q2Set = candidates(team2Name);
  for (const [, entry] of liveScrapedScores) {
    if (now - entry.scrapedAt > SCRAPED_TTL_MS) continue;
    const t1 = normalize(entry.team1);
    const t2 = normalize(entry.team2);
    // Match si t1/t2 appartient aux candidats q1/q2 (dans un sens ou l'autre)
    const matchDirect = q1Set.has(t1) && q2Set.has(t2);
    const matchSwap = q1Set.has(t2) && q2Set.has(t1);
    if (matchDirect || matchSwap) {
      const swap = matchSwap;
      // On renvoie TOUTES les maps (in-progress + finies), pas seulement
      // celles qui ont atteint 13. Sans ça, un match live avec 1ère map à
      // 4-10 renvoie null et le front affiche "Scores par map en attente"
      // alors qu'on a le score. Renvoie null seulement si aucune map n'a de
      // score exploitable.
      const anyMap = entry.maps.filter((m) => (m.score1 || 0) > 0 || (m.score2 || 0) > 0);
      if (anyMap.length === 0) return null;
      return anyMap.map((m) => ({
        map: m.map,
        score1: swap ? m.score2 : m.score1,
        score2: swap ? m.score1 : m.score2,
      }));
    }
  }
  return null;
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 403 || res.status === 429) {
    consecutiveErrors++;
    throw new Error(`HTTP ${res.status} (rate-limited)`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  consecutiveErrors = 0;
  return res.text();
}

async function findLiveMatches() {
  const html = await fetchHtml(VLR_BASE_URL);
  const $ = load(html);

  const liveMatches = [];

  $(".js-home-matches-upcoming a.wf-module-item").each((_, el) => {
    const $item = $(el);
    const isLive = $item.find(".h-match-eta.mod-live").length > 0;
    if (!isLive) return;

    const href = ($item.attr("href") || "").trim();
    const matchUrl = href.startsWith("http") ? href : `${VLR_BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;

    const teams = $item
      .find(".h-match-team-name")
      .map((__, t) => $(t).text().trim())
      .get();

    liveMatches.push({
      matchUrl,
      team1: teams[0] || "TBD",
      team2: teams[1] || "TBD",
    });
  });

  return liveMatches;
}

async function scrapeMapScores(matchUrl) {
  const html = await fetchHtml(matchUrl);
  const $ = load(html);

  const maps = [];

  $("div.vm-stats-game").each((_, gameEl) => {
    const $game = $(gameEl);
    if ($game.attr("data-game-id") === "all") return;

    const header = $game.find(".vm-stats-game-header");

    const $mapContainer = header.find(".map").first();
    let mapName = "";
    $mapContainer.find("span").each((__, sp) => {
      if (mapName) return;
      const txt = $(sp).text().trim();
      if (txt && !txt.toLowerCase().startsWith("pick")) {
        mapName = txt;
      }
    });
    if (!mapName) {
      mapName = $mapContainer.text().trim().split("\n")[0].trim();
      mapName = mapName.replace(/\s*\d{1,2}:\d{2}(:\d{2})?\s*$/, "").trim();
    }
    mapName = mapName.replace(/\s*(PICK|BAN|DECIDER)\s*$/i, "").trim();

    // VLR utilise <div class="team">...<div class="score">4</div>... et
    // <div class="team mod-right">...<div class="score">8</div>. On récupère
    // TOUS les .score dans .team (2 par game : gauche + droite) — l'ancienne
    // classe .results-team-score n'existe plus.
    const scoreDivs = header.find(".team .score, .team.mod-right .score");
    const score1 = scoreDivs.eq(0).text().trim();
    const score2 = scoreDivs.eq(1).text().trim();

    if (!score1 && !score2) return;

    const s1 = Number(score1) || 0;
    const s2 = Number(score2) || 0;

    if (s1 === 0 && s2 === 0) return;

    const isComplete = (s1 >= 13 || s2 >= 13) && Math.abs(s1 - s2) >= 2;

    maps.push({
      map: mapName || `Map ${maps.length + 1}`,
      score1: s1,
      score2: s2,
      complete: isComplete,
    });
  });

  return maps;
}

async function findRecentlyFinished() {
  const html = await fetchHtml(`${VLR_BASE_URL}/matches/results`);
  const $ = load(html);
  const matches = [];

  $("a.wf-module-item").each((_, el) => {
    const $item = $(el);
    const href = ($item.attr("href") || "").trim();
    if (!href || !href.includes("/")) return;

    const teams = $item
      .find(".match-item-vs-team-name .text-of")
      .map((__, t) => $(t).text().trim())
      .get();
    if (teams.length < 2 || !teams[0] || !teams[1]) return;

    const key = normalize(teams[0]) + ":" + normalize(teams[1]);
    const existing = liveScrapedScores.get(key);
    if (existing?.persisted) return; // déjà persisté avec maps complètes, skip
    if (Date.now() - (finishedLastTry.get(key) || 0) < FINISHED_RETRY_MS) return;

    const matchUrl = href.startsWith("http") ? href : `${VLR_BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
    matches.push({ matchUrl, team1: teams[0], team2: teams[1], finished: true });
  });

  return matches.slice(0, FINISHED_PER_RUN);
}

// Boucle rapide (15s) : uniquement les matchs en direct, scrapés en parallèle,
// pour que le score live ne prenne jamais de retard derrière le rattrapage
// des matchs terminés (boucle séparée, plus lente).
async function runLive() {
  const liveMatches = await findLiveMatches();
  await Promise.all(liveMatches.map(async (match) => {
    try {
      const maps = await scrapeMapScores(match.matchUrl);

      if (maps.length > 0) {
        const key = normalize(match.team1) + ":" + normalize(match.team2);
        const completeMaps = maps.filter((m) => m.complete);
        let wins1 = 0, wins2 = 0;
        for (const mp of completeMaps) { if (mp.score1 > mp.score2) wins1++; else wins2++; }
        const seriesDecided = wins1 >= 2 || wins2 >= 2;
        liveScrapedScores.set(key, {
          team1: match.team1,
          team2: match.team2,
          matchUrl: match.matchUrl,
          maps,
          scrapedAt: Date.now(),
          persisted: seriesDecided,
        });
        if (seriesDecided) persistScores();

        console.log(
          `[vlr-scraper] ${match.team1} vs ${match.team2} →`,
          maps
            .map((m) => `${m.map}: ${m.score1}-${m.score2}`)
            .join(" | "),
          seriesDecided ? "(persisté)" : ""
        );
      } else {
        // Log utile pour comprendre pourquoi le map score n'apparaît pas
        // côté front (match live détecté mais VLR n'a pas encore rendu les
        // scores map — délai typique 5-15min après le début).
        console.log(
          `[vlr-scraper] [live] ${match.team1} vs ${match.team2} → aucune map score sur ${match.matchUrl} (VLR pas encore à jour ?)`
        );
      }
    } catch (err) {
      console.error(
        `[vlr-scraper] erreur ${match.matchUrl}:`,
        err.message
      );
    }
  }));
}

async function runFinished() {
  try {
    const finishedMatches = await findRecentlyFinished();
    if (finishedMatches.length > 0) {
      console.log(`[vlr-scraper] ${finishedMatches.length} match(s) finis à scraper`);
    }
    for (const match of finishedMatches) {
      try {
        const key = normalize(match.team1) + ":" + normalize(match.team2);
        finishedLastTry.set(key, Date.now());
        const maps = await scrapeMapScores(match.matchUrl);
        const completeMaps = maps.filter((m) => m.complete);
        if (completeMaps.length > 0) {
          let wins1 = 0, wins2 = 0;
          for (const mp of completeMaps) { if (mp.score1 > mp.score2) wins1++; else wins2++; }
          const seriesDecided = wins1 >= 2 || wins2 >= 2;
          liveScrapedScores.set(key, {
            team1: match.team1,
            team2: match.team2,
            matchUrl: match.matchUrl,
            maps: completeMaps,
            scrapedAt: Date.now(),
            persisted: seriesDecided,
          });
          if (seriesDecided) persistScores();
          console.log(
            `[vlr-scraper] [finished] ${match.team1} vs ${match.team2} →`,
            completeMaps.map((m) => `${m.map}: ${m.score1}-${m.score2}`).join(" | "),
            seriesDecided ? "(persisté)" : ""
          );
        }
      } catch (err) {
        console.error(`[vlr-scraper] erreur finished ${match.matchUrl}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[vlr-scraper] erreur /matches/results:", err.message);
  }

  const now = Date.now();
  for (const [key, entry] of liveScrapedScores) {
    if (entry.persisted) continue; // ne jamais expirer les scores persistés
    if (now - entry.scrapedAt > SCRAPED_TTL_MS) {
      liveScrapedScores.delete(key);
    }
  }
}

function getNextInterval() {
  if (consecutiveErrors === 0) return BASE_INTERVAL_MS;
  const backoff = Math.min(
    BASE_INTERVAL_MS * Math.pow(2, consecutiveErrors),
    MAX_BACKOFF_MS
  );
  return backoff;
}

function startScraper() {
  console.log("[vlr-scraper] démarrage : live toutes les 15s, matchs terminés toutes les 2 min");

  async function liveLoop() {
    try {
      await runLive();
    } catch (err) {
      console.error("[vlr-scraper] erreur live:", err.message);
      consecutiveErrors++;
    }
    const next = getNextInterval();
    if (next > BASE_INTERVAL_MS) {
      console.log(`[vlr-scraper] backoff: prochain poll live dans ${Math.round(next / 1000)}s`);
    }
    setTimeout(liveLoop, next);
  }

  async function finishedLoop() {
    try {
      await runFinished();
    } catch (err) {
      console.error("[vlr-scraper] erreur finished:", err.message);
    }
    setTimeout(finishedLoop, Math.max(FINISHED_INTERVAL_MS, getNextInterval()));
  }

  setTimeout(liveLoop, 5000);
  setTimeout(finishedLoop, 20000);
}

export { startScraper, getScrapedScores, liveScrapedScores };
