/**
 * Endpoints CS2 : /api/cs2-upcoming, /api/cs2-live, /api/cs2-results.
 *
 * Même architecture que les routes Valorant de server.js (pagination
 * séquentielle + retry 429, cache mémoire, accumulation SQLite pour ne
 * jamais perdre un résultat déjà vu), adaptée à deux différences propres à
 * CS2 :
 *   1. Le score par map suit une cascade de sources :
 *      Liquipedia (priorité) → bo3.gg API (fallback automatique) →
 *      saisie manuelle (data/cs2-manual-map-scores.json, dernier recours).
 *      Si une source renvoie un résultat partiel (moins de maps que le score
 *      de série attendu), la source suivante est aussi consultée.
 *      PandaScore ne sert que pour le score de série (2-0, 2-1, etc.).
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
import { getMapScoresFromBo3gg } from "./bo3gg-scores.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_KEY = process.env.ADMIN_KEY;
const CS2_MATCHES_PATH = path.join(__dirname, "data", "matches-cs2.json");
const CS2_MANUAL_SCORES_PATH = path.join(__dirname, "data", "cs2-manual-map-scores.json");

const cs2ManualScores = (() => {
  try {
    const raw = JSON.parse(fs.readFileSync(CS2_MANUAL_SCORES_PATH, "utf-8"));
    if (!Array.isArray(raw)) return [];
    console.log(`[cs2] ${raw.length} entrée(s) chargée(s) depuis cs2-manual-map-scores.json`);
    return raw;
  } catch (e) {
    if (e.code !== "ENOENT") console.warn("[cs2] erreur lecture cs2-manual-map-scores.json:", e.message);
    return [];
  }
})();

function normalizeTeamName(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function teamNamesMatch(a, b) {
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const stripSuffix = (s) => s.replace(/\s*(esports?|gaming|team|club)\s*$/i, "").trim();
  return stripSuffix(a) === stripSuffix(b);
}

function findCS2ManualMapScores(team1Name, team2Name, dateStr) {
  if (cs2ManualScores.length === 0) return null;
  const n1 = normalizeTeamName(team1Name);
  const n2 = normalizeTeamName(team2Name);
  for (const entry of cs2ManualScores) {
    const d = dateStr && entry.date ? Math.abs(new Date(dateStr) - new Date(entry.date)) / 86400000 : 0;
    if (d > 1) continue;
    const en1 = normalizeTeamName(entry.team1);
    const en2 = normalizeTeamName(entry.team2);
    if (teamNamesMatch(en1, n1) && teamNamesMatch(en2, n2)) {
      return entry.maps.map((m) => ({ map: m.map, score1: m.score1, score2: m.score2 }));
    }
    if (teamNamesMatch(en1, n2) && teamNamesMatch(en2, n1)) {
      return entry.maps.map((m) => ({ map: m.map, score1: m.score2, score2: m.score1 }));
    }
  }
  return null;
}

function getExpectedMapCount(m) {
  const t1 = m.opponents?.[0]?.opponent;
  const t2 = m.opponents?.[1]?.opponent;
  if (!t1 || !t2) return 0;
  const results = m.results || [];
  const r1 = results.find((r) => r.team_id === t1.id);
  const r2 = results.find((r) => r.team_id === t2.id);
  let expected = (r1?.score || 0) + (r2?.score || 0);
  if (Array.isArray(m.games)) {
    expected -= m.games.filter((g) => g.forfeit).length;
  }
  return Math.max(expected, 0);
}

function getSeriesScores(m) {
  const t1 = m.opponents?.[0]?.opponent;
  const t2 = m.opponents?.[1]?.opponent;
  if (!t1 || !t2) return [null, null];
  const results = m.results || [];
  return [
    results.find((r) => r.team_id === t1.id)?.score ?? null,
    results.find((r) => r.team_id === t2.id)?.score ?? null,
  ];
}

function isMapScoresConsistent(mapScores, score1, score2) {
  if (!Array.isArray(mapScores) || mapScores.length === 0) return false;
  if (score1 == null || score2 == null) return true;
  let wins1 = 0, wins2 = 0;
  for (const ms of mapScores) {
    if (ms.score1 > ms.score2) wins1++;
    else if (ms.score2 > ms.score1) wins2++;
  }
  return wins1 === score1 && wins2 === score2;
}

const router = express.Router();

// Reset automatique des matchs CS2 "abandon définitif" à chaque démarrage.
// Maintenant que saveMapScoresFailure ne produit plus d'abandon définitif
// (backoff plafonné à 2h), ce reset ne sert que pour les anciens matchs
// déjà marqués "null" en base — ils sont remis en jeu à chaque deploy.
try {
  const resetCount = resetAbandonedMapScores();
  if (resetCount > 0) {
    console.log(`[startup] ${resetCount} match(s) CS2 "abandon définitif" remis en jeu automatiquement.`);
  }
} catch (e) {
  console.error("[startup] échec de la réinitialisation CS2 des matchs abandonnés:", e.message);
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
const EXCLUDED_STAGE_PATTERN = /closed qualifier/i;
function isNotableTier(m) {
  const name = m.tournament?.name || "";
  if (EXCLUDED_STAGE_PATTERN.test(name)) return false;
  const tier = (m.tournament?.tier || "").toLowerCase();
  return NOTABLE_TIERS.includes(tier);
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
    if (Array.isArray(m.map_scores) && m.map_scores.length > 0) {
      const expected = getExpectedMapCount(m);
      const [s1, s2] = getSeriesScores(m);
      if ((expected > 0 && m.map_scores.length < expected) || !isMapScoresConsistent(m.map_scores, s1, s2)) {
        stillUnknown.push(m);
      }
      continue;
    }
    const state = getMapScoresState(m.id);
    if (state === undefined || state.value === undefined) {
      const dueNow = !state || !state.nextRetryAt || new Date(state.nextRetryAt).getTime() <= Date.now();
      if (dueNow) stillUnknown.push(m);
      continue;
    }
    if (state.value != null) {
      m.map_scores = state.value;
      const expected = getExpectedMapCount(m);
      const [s1, s2] = getSeriesScores(m);
      if ((expected > 0 && state.value.length < expected) || !isMapScoresConsistent(state.value, s1, s2)) {
        stillUnknown.push(m);
      }
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

// Score par map : Liquipedia → bo3.gg → saisie manuelle.
// Chaque source est VALIDÉE : si les gagnants des maps ne correspondent pas
// au score de la série (ex: Liquipedia renvoie 3 maps gagnées par team2 pour
// un match 2-1), les scores sont rejetés et la source suivante est essayée.
// Un résultat incohérent en DB peut être écrasé par un résultat cohérent.
async function processOneMatch(m, data) {
    const t1 = m.opponents?.[0]?.opponent;
    const t2 = m.opponents?.[1]?.opponent;
    if (!t1 || !t2) return;

    const expectedMaps = getExpectedMapCount(m);
    const [s1, s2] = getSeriesScores(m);

    const existingState = getMapScoresState(m.id);
    let storedInconsistent = false;
    if (existingState && existingState.value != null && existingState.value !== null) {
      const storedOk = isMapScoresConsistent(existingState.value, s1, s2);
      if (storedOk && (!expectedMaps || existingState.value.length >= expectedMaps)) {
        m.map_scores = existingState.value;
        return;
      }
      if (storedOk) {
        m.map_scores = existingState.value;
      } else {
        storedInconsistent = true;
      }
    }

    let mapScores = null;
    const date = (m.begin_at || "").slice(0, 10);
    const leagueName = m.league?.name || "";
    const serieName = m.serie?.full_name || m.serie?.name || "";
    let source = null;

    try {
      mapScores = await getMapScoresFromLiquipedia(t1.name, t2.name, leagueName, date, serieName);
      if (mapScores) {
        if (isMapScoresConsistent(mapScores, s1, s2)) {
          source = "liquipedia";
        } else {
          console.log(`[cs2-map-diag] ${t1.name} vs ${t2.name} — Liquipedia incohérent (gagnants maps ≠ série), rejeté`);
          mapScores = null;
        }
      }
    } catch (e) {
      console.log(`[cs2 map_scores] liquipedia ${t1.name} vs ${t2.name} → ERREUR:`, e.message);
    }

    if (!mapScores || (expectedMaps > 0 && mapScores.length < expectedMaps)) {
      try {
        const bo3ggScores = await getMapScoresFromBo3gg(t1.name, t2.name, date);
        if (bo3ggScores && (!mapScores || bo3ggScores.length > mapScores.length)) {
          if (isMapScoresConsistent(bo3ggScores, s1, s2)) {
            mapScores = bo3ggScores;
            source = "bo3gg";
          } else {
            console.log(`[cs2-map-diag] ${t1.name} vs ${t2.name} — bo3.gg incohérent (gagnants maps ≠ série), rejeté`);
          }
        }
      } catch (e) {
        console.log(`[cs2 map_scores] bo3.gg ${t1.name} vs ${t2.name} → ERREUR:`, e.message);
      }
    }

    if (!mapScores || (expectedMaps > 0 && mapScores.length < expectedMaps)) {
      const manual = findCS2ManualMapScores(t1.name, t2.name, date);
      if (manual && (!mapScores || manual.length > mapScores.length)) {
        mapScores = manual;
        source = "manual";
      }
    }

    const seriesScore = `${s1 ?? "?"}-${s2 ?? "?"}`;
    const diagLabel = [serieName, leagueName].filter(Boolean).join(" / ") || "?";
    console.log(
      `[cs2-map-diag] ${t1.name} ${seriesScore} ${t2.name} (id=${m.id}, ${date}, tournoi="${diagLabel}") — ` +
        `résultat=${mapScores ? `[${source}] ${JSON.stringify(mapScores)}` : "aucun (ni Liquipedia, ni bo3.gg, ni saisie manuelle)"}`
    );

    if (mapScores) {
      m.map_scores = mapScores;
      saveMapScores(m.id, mapScores, { force: storedInconsistent });
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

// ---------------------------------------------------------------------------
// CS2 Bracket system — /api/cs2-events + /api/cs2-bracket/:serieId
// ---------------------------------------------------------------------------

const cs2EventsCache = { data: null, at: 0 };
const CS2_EVENTS_TTL = 10 * 60 * 1000;

function classifyCS2Competition(leagueName, serieName) {
  const l = (leagueName || "").toLowerCase();
  const s = (serieName || "").toLowerCase();
  const combined = l + " " + s;

  if (combined.includes("major") && !combined.includes("iem"))
    return "major";
  if (l.includes("iem") || l.includes("intel extreme masters"))
    return combined.includes("major") ? "iem_major" : "iem";
  if (l.includes("blast"))
    return combined.includes("bounty") ? "blast_bounty" : "blast";
  if (l.includes("esl"))
    return "esl";
  if (l.includes("pgl"))
    return "pgl";
  return null;
}

function cs2CompetitionLabel(comp) {
  const labels = {
    major: "Major",
    iem_major: "IEM Major",
    iem: "IEM",
    blast: "Blast",
    blast_bounty: "Blast Bounty",
    esl: "ESL",
    pgl: "PGL",
  };
  return labels[comp] || comp;
}

router.get("/api/cs2-events", async (req, res) => {
  try {
    if (cs2EventsCache.data && Date.now() - cs2EventsCache.at < CS2_EVENTS_TTL) {
      return res.json(cs2EventsCache.data);
    }

    const all = await pandaFetch("/" + CS2_SLUG + "/series?sort=-begin_at&per_page=50");
    const deduped = all || [];

    const result = { major: [], iem: [], blast: [], esl: [], pgl: [] };

    for (const s of deduped) {
      const tier = (s.tier || "").toLowerCase();
      if (!["s", "a", "b"].includes(tier)) continue;

      const leagueName = s.league?.name || "";
      const serieName = s.full_name || s.name || "";
      const comp = classifyCS2Competition(leagueName, serieName);
      if (!comp) continue;

      const bucket =
        comp === "major" ? "major" :
        comp === "iem_major" || comp === "iem" ? "iem" :
        comp === "blast" || comp === "blast_bounty" ? "blast" :
        comp === "esl" ? "esl" :
        comp === "pgl" ? "pgl" : null;
      if (!bucket) continue;

      const info = {
        serie_id: s.id,
        title: serieName || leagueName,
        league: leagueName,
        status: s.status || "unknown",
        begin_at: s.begin_at,
        end_at: s.end_at,
        tier: tier,
        type: comp,
        year: s.year,
      };

      result[bucket].push(info);
    }

    for (const key of Object.keys(result)) {
      result[key].sort((a, b) => {
        if (a.status === "running" && b.status !== "running") return -1;
        if (b.status === "running" && a.status !== "running") return 1;
        return (b.begin_at || "").localeCompare(a.begin_at || "");
      });
    }

    cs2EventsCache.data = result;
    cs2EventsCache.at = Date.now();
    res.json(result);
  } catch (e) {
    console.error("cs2-events error:", e.message);
    res.status(502).json({ error: "Impossible de récupérer les events CS2." });
  }
});

const cs2BracketCache = new Map();
const CS2_BRACKET_TTL = 5 * 60 * 1000;

function classifyCS2Round(matchData) {
  const tournamentName = (matchData._tournamentName || "").toLowerCase();
  const matchName = (matchData.name || "").toLowerCase();

  if (tournamentName.includes("playoff") || tournamentName.includes("final")) {
    return "playoffs";
  }
  if (tournamentName.includes("play-in") || tournamentName.includes("play_in") || tournamentName.includes("play in")) {
    return "play_ins";
  }
  if (tournamentName.includes("stage 1") || tournamentName.includes("stage 2") || tournamentName.includes("stage 3")) {
    return "stage";
  }
  if (tournamentName.includes("group") || tournamentName.includes("round robin") || tournamentName.includes("swiss") || tournamentName.includes("elimination")) {
    return "group_stage";
  }
  return "group_stage";
}

function classifyCS2MatchRound(series) {
  const s = (series || "").toLowerCase().trim();
  if (s.includes("grand final")) return { bracket: "grand_final", round: s, sort: 100 };
  if (s.includes("upper") || s.includes("winners")) return { bracket: "upper", round: s, sort: 50 };
  if (s.includes("lower") || s.includes("losers")) return { bracket: "lower", round: s, sort: 60 };
  if (s.includes("semifinal")) return { bracket: "upper", round: s, sort: 45 };
  if (s.includes("quarterfinal")) return { bracket: "upper", round: s, sort: 40 };
  if (s.includes("final")) return { bracket: "grand_final", round: s, sort: 100 };
  if (s.includes("round") || s.includes("group") || s.includes("swiss")) return { bracket: "group", round: s, sort: -1 };
  return { bracket: "other", round: s, sort: -1 };
}

function buildCS2Bracket(matches) {
  const rounds = {};
  for (const m of matches) {
    const key = m.round;
    if (!rounds[key]) rounds[key] = { name: m.round, bracket: m.bracket, sort: m.sort, matches: [] };
    rounds[key].matches.push(m);
  }
  const upper = Object.values(rounds).filter((r) => r.bracket === "upper").sort((a, b) => a.sort - b.sort);
  const lower = Object.values(rounds).filter((r) => r.bracket === "lower").sort((a, b) => a.sort - b.sort);
  const grandFinal = Object.values(rounds).filter((r) => r.bracket === "grand_final").sort((a, b) => a.sort - b.sort);
  return { upper, lower, grand_final: grandFinal };
}

router.get("/api/cs2-bracket/:serieId", async (req, res) => {
  const { serieId } = req.params;
  if (!/^\d+$/.test(serieId)) return res.status(400).json({ error: "serieId invalide" });

  try {
    const cacheKey = "cs2-bracket:" + serieId;
    const cached = cs2BracketCache.get(cacheKey);
    if (cached && Date.now() - cached.at < CS2_BRACKET_TTL) {
      return res.json(cached.data);
    }

    const [serie, tournamentsRaw] = await Promise.all([
      pandaFetch("/" + CS2_SLUG + "/series/" + serieId),
      pandaFetch("/" + CS2_SLUG + "/series/" + serieId + "/tournaments"),
    ]);
    const tournaments = Array.isArray(tournamentsRaw) && tournamentsRaw.length > 0
      ? tournamentsRaw
      : (serie.tournaments || []);

    const phases = [];
    const allTeams = new Set();

    for (let ti = 0; ti < tournaments.length; ti++) {
      const t = tournaments[ti];
      const tName = t.name || "";
      const tId = t.id;

      let matches = [];
      try {
        if (ti > 0) await sleep(300);
        matches = await pandaFetch("/" + CS2_SLUG + "/tournaments/" + tId + "/matches?per_page=100&sort=scheduled_at");
      } catch (e) {
        console.warn("cs2-bracket: skip tournament", tId, e.message);
        continue;
      }

      const groupMatches = [];
      const bracketMatches = [];

      for (const m of matches) {
        const t1 = m.opponents?.[0]?.opponent;
        const t2 = m.opponents?.[1]?.opponent;
        if (t1?.name) allTeams.add(t1.name);
        if (t2?.name) allTeams.add(t2.name);

        const results = m.results || [];
        const r1 = t1 ? results.find((r) => r.team_id === t1.id) : null;
        const r2 = t2 ? results.find((r) => r.team_id === t2.id) : null;

        const roundName = m.name || tName;
        const cl = classifyCS2MatchRound(roundName);

        const match = {
          match_id: m.id,
          date: m.begin_at || m.scheduled_at,
          status: m.status,
          round: roundName,
          round_normalized: cl.round,
          bracket: cl.bracket,
          sort: cl.sort,
          team1: {
            name: t1?.name || "TBD",
            score: r1?.score != null ? String(r1.score) : "–",
            is_winner: m.winner_id && t1 && m.winner_id === t1.id,
            image_url: t1?.image_url || null,
          },
          team2: {
            name: t2?.name || "TBD",
            score: r2?.score != null ? String(r2.score) : "–",
            is_winner: m.winner_id && t2 && m.winner_id === t2.id,
            image_url: t2?.image_url || null,
          },
        };

        if (cl.bracket === "group" || cl.bracket === "other") {
          groupMatches.push(match);
        } else {
          bracketMatches.push(match);
        }
      }

      const groupStandings = {};
      for (const m of groupMatches) {
        const grp = m.round || "Group";
        if (!groupStandings[grp]) groupStandings[grp] = {};
        for (const team of [m.team1, m.team2]) {
          const name = team.name || "TBD";
          if (name === "TBD") continue;
          if (!groupStandings[grp][name]) groupStandings[grp][name] = { wins: 0, losses: 0, maps_won: 0, maps_lost: 0 };
          const completed = (m.status || "").toLowerCase() === "finished";
          if (completed) {
            if (team.is_winner) groupStandings[grp][name].wins++;
            else groupStandings[grp][name].losses++;
            const score = parseInt(team.score, 10) || 0;
            groupStandings[grp][name].maps_won += score;
            const other = team === m.team1 ? m.team2 : m.team1;
            groupStandings[grp][name].maps_lost += parseInt(other.score, 10) || 0;
          }
        }
      }

      const standings = {};
      for (const [grp, teams] of Object.entries(groupStandings)) {
        standings[grp] = Object.entries(teams)
          .map(([name, s]) => ({ name, ...s, points: s.wins * 3 }))
          .sort((a, b) => b.points - a.points || (b.maps_won - b.maps_lost) - (a.maps_won - a.maps_lost));
      }

      phases.push({
        tournament_id: tId,
        name: tName,
        group_stage: { matches: groupMatches, standings },
        playoffs: { bracket: buildCS2Bracket(bracketMatches) },
        total_matches: matches.length,
      });
    }

    const serieInfo = {
      id: serie.id,
      title: serie.full_name || serie.name || "",
      league: serie.league?.name || "",
      status: serie.status,
      begin_at: serie.begin_at,
      end_at: serie.end_at,
    };

    const result = {
      serie: serieInfo,
      phases,
      teams: [...allTeams].sort(),
    };

    cs2BracketCache.set(cacheKey, { data: result, at: Date.now() });
    res.json(result);
  } catch (e) {
    console.error("cs2-bracket error:", e.message);
    res.status(502).json({ error: "Impossible de récupérer le bracket CS2." });
  }
});

export default router;
