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
    const data = all.filter((m) => !isFullyUnknown(m) && isNotableTier(m)).map(attachTeamRegions);
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
      if (!isNotableTier(m)) return false;
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

// Liquipedia est l'UNIQUE source du score par map (cf liquipedia-scores.js)
// — odds-api.io et le repli PandaScore /csgo/games/{id} ont été retirés :
// PandaScore ne sert plus que pour le score de série (2-0, 2-1, etc., déjà
// fourni directement par son endpoint /matches, sans appel supplémentaire).
async function processOneMatch(m, data) {
    const t1 = m.opponents?.[0]?.opponent;
    const t2 = m.opponents?.[1]?.opponent;
    if (!t1 || !t2) return;
    let mapScores = null;
    const date = (m.begin_at || "").slice(0, 10);
    const tournamentName = m.league?.name || m.serie?.full_name || "";

    try {
      mapScores = await getMapScoresFromLiquipedia(t1.name, t2.name, tournamentName, date);
    } catch (e) {
      console.log(`[cs2 map_scores] liquipedia ${t1.name} vs ${t2.name} → ERREUR:`, e.message);
    }
    // DIAGNOSTIC TEMPORAIRE (à retirer une fois le score par map CS2
    // confirmé fonctionnel en prod) : trace chaque match traité ici, avec
    // le score de série (X-Y, ex: 2-1) pour pouvoir lister les matchs sans
    // score par map à implémenter à la main en attendant.
    const seriesResults = m.results || [];
    const seriesR1 = seriesResults.find((r) => r.team_id === t1.id);
    const seriesR2 = seriesResults.find((r) => r.team_id === t2.id);
    const seriesScore = `${seriesR1 ? seriesR1.score : "?"}-${seriesR2 ? seriesR2.score : "?"}`;
    console.log(
      `[cs2-map-diag] ${t1.name} ${seriesScore} ${t2.name} (id=${m.id}, ${date}, tournoi="${tournamentName}") — ` +
        `résultat=${mapScores ? JSON.stringify(mapScores) : "aucun (Liquipedia n'a rien trouvé)"}`
    );

    m.map_scores = mapScores;
    if (mapScores) {
      saveMapScores(m.id, mapScores);
      enrichedResultsCache = { data: buildMergedResults(data), time: Date.now() };
    } else {
      saveMapScoresFailure(m.id);
    }
    await sleep(600); // pause entre chaque match traité, par courtoisie envers HLTV/PandaScore
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
    .filter(isNotableTier)
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

export default router;
