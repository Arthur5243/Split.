/**
 * Endpoints CS2 : /api/cs2-upcoming, /api/cs2-live, /api/cs2-results.
 *
 * Même architecture que les routes Valorant de server.js (pagination
 * séquentielle + retry 429, cache mémoire, accumulation SQLite pour ne
 * jamais perdre un résultat déjà vu), adaptée à deux différences propres à
 * CS2 :
 *   1. Le score par map vient en priorité d'odds-api.io (source officielle,
 *      cf oddsapi-scores.js — même clé ODDS_API_KEY déjà utilisée pour les
 *      cotes Valorant historiques), avec repli sur l'endpoint PandaScore
 *      lui-même (cs2-scores.js, /csgo/games/{id}) si rien n'est trouvé.
 *   2. La "région" est un attribut d'ÉQUIPE (Europe/Americas/Asia, via le
 *      pays), pas un attribut de match/ligue : un match n'est jamais exclu
 *      de la réponse pour une histoire de région (cf énoncé Régions →
 *      Ranking → Qualifiers → Stages communs → Playoffs → Champions — les
 *      stages finaux mélangent les régions).
 */

import express from "express";
import {
  pandaFetch,
  cachedFetch,
  mapWithConcurrency,
  sleep,
  classifyTeamRegion,
  getMapScoresForMatch,
  CS2_SLUG,
  PANDASCORE_API_KEY,
} from "./cs2-scores.js";
import {
  storeFinishedMatches,
  getFullHistoryFlat,
  saveMapScores,
  saveMapScoresFailure,
  getMapScoresState,
} from "./cs2-history-store.js";
import { getMapScoresFromOddsApi } from "./oddsapi-scores.js";

const router = express.Router();

if (!PANDASCORE_API_KEY) {
  console.warn(
    "⚠️  PANDASCORE_API_KEY n'est pas définie (CS2). Ajoute-la dans les variables d'environnement de Railway."
  );
}

function isFullyUnknown(m) {
  const t1 = m.opponents?.[0]?.opponent;
  const t2 = m.opponents?.[1]?.opponent;
  return !t1 && !t2;
}

// Ajoute team1_region / team2_region sur le match brut PandaScore, calculés
// depuis le pays (`location`) de chaque équipe. Fait une seule fois ici
// (backend) plutôt que côté front, pour garder une seule source de vérité
// sur la table pays -> région.
// Ajoute team1_region / team2_region (pays -> région) et stream_url (flux
// officiel du match si PandaScore le fournit, via `streams_list`) sur le
// match brut PandaScore. Fait une seule fois ici (backend) plutôt que côté
// front, pour garder une seule source de vérité.
function attachTeamRegions(m) {
  const t1 = m.opponents?.[0]?.opponent;
  const t2 = m.opponents?.[1]?.opponent;
  m.team1_region = t1 ? classifyTeamRegion(t1.location) : null;
  m.team2_region = t2 ? classifyTeamRegion(t2.location) : null;

  // Priorité : flux officiel + principal > flux officiel > 1er flux listé.
  // Reste `null` si PandaScore ne fournit rien pour ce match (aucun lien
  // inventé) — MatchCard retombe alors sur un badge "LIVE" non cliquable.
  const streams = Array.isArray(m.streams_list) ? m.streams_list : [];
  const bestStream =
    streams.find((s) => s && s.official && s.main) ||
    streams.find((s) => s && s.official) ||
    streams[0] ||
    null;
  m.stream_url = (bestStream && (bestStream.raw_url || bestStream.embed_url)) || null;

  return m;
}

router.get("/api/cs2-upcoming", async (req, res) => {
  try {
    const PER_PAGE = 100;
    const MAX_PAGES = 50;
    let all = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const pageData = await cachedFetch(
        "cs2-upcoming-" + page,
        "/" + CS2_SLUG + "/matches/upcoming?per_page=" + PER_PAGE + "&page=" + page + "&sort=begin_at"
      );
      if (!pageData || pageData.length === 0) break;
      all = all.concat(pageData);
      if (pageData.length < PER_PAGE) break;
      await sleep(200);
    }
    const data = all.filter((m) => !isFullyUnknown(m)).map(attachTeamRegions);
    res.json(data);
  } catch (e) {
    console.error("cs2-upcoming error:", e.message);
    res.status(502).json({ error: "Impossible de récupérer les matchs CS2 à venir." });
  }
});

// Filet de sécurité simple : un match encore "running" depuis plus de 6h
// (large marge pour un Bo5 CS2) est presque certainement bloqué côté statut
// PandaScore -> on le masque plutôt que de le montrer "en direct" pour de
// bon. Reconciliation "façon vlr.gg" volontairement pas reproduite ici (pas
// nécessaire) : on reste simple et strictement défensif.
const ABSOLUTE_HIDE_THRESHOLD_MS = 6 * 60 * 60 * 1000;

router.get("/api/cs2-live", async (req, res) => {
  try {
    const data = await cachedFetch("cs2-live", "/" + CS2_SLUG + "/matches/running?per_page=50");
    const now = Date.now();
    const visible = (data || []).filter((m) => {
      if (m.status !== "running") return true;
      const beginAt = m.begin_at ? new Date(m.begin_at).getTime() : null;
      return !(beginAt && now - beginAt >= ABSOLUTE_HIDE_THRESHOLD_MS);
    });
    res.json(visible.map(attachTeamRegions));
  } catch (e) {
    console.error("cs2-live error:", e.message);
    res.status(502).json({ error: "Impossible de récupérer les matchs CS2 en direct." });
  }
});

// --- Enrichissement score par map + accumulation, même principe que server.js ---

let enrichedResultsCache = null; // { data, time }
const ENRICHED_RESULTS_TTL_MS = 10 * 60 * 1000;
let enrichInProgress = false;

function toHistoryRow(m) {
  const t1 = m.opponents?.[0]?.opponent;
  const t2 = m.opponents?.[1]?.opponent;
  if (!t1 || !t2) return null;
  const results = m.results || [];
  const r1 = results.find((r) => r.team_id === t1.id);
  const r2 = results.find((r) => r.team_id === t2.id);
  return {
    id: String(m.id),
    team1: t1.name,
    team2: t2.name,
    team1Name: t1.name,
    team2Name: t2.name,
    score1: r1 ? r1.score : null,
    score2: r2 ? r2.score : null,
    status: m.status,
    team1Region: m.team1_region || null,
    team2Region: m.team2_region || null,
    league: m.league?.name || null,
    phase: m.serie?.full_name || null,
    day: (m.begin_at || "").slice(0, 10),
    time: (m.begin_at || "").slice(11, 16),
  };
}

function applyStoredMapScores(finished) {
  const stillUnknown = [];
  for (const m of finished) {
    const state = getMapScoresState(m.id);
    if (state === undefined || state.value === undefined) {
      const dueNow = !state || !state.nextRetryAt || new Date(state.nextRetryAt).getTime() <= Date.now();
      if (dueNow) stillUnknown.push(m);
      continue;
    }
    m.map_scores = state.value;
  }
  return stillUnknown;
}

async function enrichWithMapScores(data) {
  const finished = data
    .filter((m) => m.status === "finished")
    .sort((a, b) => new Date(b.begin_at) - new Date(a.begin_at));

  const toFetch = applyStoredMapScores(finished);

  await mapWithConcurrency(toFetch, 1, async (m) => {
    const t1 = m.opponents?.[0]?.opponent;
    const t2 = m.opponents?.[1]?.opponent;
    if (!t1 || !t2) return;
    let mapScores = null;
    const date = (m.begin_at || "").slice(0, 10);

    // 1) Priorité à odds-api.io (cf oddsapi-scores.js) : source officielle,
    // pas de scraping/captcha, réutilise la même clé ODDS_API_KEY déjà en
    // place pour les cotes Valorant historiques.
    try {
      mapScores = await getMapScoresFromOddsApi(t1.name, t2.name);
    } catch (e) {
      console.log(`[cs2 map_scores] odds-api.io ${t1.name} vs ${t2.name} → ERREUR:`, e.message);
    }
    // DIAGNOSTIC TEMPORAIRE (à retirer une fois le score par map CS2
    // confirmé fonctionnel en prod) : trace chaque match traité ici.
    console.log(
      `[cs2-map-diag] ${t1.name} vs ${t2.name} (id=${m.id}, ${date}) — ` +
        `oddsapi=${mapScores ? JSON.stringify(mapScores) : "aucun (repli PandaScore)"}`
    );

    // 2) Repli : endpoint PandaScore lui-même (/csgo/games/{id}), si
    // odds-api.io n'a rien trouvé pour ce match.
    if (!mapScores) {
      try {
        mapScores = await getMapScoresForMatch(m, t1.id, t2.id);
      } catch (e) {
        console.log(`[cs2 map_scores] PandaScore ${t1.name} vs ${t2.name} → ERREUR:`, e.message);
      }
    }

    m.map_scores = mapScores;
    if (mapScores) {
      saveMapScores(m.id, mapScores);
      enrichedResultsCache = { data: buildMergedResults(data), time: Date.now() };
    } else {
      saveMapScoresFailure(m.id);
    }
    await sleep(600); // pause entre chaque match traité, par courtoisie envers HLTV/PandaScore
  });
}

function toLiveHistoryShape(row) {
  const id1 = "cs2lh1_" + row.id;
  const id2 = "cs2lh2_" + row.id;
  const hasScore = row.score1 != null && row.score2 != null;
  return {
    id: row.id,
    begin_at: row.day ? row.day + "T" + (row.time || "00:00") + ":00Z" : null,
    status: row.status,
    tier: row.league || null,
    serie: { full_name: row.phase, name: row.phase },
    league: { name: row.league },
    team1_region: row.team1Region || null,
    team2_region: row.team2Region || null,
    opponents: [
      { opponent: { id: id1, name: row.team1Name || row.team1, acronym: null, image_url: null } },
      { opponent: { id: id2, name: row.team2Name || row.team2, acronym: null, image_url: null } },
    ],
    results: hasScore
      ? [
          { team_id: id1, score: row.score1 },
          { team_id: id2, score: row.score2 },
        ]
      : [],
    map_scores: row.map_scores || null,
  };
}

const ACCUMULATED_HISTORY_LIMIT = 400;

function buildMergedResults(liveData) {
  const liveIds = new Set(liveData.map((m) => String(m.id)));
  const accumulated = getFullHistoryFlat(ACCUMULATED_HISTORY_LIMIT)
    .filter((row) => row.status === "finished" && !liveIds.has(String(row.id)))
    .map(toLiveHistoryShape);
  const merged = [...liveData, ...accumulated];
  return merged.sort((a, b) => new Date(b.begin_at || 0) - new Date(a.begin_at || 0));
}

router.get("/api/cs2-results", async (req, res) => {
  try {
    const now = Date.now();
    if (enrichedResultsCache && now - enrichedResultsCache.time < ENRICHED_RESULTS_TTL_MS) {
      return res.json(enrichedResultsCache.data);
    }

    const data = (await cachedFetch("cs2-results", "/" + CS2_SLUG + "/matches/past?per_page=50")).map(
      attachTeamRegions
    );

    storeFinishedMatches(data.map(toHistoryRow).filter(Boolean));

    // Répond tout de suite avec ce qu'on a déjà en base (aucun appel réseau
    // bloquant), et lance l'enrichissement (retente vlr.gg-like PandaScore
    // /csgo/games) en arrière-plan pour les prochains polls — même logique
    // que server.js pour ne jamais faire attendre le front sur des requêtes
    // /csgo/games/{id} en série.
    applyStoredMapScores(data.filter((m) => m.status === "finished"));

    const merged = buildMergedResults(data);
    enrichedResultsCache = { data: merged, time: now };
    res.json(merged);

    if (!enrichInProgress) {
      enrichInProgress = true;
      enrichWithMapScores(data)
        .catch((e) => console.error("cs2 enrichWithMapScores error:", e.message))
        .finally(() => {
          enrichInProgress = false;
        });
    }
  } catch (e) {
    console.error("cs2-results error:", e.message);
    res.status(502).json({ error: "Impossible de récupérer les résultats CS2." });
  }
});

export default router;
