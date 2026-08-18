/**
 * Endpoints CS2 : /api/cs2-upcoming, /api/cs2-live, /api/cs2-results.
 *
 * Même architecture que les routes Valorant de server.js (pagination
 * séquentielle + retry 429, cache mémoire, accumulation SQLite pour ne
 * jamais perdre un résultat déjà vu), adaptée à deux différences propres à
 * CS2 :
 *   1. Le score par map vient UNIQUEMENT de Liquipedia (cf
 *      liquipedia-scores.js) — odds-api.io et le repli PandaScore
 *      (/csgo/games/{id}) ont été retirés du circuit. PandaScore ne sert
 *      plus que pour le score de série (2-0, 2-1, etc.), déjà fourni
 *      directement par son endpoint /matches sans appel supplémentaire.
 *   2. La "région" est un attribut d'ÉQUIPE (Europe/Americas/Asia, via le
 *      pays), pas un attribut de match/ligue : un match n'est jamais exclu
 *      de la réponse pour une histoire de région (cf énoncé Régions →
 *      Ranking → Qualifiers → Stages communs → Playoffs → Champions — les
 *      stages finaux mélangent les régions).
 */

import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  pandaFetch,
  cachedFetch,
  mapWithConcurrency,
  sleep,
  classifyTeamRegion,
  CS2_SLUG,
  PANDASCORE_API_KEY,
} from "./cs2-scores.js";
import {
  storeFinishedMatches,
  getFullHistoryFlat,
  saveMapScores,
  saveMapScoresFailure,
  getMapScoresState,
  resetAbandonedMapScores,
} from "./cs2-history-store.js";
import { getMapScoresFromLiquipedia } from "./liquipedia-scores.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_KEY = process.env.ADMIN_KEY;
const CS2_MATCHES_PATH = path.join(__dirname, "data", "matches-cs2.json");

const router = express.Router();

// Remise à zéro des matchs CS2 "abandon définitif" — CONDITIONNÉE à la même
// variable d'env RESET_ABANDONED_MAP_SCORES=1 que côté Valorant, au lieu de
// se déclencher à chaque démarrage. Raison identique : le serveur redémarre
// à chaque déploiement, et relancer toute la file à chaque push l'empêchait
// de se vider (surtout côté CS2 où chaque match coûte jusqu'à 31s de
// throttle Liquipedia). À activer ponctuellement, puis retirer la variable.
if (process.env.RESET_ABANDONED_MAP_SCORES === "1") {
  try {
    const resetCount = resetAbandonedMapScores();
    console.log(`[startup] RESET_ABANDONED_MAP_SCORES=1 → ${resetCount} match(s) CS2 "abandon définitif" remis en jeu. Pense à retirer la variable d'env.`);
  } catch (e) {
    console.error("[startup] échec de la réinitialisation CS2 des matchs abandonnés:", e.message);
  }
}

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

// Matchs à masquer complètement de l'app (demande explicite) — coincés sur
// une mauvaise date côté PandaScore, sans résultat fiable trouvable.
// Comparaison par paire de noms (les deux sens), insensible à la casse.
const HIDDEN_MATCHUPS = [
  ["vitality academy", "phantom academy"],
  ["atreides", "ex-sashi academy"],
  ["bestia academy", "red canids academy"],
];
function isHiddenMatchup(m) {
  const t1 = (m.opponents?.[0]?.opponent?.name || "").toLowerCase();
  const t2 = (m.opponents?.[1]?.opponent?.name || "").toLowerCase();
  return HIDDEN_MATCHUPS.some(
    ([a, b]) => (t1.includes(a) && t2.includes(b)) || (t1.includes(b) && t2.includes(a))
  );
}

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

// PandaScore note chaque tournoi de S (le plus haut niveau) à D/Unranked
// (S > A > B > C > D > Unranked, cf leur doc officielle). CONFIRMÉ par
// diagnostic en prod : le champ direct `m.tier` n'existe pas (toujours
// undefined) — le vrai champ est `m.tournament.tier` ("s"/"a"/"b"/"c"/"d").
// On garde S/A/B, PLUS tout match d'un stage Kickoff ou Playoffs quel que
// soit son tier (ce sont les moments clés d'un tournoi, même quand le
// tournoi global n'est pas noté S/A/B) — le nom du stage vient de
// `m.tournament.name` côté PandaScore (ex: "Playoffs", "Kickoff").
const NOTABLE_TIERS = ["s", "a", "b"];
const KEY_STAGE_PATTERN = /kickoff|playoffs?/i;
// Les qualifications fermées ("Closed Qualifier") héritent souvent le tier
// du tournoi principal côté PandaScore (ex: "NODWIN Clutch Series 11 Closed
// Qualifier" hérite du tier de "NODWIN Clutch Series 11") sans avoir la même
// couverture sur Liquipedia — équipes trop obscures, jamais documentées.
// Constaté sur plusieurs matchs bloqués : CCT.../Closed Qualifier, NODWIN
// Clutch.../Closed Qualifier, Exort Fiesta.../Closed Qualifier. On les
// exclut explicitement, même si leur tier passerait le filtre ci-dessous.
const EXCLUDED_STAGE_PATTERN = /closed qualifier/i;
function isNotableTier(m) {
  const name = m.tournament?.name || "";
  if (EXCLUDED_STAGE_PATTERN.test(name)) return false;
  const tier = (m.tournament?.tier || "").toLowerCase();
  if (NOTABLE_TIERS.includes(tier)) return true;
  return KEY_STAGE_PATTERN.test(name);
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
    // Déduplique par id PandaScore : la pagination peut renvoyer le même
    // match deux fois si plusieurs matchs partagent exactement le même
    // begin_at (tri PandaScore alors instable d'un appel à l'autre).
    const seenIds = new Set();
    const deduped = all.filter((m) => {
      if (seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });
    const now = Date.now();
    const data = deduped
      .filter((m) => !isFullyUnknown(m) && isNotableTier(m) && !isHiddenMatchup(m))
      // Ne garde que les matchs réellement futurs — un match déjà commencé
      // (statut pas encore mis à jour côté PandaScore) ne doit pas polluer
      // "à venir".
      .filter((m) => {
        if (!m.begin_at) return true;
        const t = new Date(m.begin_at).getTime();
        return Number.isNaN(t) || t > now;
      })
      .map(attachTeamRegions);
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
      if (!isNotableTier(m) || isHiddenMatchup(m)) return false;
      if (m.status !== "running") return true;
      const beginAt = m.begin_at ? new Date(m.begin_at).getTime() : null;
      return !(beginAt && now - beginAt >= ABSOLUTE_HIDE_THRESHOLD_MS);
    });
    const withRegions = visible.map(attachTeamRegions);
    res.json(withRegions);
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
    if (Array.isArray(m.map_scores) && m.map_scores.length > 0) continue;
    const state = getMapScoresState(m.id);
    if (state === undefined || state.value === undefined) {
      const dueNow = !state || !state.nextRetryAt || new Date(state.nextRetryAt).getTime() <= Date.now();
      if (dueNow) stillUnknown.push(m);
      continue;
    }
    if (state.value != null) {
      m.map_scores = state.value;
    }
  }
  return stillUnknown;
}

async function enrichWithMapScores(data, forceRecheckIds = new Set()) {
  const finished = data
    .filter((m) => m.status === "finished")
    .sort((a, b) => new Date(b.begin_at) - new Date(a.begin_at));

  const gated = applyStoredMapScores(finished);
  // EXCEPTION : les matchs dans forceRecheckIds (ceux tout juste devenus
  // éligibles au sweep automatique parce qu'ils viennent de l'historique
  // accumulé) contournent le filtre normal — sinon un match déjà marqué
  // "abandon définitif" AVANT que ce sweep existe reste bloqué pour
  // toujours, même une fois la vraie cause corrigée.
  const forced = finished.filter((m) => forceRecheckIds.has(String(m.id)) && !gated.includes(m));
  const toFetch = [...gated, ...forced];

  await mapWithConcurrency(toFetch, 1, async (m) => {
    try {
      await processOneMatch(m, data);
    } catch (e) {
      // Filet de sécurité : une erreur inattendue ici ne doit plus jamais
      // interrompre le traitement des matchs suivants du lot (c'est
      // exactement ce qui s'est produit avec le bug "results is not
      // defined" — silencieux, il a fait planter tout le reste du cycle
      // sans qu'on le sache).
      console.error(`[cs2-map-diag] erreur inattendue sur le match ${m.id}:`, e.message);
    }
  });
}

// Score par map : Liquipedia en priorité, PandaScore /csgo/games/{id} en
// fallback (PandaScore fournit les round scores pour CS2, contrairement à
// Valorant). Un score déjà posé en base ne peut JAMAIS être écrasé.
async function processOneMatch(m, data) {
    const t1 = m.opponents?.[0]?.opponent;
    const t2 = m.opponents?.[1]?.opponent;
    if (!t1 || !t2) return;

    const existingState = getMapScoresState(m.id);
    if (existingState && existingState.value != null && existingState.value !== null) {
      m.map_scores = existingState.value;
      return;
    }

    let mapScores = null;
    const date = (m.begin_at || "").slice(0, 10);
    const leagueName = m.league?.name || "";
    const serieName = m.serie?.full_name || m.serie?.name || "";
    let source = null;

    try {
      mapScores = await getMapScoresFromLiquipedia(t1.name, t2.name, leagueName, date, serieName);
      if (mapScores) source = "liquipedia";
    } catch (e) {
      console.log(`[cs2 map_scores] liquipedia ${t1.name} vs ${t2.name} → ERREUR:`, e.message);
    }

    const seriesResults = m.results || [];
    const seriesR1 = seriesResults.find((r) => r.team_id === t1.id);
    const seriesR2 = seriesResults.find((r) => r.team_id === t2.id);
    const seriesScore = `${seriesR1 ? seriesR1.score : "?"}-${seriesR2 ? seriesR2.score : "?"}`;
    const diagLabel = [serieName, leagueName].filter(Boolean).join(" / ") || "?";
    console.log(
      `[cs2-map-diag] ${t1.name} ${seriesScore} ${t2.name} (id=${m.id}, ${date}, tournoi="${diagLabel}") — ` +
        `résultat=${mapScores ? `[${source}] ${JSON.stringify(mapScores)}` : "aucun (Liquipedia n'a rien trouvé)"}`
    );

    if (mapScores) {
      m.map_scores = mapScores;
      saveMapScores(m.id, mapScores);
      enrichedResultsCache = { data: buildMergedResults(data), time: Date.now() };
    } else {
      saveMapScoresFailure(m.id);
    }
    await sleep(600);
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
    .map(toLiveHistoryShape)
    .filter((m) => !isHiddenMatchup(m));

  // BUG CORRIGÉ (même cause que côté Valorant, cf server.js) : un match
  // sorti des 50 plus récents de PandaScore mais toujours affiché via
  // l'historique accumulé ci-dessus ne recevait JAMAIS l'appel Liquipedia —
  // enrichWithMapScores() n'était appelé que sur `liveData` (la fenêtre
  // fraîche), jamais sur l'accumulé. On expose ici la liste de ceux qui ont
  // encore besoin d'un sweep, pour que l'appelant (refreshCS2Results) les
  // ajoute au lot envoyé à enrichWithMapScores.
  const accumulatedNeedingSweep = accumulated.filter((m) => !m.map_scores);

  const merged = [...liveData, ...accumulated];
  const sorted = merged.sort((a, b) => new Date(b.begin_at || 0) - new Date(a.begin_at || 0));
  sorted.accumulatedNeedingSweep = accumulatedNeedingSweep; // attaché sans changer la forme du tableau
  return sorted;
}

// Rafraîchit et enrichit les résultats CS2 (fetch PandaScore + pose des
// scores déjà connus + lance le sweep Liquipedia en
// tâche de fond si besoin). Extrait de la route pour pouvoir être appelé
// aussi bien par une requête HTTP que par la tâche de fond périodique plus
// bas — avant, tout le pipeline ne tournait que si quelqu'un avait l'app
// ouverte et appelait /api/cs2-results ; si personne n'était connecté, rien
// ne se mettait jamais à jour, même pour des matchs terminés depuis
// longtemps.
//
// `force` : ignore la fraîcheur du cache (tout en respectant
// enrichInProgress). BUG CORRIGÉ : sans ce paramètre, la tâche de fond
// (toutes les 5 min) tombait TOUJOURS sur "cache encore frais" (TTL de
// 10 min) et ne faisait donc jamais de vrai travail après le 1er passage.
async function refreshCS2Results(force = false) {
  const now = Date.now();
  if (!force && enrichedResultsCache && now - enrichedResultsCache.time < ENRICHED_RESULTS_TTL_MS) {
    return enrichedResultsCache.data;
  }

  const data = (await cachedFetch("cs2-results", "/" + CS2_SLUG + "/matches/past?per_page=50"))
    .filter((m) => m.status !== "canceled" && isNotableTier(m) && !isHiddenMatchup(m))
    .map(attachTeamRegions);

  storeFinishedMatches(data.map(toHistoryRow).filter(Boolean));

  // Répond tout de suite avec ce qu'on a déjà en base (aucun appel réseau
  // bloquant), et lance l'enrichissement (retente vlr.gg-like PandaScore
  // /csgo/games) en arrière-plan pour les prochains polls — même logique
  // que server.js pour ne jamais faire attendre le front sur des requêtes
  // /csgo/games/{id} en série.
  applyStoredMapScores(data.filter((m) => m.status === "finished"));

  const merged = buildMergedResults(data);
  enrichedResultsCache = { data: merged, time: now };

  // Le lot envoyé au sweep Liquipedia inclut maintenant aussi les matchs
  // accumulés sans score (cf commentaire sur buildMergedResults), avec
  // bypass du blocage "abandon définitif" hérité pour eux (cf commentaire
  // sur enrichWithMapScores) — sinon ils ne sont jamais tentés du tout,
  // silencieusement.
  const accumulatedNeedingSweep = merged.accumulatedNeedingSweep || [];
  const dataToEnrich = [...data, ...accumulatedNeedingSweep];
  const forceRecheckIds = new Set(accumulatedNeedingSweep.map((m) => String(m.id)));

  if (!enrichInProgress) {
    enrichInProgress = true;
    enrichWithMapScores(dataToEnrich, forceRecheckIds)
      .catch((e) => console.error("cs2 enrichWithMapScores error:", e.message))
      .finally(() => {
        enrichInProgress = false;
      });
  }

  return merged;
}

router.get("/api/cs2-results", async (req, res) => {
  try {
    const merged = await refreshCS2Results();
    res.json(merged);
  } catch (e) {
    console.error("cs2-results error:", e.message);
    res.status(502).json({ error: "Impossible de récupérer les résultats CS2." });
  }
});

// Tâche de fond : rejoue le même rafraîchissement toutes les
// BACKGROUND_REFRESH_INTERVAL_MS, indépendamment de toute requête HTTP —
// c'est ça qui garantit que les scores CS2 se posent même si personne n'a
// l'app ouverte. `force=true` : garantit un vrai travail à chaque passage
// (cf commentaire sur refreshCS2Results) ; `enrichInProgress` protège quand
// même contre le chevauchement.
const CS2_BACKGROUND_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  refreshCS2Results(true).catch((e) => console.error("[cs2 background refresh]", e.message));
}, CS2_BACKGROUND_REFRESH_INTERVAL_MS);

// --- Historique profond CS2 (équivalent matches.json / /admin/export-matches côté Valorant) ---
//
// Le système de cotes "maison" (attachComputedOdds) a besoin d'un gros
// historique de matchs terminés pour calculer des winrates fiables. Côté
// Valorant, ça vient de Backend/data/matches.json (2500+ matchs depuis
// janvier 2025, alimenté via /admin/export-matches). CS2 n'avait pas
// d'équivalent — juste l'historique accumulé organiquement depuis qu'on
// travaille sur ce projet, beaucoup trop mince pour des cotes fiables.
//
// Même workflow que Valorant : /admin/export-matches-cs2 télécharge un gros
// JSON (tous les matchs CS2 terminés depuis 2025 sur PandaScore), à coller
// tel quel dans Backend/data/matches-cs2.json sur GitHub.

function toStoredShapeCS2(raw, index) {
  const t1 = raw.opponents?.[0]?.opponent;
  const t2 = raw.opponents?.[1]?.opponent;
  if (!t1 || !t2) return null;

  const date = raw.begin_at ? raw.begin_at.slice(0, 10) : null;
  if (!date) return null;

  const results = raw.results || [];
  const r1 = results.find((r) => r.team_id === t1.id);
  const r2 = results.find((r) => r.team_id === t2.id);
  if (!r1 || !r2) return null;
  if (r1.score === 0 && r2.score === 0) return null;

  const winner = raw.winner?.name || (r1.score > r2.score ? t1.name : r2.score > r1.score ? t2.name : null);

  return {
    match_id: index + 1,
    pandascore_id: raw.id,
    tournament_id: raw.tournament?.id ? "PANDA_" + raw.tournament.id : "PANDA_UNKNOWN",
    tournament_name: raw.tournament?.name || raw.league?.name || "Unknown",
    tier: raw.league?.name || "Unknown",
    region: "AUTO",
    date,
    stage: raw.serie?.full_name || raw.name || "Unknown",
    team1: t1.name,
    team2: t2.name,
    score: r1.score + "-" + r2.score,
    winner,
  };
}

async function fetchAllPastMatchesCS2() {
  const all = [];
  const MAX_PAGES = 30; // 30 x 100 = 3000 matchs max, largement assez pour 2025-2026
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await pandaFetch("/" + CS2_SLUG + "/matches/past?per_page=100&page=" + page + "&sort=-begin_at");
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    const oldest = batch[batch.length - 1];
    if (oldest?.begin_at && oldest.begin_at.slice(0, 4) < "2025") break;
  }
  return all;
}

router.get("/admin/export-matches-cs2", async (req, res) => {
  if (!ADMIN_KEY || req.query.key !== ADMIN_KEY) {
    return res.status(403).send("Accès refusé.");
  }
  try {
    const raw = await fetchAllPastMatchesCS2();
    const inRange = raw.filter((m) => {
      const y = m.begin_at ? m.begin_at.slice(0, 4) : null;
      return y === "2025" || y === "2026";
    });
    const seen = new Set();
    const cleaned = [];
    for (const m of inRange) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      cleaned.push(m);
    }
    cleaned.sort((a, b) => (a.begin_at || "").localeCompare(b.begin_at || ""));

    const formatted = cleaned.map(toStoredShapeCS2).filter(Boolean);
    const json = JSON.stringify(formatted, null, 2);

    console.log(`export-matches-cs2: ${formatted.length} matchs, ${json.length} caractères`);
    res.setHeader("Content-Disposition", 'attachment; filename="matches-cs2.json"');
    res.type("application/json").send(json);
  } catch (e) {
    console.error("export-matches-cs2 error:", e.message);
    res.status(502).send("Erreur PandaScore : " + e.message);
  }
});

// Même conversion que toPandaScoreShape côté Valorant (server.js) : rend
// data/matches-cs2.json exploitable par transformMatchCS2() côté front, sans
// rien changer à App.jsx au-delà du branchement (comme pour Valorant).
function toPandaScoreShapeCS2(m, index) {
  const id1 = "h1_" + (m.match_id ?? index);
  const id2 = "h2_" + (m.match_id ?? index);
  const parts = (m.score || "").split("-").map((s) => parseInt(s.trim(), 10));
  const hasScore = parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1]);

  return {
    id: m.pandascore_id || "hist_" + m.match_id,
    begin_at: m.date ? m.date + "T00:00:00Z" : null,
    status: "finished",
    tier: m.tier || null,
    tournament: { name: m.tournament_name },
    serie: { full_name: m.tournament_name, name: m.tournament_name },
    league: { name: m.tournament_name || "CS2" },
    opponents: [
      { opponent: { id: id1, name: m.team1, acronym: null, image_url: null } },
      { opponent: { id: id2, name: m.team2, acronym: null, image_url: null } },
    ],
    results: hasScore
      ? [
          { team_id: id1, score: parts[0] },
          { team_id: id2, score: parts[1] },
        ]
      : [],
  };
}

router.get("/api/cs2-match-history", (req, res) => {
  try {
    if (!fs.existsSync(CS2_MATCHES_PATH)) {
      return res.json([]); // pas encore backfillé -> liste vide, jamais d'erreur
    }
    const raw = fs.readFileSync(CS2_MATCHES_PATH, "utf-8");
    const matches = JSON.parse(raw);
    const usable = matches.filter((m) => m.team1 && m.team2 && m.team1 !== "TBD" && m.team2 !== "TBD");
    res.json(usable.map(toPandaScoreShapeCS2));
  } catch (e) {
    console.error("cs2-match-history error:", e.message);
    res.status(500).json({ error: "Impossible de lire l'historique CS2." });
  }
});

export default router;
