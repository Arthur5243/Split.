import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import oddsRouter from "./odds.js";
import cs2Router from "./cs2-routes.js";
import rlRouter from "./rl-routes.js";
import youtubeRouter from "./youtube-api.js";
import { getMapScores, findTeamId, findMatchId, findManualMapScores, getUpcomingMatchesForTeam } from "./vlr-scores.js";
import {
  storeFinishedMatches,
  getFullHistory,
  getFullHistoryFlat,
  getTeamHistory,
  getStoredMapScores,
  saveMapScores,
  saveMapScoresFailure,
  getMapScoresState,
  resetAbandonedMapScores,
  resetInconsistentMapScores,
} from "./match-history-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MATCHES_PATH = path.join(__dirname, "data", "matches.json");

const app = express();
app.use(cors());
app.use(oddsRouter);
// Endpoints CS2 (/api/cs2-upcoming, /api/cs2-live, /api/cs2-results) : même
// backend PandaScore, route dédiée dans cs2-routes.js (voir ce fichier pour
// le détail — score par map directement via PandaScore, région par équipe).
app.use(cs2Router);
app.use(rlRouter);
app.use(youtubeRouter);

const PORT = process.env.PORT || 3000;
const PANDASCORE_API_KEY = process.env.PANDASCORE_API_KEY;
const PANDASCORE_BASE = "https://api.pandascore.co";

if (!PANDASCORE_API_KEY) {
  console.warn(
    "⚠️  PANDASCORE_API_KEY n'est pas définie. Ajoute-la dans les variables d'environnement de Railway."
  );
}

// Retry sur 429 : PandaScore rate-limite assez vite quand on tire plusieurs
// pages d'affilée. Avant, une seule page en échec faisait planter tout le
// Promise.all de /api/valorant-upcoming (cf plus bas) et coupait la liste
// des matchs à venir à la date où le blocage survenait, au lieu d'aller
// jusqu'au dernier match programmé.
async function pandaFetch(path, attempt = 0) {
  const res = await fetch(PANDASCORE_BASE + path, {
    headers: {
      Authorization: "Bearer " + PANDASCORE_API_KEY,
    },
  });
  if (res.status === 429 && attempt < 4) {
    await sleep(800 * (attempt + 1));
    return pandaFetch(path, attempt + 1);
  }
  if (!res.ok) {
    throw new Error("PandaScore HTTP " + res.status);
  }
  return res.json();
}

// Simple petit cache mémoire pour éviter de spammer PandaScore (60s)
const cache = new Map();
async function cachedFetch(key, path) {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.time < 60_000) return hit.data;
  const data = await pandaFetch(path);
  cache.set(key, { data, time: now });
  return data;
}

// Un match dont les DEUX équipes sont encore inconnues (bracket pas encore
// déterminé) n'apporte aucune info utile -> on le vire. Un match avec une
// seule équipe connue (ex: "Vitality vs TBD") reste utile et doit s'afficher.
function isFullyUnknown(m) {
  const t1 = m.opponents?.[0]?.opponent;
  const t2 = m.opponents?.[1]?.opponent;
  return !t1 && !t2;
}

app.get("/api/valorant-upcoming", async (req, res) => {
  try {
    // Avant : 5 pages (max 500 matchs) tirées EN PARALLÈLE avec Promise.all.
    // Deux problèmes : (1) plafond fixe à 500 matchs, donc coupait avant le
    // dernier match réellement programmé si le volume total dépassait ça ;
    // (2) 5 requêtes simultanées déclenchent facilement le rate-limit
    // PandaScore (429), et vu que Promise.all rejette tout dès qu'UNE page
    // échoue, le moindre 429 sur la page 3/4/5 faisait planter toute la
    // route (502) et donnait l'impression que "ça se bloque après telle
    // date" côté front.
    // Maintenant : pagination séquentielle (une page à la fois, petite pause
    // entre chaque + retry auto sur 429 via pandaFetch) qui continue tant
    // que PandaScore renvoie des pages pleines, et s'arrête d'elle-même dès
    // qu'une page est vide ou incomplète = on est allé jusqu'au tout dernier
    // match programmé, sans plafond arbitraire.
    const PER_PAGE = 100;
    const MAX_PAGES = 50; // garde-fou (5000 matchs) pour éviter une boucle infinie en cas d'anomalie API
    let all = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const pageData = await cachedFetch(
        "upcoming-" + page,
        "/valorant/matches/upcoming?per_page=" + PER_PAGE + "&page=" + page + "&sort=begin_at"
      );
      if (!pageData || pageData.length === 0) break;
      all = all.concat(pageData);
      if (pageData.length < PER_PAGE) break; // page incomplète = dernière page
      await sleep(200); // reste sous le rate-limit PandaScore entre 2 pages
    }
    // Ne garde que les matchs où au moins une des 2 équipes est connue.
    const data = all.filter((m) => !isFullyUnknown(m));
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "Impossible de récupérer les matchs à venir." });
  }
});

app.get("/api/valorant-live", async (req, res) => {
  try {
    const data = await cachedFetch("live", "/valorant/matches/running?per_page=50");
    // DIAGNOSTIC TEMPORAIRE (à retirer une fois le cas TYLOO vs Titan Esports
    // Club élucidé) : liste chaque match "running" brut renvoyé par
    // PandaScore avec son begin_at et son âge, pour comprendre pourquoi
    // reconcileStaleLiveMatches ne le détecte jamais comme suspect (begin_at
    // manquant ? statut différent de "running" ? absent de la liste ?).
    for (const m of data) {
      if (m.status !== "running") continue;
      const t1 = m.opponents?.[0]?.opponent?.name || "?";
      const t2 = m.opponents?.[1]?.opponent?.name || "?";
      const ageMin = m.begin_at ? Math.round((Date.now() - new Date(m.begin_at).getTime()) / 60000) : null;
      console.log(`[diag-live] id=${m.id} ${t1} vs ${t2} status=${m.status} begin_at=${m.begin_at} age=${ageMin}min`);
    }
    const hiddenIds = await reconcileStaleLiveMatches(data);
    const visible = hiddenIds && hiddenIds.length ? data.filter((m) => !hiddenIds.includes(m.id)) : data;
    res.json(visible);
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "Impossible de récupérer les matchs en direct." });
  }
});

// Convertit un match brut PandaScore (tel que renvoyé par /valorant/matches/past)
// vers le format attendu par match-history-store.js. Pas de logique front ici
// (pas de classifyRegion/teamCode) : juste les champs directement disponibles.
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
    region: null,
    league: m.league?.name || null,
    phase: m.serie?.full_name || null,
    day: (m.begin_at || "").slice(0, 10),
    time: (m.begin_at || "").slice(11, 16),
  };
}

// Cache du résultat ENRICHI (avec map_scores), séparé du petit cache
// PandaScore brut (60s) ci-dessus. But : le front repoll toutes les 60s, donc
// sans ce cache-là on relance un balayage complet de vlr.gg à CHAQUE poll —
// c'est ce qui a fini par faire bloquer l'IP Railway. Les scores d'un match
// terminé ne changent jamais, donc une fenêtre large (10 min) ne coûte rien
// en fraîcheur perçue.
let enrichedResultsCache = null; // { data, time }
const ENRICHED_RESULTS_TTL_MS = 10 * 60 * 1000;
// Empêche deux sweeps d'enrichissement de tourner en parallèle si plusieurs
// requêtes arrivent pendant que le cache est en train d'être recalculé.
let enrichInProgress = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Exécute `fn` sur chaque item avec au plus `limit` appels en vol en même
// temps, au lieu d'un Promise.allSettled qui tire tout d'un coup (jusqu'à 50
// requêtes simultanées vers vlr.gg juste après un redeploy = ressemble à une
// attaque, circuit breaker qui saute côté vlr.gg). Un pool de 3 reste rapide
// tout en étant beaucoup plus discret.
async function mapWithConcurrency(items, limit, fn) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// Un Bo3 Valorant dure rarement plus d'1h30 en tout (2 ou 3 maps). Un match
// que PandaScore affiche encore "running" au-delà de ce seuil est très
// probablement déjà terminé côté PandaScore (juste pas encore marqué comme
// tel chez eux — décalage assez fréquent). Sous ce seuil, on ne vérifie rien
// : le match est probablement encore réellement en cours, pas la peine de
// solliciter vlr.gg pour rien.
const STALE_LIVE_THRESHOLD_MS = 90 * 60 * 1000; // 1h30

// Filet de sécurité ABSOLU, indépendant de vlr.gg : au-delà de 4h, aucun Bo3
// Valorant n'est réellement encore en cours. Si vlr.gg n'a jamais pu
// confirmer la fin de la série (équipe introuvable dans l'alias/la recherche
// live, vlrggapi down, rate-limit persistant, page pas encore publiée...),
// le match restait auparavant affiché "en direct" indéfiniment - c'est
// exactement le cas TYLOO vs Titan Esports Club qui a révélé ce problème.
// Maintenant : passé ce délai, on le RETIRE de l'onglet "en direct" même
// sans score confirmé, plutôt que de continuer à mentir sur son statut. Il
// n'apparaît pas non plus à tort dans "Match terminé" (on n'invente aucun
// score) ; il réapparaîtra correctement dès que PandaScore ou vlr.gg
// rattrapent leur retard.
const ABSOLUTE_HIDE_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4h

// Double vérification automatique : pour chaque match encore "running" chez
// PandaScore depuis plus d'1h30, on va voir sur vlr.gg si la série est en
// fait déjà décidée (2 maps gagnées par une équipe en Bo3). Si oui : (1) on
// corrige le statut affiché tout de suite (le match sort de l'onglet "en
// direct"), et (2) on l'enregistre nous-mêmes comme terminé dans notre base
// (avec son score par map) pour qu'il apparaisse instantanément dans l'onglet
// "Match terminé", sans attendre que PandaScore mette lui-même à jour son
// propre statut. Générique : s'applique à TOUS les matchs, tous les jours,
// pas seulement au cas TYLOO vs Titan Esports Club qui a révélé le problème.
// Défensif comme le reste : si vlr.gg échoue ou ne trouve rien, on ne touche
// à rien et on retentera au prochain poll (60s plus tard, côté front) - SAUF
// si le délai absolu ci-dessus est dépassé, auquel cas on masque quand même
// le match (cf ABSOLUTE_HIDE_THRESHOLD_MS) pour ne jamais rester bloqué.
// Renvoie la liste des matchs à masquer de la réponse (non résolus par
// vlr.gg mais trop vieux pour rester crédibles en "en direct").
async function reconcileStaleLiveMatches(data) {
  const now = Date.now();
  const suspects = data.filter((m) => {
    if (m.status !== "running") return false;
    const beginAt = m.begin_at ? new Date(m.begin_at).getTime() : null;
    return beginAt && now - beginAt >= STALE_LIVE_THRESHOLD_MS;
  });
  const toHide = [];
  if (suspects.length === 0) return toHide;

  await mapWithConcurrency(suspects, 1, async (m) => {
    const t1 = m.opponents?.[0]?.opponent;
    const t2 = m.opponents?.[1]?.opponent;
    const beginAt = m.begin_at ? new Date(m.begin_at).getTime() : null;
    const pastAbsoluteLimit = beginAt && now - beginAt >= ABSOLUTE_HIDE_THRESHOLD_MS;
    if (!t1 || !t2) {
      if (pastAbsoluteLimit) toHide.push(m.id);
      return;
    }
    const date = (m.begin_at || "").slice(0, 10);

    let mapScores = null;
    try {
      mapScores = await getMapScores(t1.name, t2.name, date);
    } catch (e) {
      console.log(`[live-reconcile] ${t1.name} vs ${t2.name} → erreur vlr.gg:`, e.message);
      if (pastAbsoluteLimit) {
        console.log(`[live-reconcile] ${t1.name} vs ${t2.name} → masqué (running depuis >4h, vlr.gg indisponible)`);
        toHide.push(m.id);
      }
      return;
    }
    if (!mapScores || mapScores.length === 0) {
      if (pastAbsoluteLimit) {
        console.log(`[live-reconcile] ${t1.name} vs ${t2.name} → masqué (running depuis >4h, vlr.gg n'a rien trouvé)`);
        toHide.push(m.id);
      }
      return; // vlr.gg n'a rien -> peut-être vraiment encore en cours (ou masqué ci-dessus si trop vieux)
    }

    let wins1 = 0;
    let wins2 = 0;
    for (const mp of mapScores) {
      if (mp.score1 > mp.score2) wins1++;
      else if (mp.score2 > mp.score1) wins2++;
    }
    const winsNeeded = 2; // Bo3, seul format de l'app
    if (wins1 < winsNeeded && wins2 < winsNeeded) {
      // vlr.gg aussi le montre encore ouvert -> cohérent avec "running" en soi,
      // SAUF si ça dure depuis plus de 4h : à ce stade c'est probablement un
      // match annulé/abandonné des deux côtés (PandaScore ET vlr.gg bloqués
      // sur le même statut obsolète), donc on masque quand même.
      if (pastAbsoluteLimit) {
        console.log(`[live-reconcile] ${t1.name} vs ${t2.name} → masqué (running depuis >4h, série toujours ouverte des deux côtés)`);
        toHide.push(m.id);
      }
      return;
    }

    console.log(
      `[live-reconcile] ${t1.name} vs ${t2.name} (${date}) → PandaScore dit encore "running" mais vlr.gg confirme la série décidée (${wins1}-${wins2}), correction appliquée.`
    );

    // 1) Corrige l'objet renvoyé tout de suite -> sort de l'onglet "en direct" dès cette réponse.
    m.status = "finished";
    m.map_scores = mapScores;
    m.results = [
      { team_id: t1.id, score: wins1 },
      { team_id: t2.id, score: wins2 },
    ];

    // 2) Persiste nous-mêmes ce match comme terminé, pour qu'il apparaisse
    // immédiatement dans l'onglet "Match terminé" (via buildMergedResults)
    // sans attendre que PandaScore corrige lui-même son propre statut.
    storeFinishedMatches([
      {
        id: String(m.id),
        team1: t1.name,
        team2: t2.name,
        team1Name: t1.name,
        team2Name: t2.name,
        score1: wins1,
        score2: wins2,
        status: "finished",
        region: null,
        league: m.league?.name || null,
        phase: m.serie?.full_name || null,
        day: date,
        time: (m.begin_at || "").slice(11, 16),
      },
    ]);
    saveMapScores(m.id, mapScores);
    enrichedResultsCache = null; // force /api/valorant-results à relire la base au prochain appel
  });

  return toHide;
}

// Colle sur `data` les scores par map déjà connus en base (synchrone, aucun
// appel réseau) — ceux-là s'affichent dès la 1ère réponse, sans attendre le
// sweep en arrière-plan. Renvoie la liste des matchs terminés qu'il faut
// (re)taper sur vlr.gg : ceux jamais tentés, ET ceux dont la précédente
// tentative a échoué mais dont le délai de retentative est écoulé (voir
// RETRY_DELAYS_MS dans match-history-store.js) — jusqu'à abandon définitif
// après le dernier palier (2h).
function applyStoredMapScores(finished) {
  const stillUnknown = [];
  for (const m of finished) {
    // La saisie manuelle passe AVANT la base SQLite : si un match a déjà été
    // tenté sur vlr.gg sans succès, on veut quand même remonter le score
    // saisi à la main plutôt que de rester bloqué sur cet échec.
    const t1 = m.opponents?.[0]?.opponent?.name;
    const t2 = m.opponents?.[1]?.opponent?.name;
    const date = (m.begin_at || "").slice(0, 10);
    const manual = t1 && t2 ? findManualMapScores(t1, t2, date) : null;
    if (manual) {
      console.log(`[map_scores] ${t1} vs ${t2} (${date}) → trouvé en saisie manuelle (manual-map-scores.json)`);
      m.map_scores = manual;
      saveMapScores(m.id, manual); // persiste aussi en base, pour cohérence avec getFullHistory
      continue;
    }

    const state = getMapScoresState(m.id);
    if (state === undefined || state.value === undefined) {
      // Jamais en base, ou en base mais jamais encore résolu : si un délai de
      // retentative est programmé, on respecte ce délai plutôt que de
      // re-taper vlr.gg à chaque poll (60s) ; sinon (1er essai ou délai déjà
      // écoulé) on le remet dans le lot à aller chercher.
      const dueNow = !state || !state.nextRetryAt || new Date(state.nextRetryAt).getTime() <= Date.now();
      if (dueNow) stillUnknown.push(m);
      continue;
    }
    // state.value !== undefined : soit un succès (array), soit un abandon
    // définitif (`null`, tous les paliers de retry épuisés) — rien à
    // retenter, on affiche ce qu'on a.
    m.map_scores = state.value;
  }
  return stillUnknown;
}

async function enrichWithMapScores(data, forceRecheckIds = new Set()) {
  // Restriction retirée : on va chercher le détail par map pour TOUS les
  // matchs terminés renvoyés par PandaScore (jusqu'à 50, cf per_page côté
  // /api/valorant-results), pas seulement les N plus récents. Ça reste une
  // seule requête HTTP côté front (le résultat enrichi complet est mis en
  // cache 10 min, cf enrichedResultsCache) ; côté vlr.gg le throttling
  // (concurrency=1 + sleep 400ms dans mapWithConcurrency) est conservé pour
  // rester discret.
  const finished = data
    .filter((m) => m.status === "finished")
    .sort((a, b) => new Date(b.begin_at) - new Date(a.begin_at));

  // Court-circuite tout ce qui est déjà en base (SQLite, persiste entre les
  // redeploys tant qu'un volume Railway est monté) — on ne rappelle vlr.gg
  // QUE pour les matchs jamais résolus jusqu'ici. C'est ce qui évite de
  // redemander la même requête en boucle.
  //
  // EXCEPTION : les matchs dans forceRecheckIds (ceux tout juste devenus
  // éligibles au sweep automatique parce qu'ils viennent de l'historique
  // accumulé, cf accumulatedNeedingSweep) contournent ce filtre. Sans ça,
  // un match déjà marqué "abandon définitif" AVANT que ce sweep existe
  // restait bloqué pour toujours, même une fois la vraie cause corrigée —
  // exactement le cas de FURIA vs G2 et Cloud9 vs Evil Geniuses.
  const gated = applyStoredMapScores(finished);
  const forced = finished.filter((m) => forceRecheckIds.has(String(m.id)) && !gated.includes(m));
  const toFetch = [...gated, ...forced];

  await mapWithConcurrency(toFetch, 3, async (m) => {
    const t1 = m.opponents?.[0]?.opponent?.name;
    const t2 = m.opponents?.[1]?.opponent?.name;
    const date = (m.begin_at || "").slice(0, 10);
    if (!t1 || !t2 || !date) {
      console.log(`[map_scores] skip (données manquantes) — t1=${t1} t2=${t2} date=${date}`);
      return;
    }
    let fetchError = false;
    try {
      m.map_scores = await getMapScores(t1, t2, date); // null si pas trouvé
      console.log(`[map_scores] ${t1} vs ${t2} (${date}) →`, JSON.stringify(m.map_scores));
    } catch (e) {
      m.map_scores = null;
      fetchError = true;
      console.log(`[map_scores] ${t1} vs ${t2} (${date}) → ERREUR:`, e.message);
    }
    // Succès -> persisté pour de bon. Échec (ou `null` renvoyé, ex: requête
    // faite trop tôt avant que vlr.gg publie le report du match) -> on
    // programme une retentative plus tard au lieu d'enregistrer `null`
    // définitivement (voir saveMapScoresFailure / RETRY_DELAYS_MS) ; le champ
    // affiché tout de suite reste `null` (fallback "0-0" côté front) en
    // attendant la prochaine tentative.
    if (m.map_scores) {
      saveMapScores(m.id, m.map_scores);
      // Rafraîchit le cache tout de suite, match par match, au lieu d'attendre
      // la fin du lot `toFetch` en cours (le .then() final ci-dessous). Sans
      // ça, un match résolu en tête de file reste invisible côté front tant
      // que tous les autres retries du même lot n'ont pas fini de tourner
      // (mapWithConcurrency + 900ms d'attente entre chaque) — potentiellement
      // plusieurs dizaines de secondes de retard alors que le score est déjà
      // correct en base depuis longtemps. `data` est muté en place par cette
      // même fonction donc buildMergedResults(data) reflète bien l'état
      // courant, y compris les autres matchs déjà résolus plus tôt dans ce lot.
      enrichedResultsCache = { data: buildMergedResults(data), time: Date.now() };
    } else {
      saveMapScoresFailure(m.id);
      if (!fetchError) console.log(`[map_scores] ${t1} vs ${t2} (${date}) → retentative programmée`);
    }
    // 900ms (au lieu de 400) : depuis qu'on enrichit TOUS les matchs terminés
    // (plus de limite à 8), il faut laisser plus de marge au rate-limiter de
    // vlrggapi entre chaque match, sinon seul le 1er passe et les suivants
    // se prennent des 429 en cascade.
    await sleep(900);
  });
}

// Reconstruit, depuis une ligne accumulée en base (SQLite), la même forme
// "PandaScore-like" que consomme transformMatch() côté front (opponents,
// results, begin_at, league, serie, tier). Sert uniquement pour les matchs
// qu'on a déjà vus mais qui sont tombés hors de la fenêtre des 50 derniers
// matchs renvoyés par PandaScore (voir buildMergedResults ci-dessous).
function toLiveHistoryShape(row) {
  const id1 = "lh1_" + row.id;
  const id2 = "lh2_" + row.id;
  const hasScore = row.score1 != null && row.score2 != null;
  return {
    id: row.id,
    begin_at: row.day ? row.day + "T" + (row.time || "00:00") + ":00Z" : null,
    status: row.status,
    tier: row.league || null,
    serie: { full_name: row.phase, name: row.phase },
    league: { name: row.league },
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

// Nombre de matchs accumulés qu'on est prêt à réinjecter en plus de la
// fenêtre live PandaScore. Largement au-dessus de 50 (la taille de cette
// fenêtre) pour qu'un match déjà vu ne disparaisse plus jamais de l'onglet
// "Match terminé", même avec 4 régions VCT qui tournent en même temps.
const ACCUMULATED_HISTORY_LIMIT = 400;

// Cutoff manuel : le match Gen.G vs FULL SENSE du 7 août 2026 (VCT Pacific
// Stage 2) marque la fin de l'historique "figé" qu'on veut voir dans l'onglet
// résultats. On ne garde plus, depuis PandaScore ni depuis l'accumulé SQLite,
// que les matchs strictement APRÈS cette date-là, pour ne plus jamais
// réafficher/mélanger les anciens résultats déjà connus.
// Pour désactiver ce filtre plus tard, mettre RESULTS_CUTOFF à null.
const RESULTS_CUTOFF = "2026-08-07T23:59:59Z";

// Fusionne la fenêtre live (PandaScore, jusqu'à 50 matchs) avec tout ce qu'on
// a déjà accumulé en base. Un match une fois vu une fois reste visible pour
// de bon, même une fois poussé hors des 50 plus récents (tous jeux/régions
// confondus) par le volume de matchs plus récents.
//
// BUG CORRIGÉ : un match accumulé sans score par map ne passait QUE par la
// vérification de saisie manuelle (ci-dessous), jamais par la recherche
// automatique vlr.gg — parce que enrichWithMapScores() n'était appelé que
// sur `data` (la fenêtre fraîche PandaScore), jamais sur l'accumulé. Un
// match tombé hors des 50 plus récents PandaScore restait donc bloqué pour
// toujours, même quand vlr.gg avait le score en clair (cas FURIA vs G2 et
// Cloud9 vs Evil Geniuses : score trouvé en tout premier résultat sur
// vlrggapi, jamais tenté par notre code car jamais transmis à
// enrichWithMapScores). Cette fonction renvoie maintenant aussi la liste des
// matchs accumulés qui ont encore besoin d'un sweep automatique, pour que
// l'appelant les ajoute au lot passé à enrichWithMapScores.
function buildMergedResults(liveData) {
  const liveIds = new Set(liveData.map((m) => String(m.id)));
  const accumulated = getFullHistoryFlat(ACCUMULATED_HISTORY_LIMIT)
    .filter((row) => row.status === "finished" && !liveIds.has(String(row.id)))
    .map(toLiveHistoryShape);

  const stillNeedingSweep = [];
  for (const m of accumulated) {
    if (m.map_scores) continue;
    const t1 = m.opponents?.[0]?.opponent?.name;
    const t2 = m.opponents?.[1]?.opponent?.name;
    const date = (m.begin_at || "").slice(0, 10);
    const manual = t1 && t2 ? findManualMapScores(t1, t2, date) : null;
    if (manual) {
      m.map_scores = manual;
      saveMapScores(m.id, manual); // persiste pour cohérence avec getFullHistory
    } else {
      stillNeedingSweep.push(m);
    }
  }

  const merged = [...liveData, ...accumulated];
  const cutoffMs = RESULTS_CUTOFF ? new Date(RESULTS_CUTOFF).getTime() : null;
  const filtered = cutoffMs
    ? merged.filter((m) => m.begin_at && new Date(m.begin_at).getTime() > cutoffMs)
    : merged;
  const sorted = filtered.sort((a, b) => new Date(b.begin_at || 0) - new Date(a.begin_at || 0));
  sorted.accumulatedNeedingSweep = stillNeedingSweep; // attaché pour l'appelant, sans changer la forme du tableau
  return sorted;
}

// Rafraîchit et enrichit les résultats Valorant (fetch PandaScore + pose des
// scores déjà connus + lance le sweep vlr.gg en tâche de fond si besoin).
// Extrait de la route pour pouvoir être appelé aussi bien par une requête
// HTTP que par la tâche de fond périodique plus bas (cf
// startValorantBackgroundRefresh) — avant, tout le pipeline ne tournait que
// si quelqu'un avait l'app ouverte et appelait /api/valorant-results ; si
// personne n'était connecté, rien ne se mettait jamais à jour, même pour des
// matchs terminés depuis longtemps.
//
// `force` : ignore la fraîcheur du cache (mais respecte toujours
// enrichInProgress, pour ne jamais chevaucher deux sweeps). Utilisé par la
// tâche de fond périodique — BUG CORRIGÉ : sans ce paramètre, la tâche de
// fond (toutes les 5 min) tombait TOUJOURS sur "cache encore frais" (TTL de
// 10 min, mis à jour par son propre appel précédent) et ne faisait donc
// jamais de vrai travail après le tout premier passage.
async function refreshValorantResults(force = false) {
  const now = Date.now();
  const cacheIsFresh = !force && enrichedResultsCache && now - enrichedResultsCache.time < ENRICHED_RESULTS_TTL_MS;

  // Si un enrichissement est déjà en cours sur les données actuelles, on
  // sert ce cache tel quel plutôt que de relancer un fetch + un nouveau
  // sweep : sinon le sweep en cours devient orphelin (il continue de muter
  // un tableau `data` qui n'est plus celui référencé par le cache) et ses
  // résultats sont perdus -> plus aucun map_scores ne se pose jamais sur ce
  // qui est réellement servi.
  if (cacheIsFresh || (enrichedResultsCache && enrichInProgress)) {
    return enrichedResultsCache.data;
  }

  const data = await cachedFetch("results", "/valorant/matches/past?per_page=50");

  const rows = data.map(toHistoryRow).filter(Boolean);
  storeFinishedMatches(rows);

  // Pose tout de suite les scores déjà connus en base (aucun appel réseau,
  // donc ça ne retarde pas la réponse) — jamais besoin d'attendre un sweep
  // pour un match déjà résolu, même juste après un redeploy.
  const finished = data.filter((m) => m.status === "finished");
  for (const m of finished) {
    const t1 = m.opponents?.[0]?.opponent?.name;
    const t2 = m.opponents?.[1]?.opponent?.name;
    const date = (m.begin_at || "").slice(0, 10);
    const manual = t1 && t2 ? findManualMapScores(t1, t2, date) : null;
    if (manual) {
      m.map_scores = manual;
      continue;
    }
    const stored = getStoredMapScores(m.id);
    if (stored !== undefined) m.map_scores = stored;
  }

  // On répond IMMÉDIATEMENT (jamais "pas de matchs"), et on va chercher sur
  // vlr.gg uniquement les scores encore inconnus, en arrière-plan. Avant :
  // on attendait (await) enrichWithMapScores sur TOUS les matchs terminés
  // avant de répondre -> avec les retries sur 429, la requête pouvait
  // prendre des dizaines de secondes et le front/proxy Railway coupait la
  // connexion (statut 499) -> plus aucun match affiché, alors que
  // PandaScore avait bien répondu depuis longtemps.
  //
  // On fusionne aussi avec l'historique accumulé en base (voir
  // buildMergedResults) : sinon un match tombé hors des 50 plus récents
  // PandaScore (tous jeux/régions confondus) disparaîtrait purement et
  // simplement de l'onglet "Match terminé", alors qu'on l'a déjà vu et
  // qu'on a déjà ses scores (série + par map).
  const merged = buildMergedResults(data);
  enrichedResultsCache = { data: merged, time: now };

  // Le lot envoyé au sweep vlr.gg inclut maintenant aussi les matchs
  // accumulés sans score (cf commentaire sur buildMergedResults) — sinon
  // ils ne sont jamais tentés du tout, silencieusement, même quand vlr.gg a
  // le score en clair. Leurs id sont aussi passés en forceRecheckIds : s'ils
  // ont été marqués "abandon définitif" AVANT que ce sweep n'existe, ce
  // vieux statut ne doit plus les bloquer maintenant qu'ils sont enfin
  // éligibles au sweep automatique.
  const accumulatedNeedingSweep = merged.accumulatedNeedingSweep || [];
  const dataToEnrich = [...data, ...accumulatedNeedingSweep];
  const forceRecheckIds = new Set(accumulatedNeedingSweep.map((m) => String(m.id)));

  enrichInProgress = true;
  enrichWithMapScores(dataToEnrich, forceRecheckIds)
    .then(() => {
      // Les objets `data` sont mutés en place par enrichWithMapScores, donc
      // on refait la fusion avec l'historique accumulé pour que le cache
      // reflète bien les scores fraîchement trouvés.
      enrichedResultsCache = { data: buildMergedResults(data), time: Date.now() };
    })
    .catch((e) => console.error("[enrich background]", e.message))
    .finally(() => {
      enrichInProgress = false;
    });

  return merged;
}

app.get("/api/valorant-results", async (req, res) => {
  try {
    const merged = await refreshValorantResults();
    res.json(merged);
  } catch (e) {
    console.error(e);
    // Si le sweep échoue mais qu'on a un cache même périmé, mieux vaut le
    // servir que de renvoyer une erreur au front.
    if (enrichedResultsCache) return res.json(enrichedResultsCache.data);
    res.status(502).json({ error: "Impossible de récupérer les résultats." });
  }
});

// Tâche de fond : rejoue le même rafraîchissement toutes les
// BACKGROUND_REFRESH_INTERVAL_MS, indépendamment de toute requête HTTP —
// c'est ça qui garantit que les scores se posent même si personne n'a l'app
// ouverte. `force=true` : ignore la fraîcheur du cache (sinon avec un TTL de
// 10 min et un intervalle de 5 min, la tâche de fond tombait toujours sur
// "cache encore frais" et ne faisait jamais de vrai travail après le 1er
// passage) — `enrichInProgress` protège quand même contre le chevauchement.
const BACKGROUND_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  refreshValorantResults(true).catch((e) => console.error("[valorant background refresh]", e.message));
}, BACKGROUND_REFRESH_INTERVAL_MS);

// Convertit une entrée "maison" de matches.json (team1/team2/score "2-0"/winner)
// vers la forme brute PandaScore que le front sait déjà lire via transformMatch()
// (opponents/results/serie/league). Rien à changer côté App.jsx : cette route
// renvoie juste plus d'historique, dans le même format que /api/valorant-results.
//
// ⚠️ classifyRegion() côté front ignore un match si le libellé de ligue ne
// contient pas "americas/pacific/emea/china" — utile pour l'affichage des vrais
// matchs à venir/live, mais ça viderait bêtement cet historique (nos tiers sont
// du genre "VCT"/"VCL"/"Regional League", sans mention de région). Or cet
// historique ne sert qu'à calculer des winrates (recentWinrate / headToHeadWinrate),
// qui ne regardent jamais la région. Règle simple : dès qu'on a deux équipes
// nommées (team1 vs team2), le match est exploitable -> on force un libellé qui
// passe le filtre du front pour ne pas perdre ces matchs pour rien.
function toPandaScoreShape(m, index) {
  const id1 = "h1_" + (m.match_id ?? index);
  const id2 = "h2_" + (m.match_id ?? index);
  const parts = (m.score || "").split("-").map((s) => parseInt(s.trim(), 10));
  const hasScore = parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1]);

  return {
    id: m.pandascore_id || "hist_" + m.match_id,
    begin_at: m.date ? m.date + "T00:00:00Z" : null,
    status: "finished",
    tier: m.tier || null, // niveau du tournoi (VCT, VCL, etc.) — sert à pondérer les cotes côté front
    serie: { full_name: m.tournament_name, name: m.tournament_name },
    league: { name: "EMEA" }, // libellé neutre juste pour passer classifyRegion(), jamais affiché
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

app.get("/api/match-history", (req, res) => {
  try {
    const raw = fs.readFileSync(MATCHES_PATH, "utf-8");
    const matches = JSON.parse(raw);
    // Dès qu'on a bien deux équipes nommées, c'est bon -> on garde.
    const usable = matches.filter(
      (m) => m.team1 && m.team2 && m.team1 !== "TBD" && m.team2 !== "TBD"
    );
    res.json(usable.map(toPandaScoreShape));
  } catch (e) {
    console.error("match-history error:", e.message);
    res.status(500).json({ error: "Impossible de lire l'historique des matchs." });
  }
});

// Petite page de diag, pour vérifier vite fait (sans ouvrir le gros JSON)
// que l'historique est bien là et qu'une équipe précise y apparaît.
// Ex: /admin/check-team?name=Gentle Mates
// Route de diagnostic PONCTUELLE (à retirer une fois le test fait) : teste
// si HLTV.org répond normalement à une requête venant de Railway, ou si
// elle est bloquée (Cloudflare). Aucune logique de scraping ici — juste le
// statut HTTP brut et le début de la réponse, pour distinguer une vraie
// page HLTV d'une page de challenge Cloudflare.
app.get("/admin/test-hltv-access", async (req, res) => {
  try {
    const response = await fetch("https://www.hltv.org/results", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    const text = await response.text();
    const looksBlocked = /cloudflare|attention required|checking your browser|cf-browser-verification/i.test(text);
    res.json({
      status_http: response.status,
      probablement_bloque: looksBlocked,
      taille_reponse: text.length,
      debut_reponse: text.slice(0, 500),
    });
  } catch (e) {
    res.status(500).json({ erreur: e.message });
  }
});

app.get("/admin/check-team", (req, res) => {
  try {
    const raw = fs.readFileSync(MATCHES_PATH, "utf-8");
    const matches = JSON.parse(raw);
    const q = (req.query.name || "").toLowerCase();
    const matching = matches.filter(
      (m) => m.team1?.toLowerCase().includes(q) || m.team2?.toLowerCase().includes(q)
    );
    res.json({
      total_matches_in_file: matches.length,
      recherche: q,
      trouves: matching.length,
      exemples: matching.slice(0, 5),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Page secrète : export en masse de tous les matchs Valorant 2025-2026 ---
// Accessible via /admin/export-matches?key=TA_CLE (définis ADMIN_KEY dans les
// variables Railway). Va chercher toutes les pages PandaScore, filtre les
// matchs incomplets (pas de date ou pas de score), et affiche le résultat
// dans une page avec un bouton "Copier tout" pour coller direct dans
// Backend/data/matches.json sur GitHub, depuis le téléphone.
const ADMIN_KEY = process.env.ADMIN_KEY;

function toStoredShape(raw, index) {
  const t1 = raw.opponents?.[0]?.opponent;
  const t2 = raw.opponents?.[1]?.opponent;
  if (!t1 || !t2) return null;

  const date = raw.begin_at ? raw.begin_at.slice(0, 10) : null;
  if (!date) return null; // pas de date exploitable -> on jette

  const results = raw.results || [];
  const r1 = results.find((r) => r.team_id === t1.id);
  const r2 = results.find((r) => r.team_id === t2.id);
  if (!r1 || !r2) return null; // pas de score -> match pas vraiment terminé
  if (r1.score === 0 && r2.score === 0) return null; // 0-0 = pas joué

  const winner =
    raw.winner?.name ||
    (r1.score > r2.score ? t1.name : r2.score > r1.score ? t2.name : null);

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

// Tournois communautaires/amateurs à exclure : leur niveau n'a rien à voir
// avec le VCT pro et ils polluent le calcul de forme des équipes. Ajoute
// d'autres noms ici si t'en repères d'autres via /admin/check-team.
const TIER_DENYLIST = ["project blender"];

function isNoiseTier(raw) {
  const tier = (raw.league?.name || "").toLowerCase();
  return TIER_DENYLIST.some((bad) => tier.includes(bad));
}

async function fetchAllPastMatches() {
  const all = [];
  const MAX_PAGES = 30; // 30 x 100 = 3000 matchs max, largement assez pour 2025-2026
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await pandaFetch(
      "/valorant/matches/past?per_page=100&page=" + page + "&sort=-begin_at"
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    // dès qu'on tombe avant 2025, plus la peine de continuer (résultats triés desc)
    const oldest = batch[batch.length - 1];
    if (oldest?.begin_at && oldest.begin_at.slice(0, 4) < "2025") break;
  }
  return all;
}

app.get("/admin/export-matches", async (req, res) => {
  if (!ADMIN_KEY || req.query.key !== ADMIN_KEY) {
    return res.status(403).send("Accès refusé.");
  }

  try {
    const raw = await fetchAllPastMatches();

    const inRange = raw.filter((m) => {
      const y = m.begin_at ? m.begin_at.slice(0, 4) : null;
      return (y === "2025" || y === "2026") && !isNoiseTier(m);
    });

    const seen = new Set();
    const cleaned = [];
    for (const m of inRange) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      cleaned.push(m);
    }
    cleaned.sort((a, b) => (a.begin_at || "").localeCompare(b.begin_at || ""));

    const formatted = cleaned.map(toStoredShape).filter(Boolean);
    const json = JSON.stringify(formatted, null, 2);

    // Téléchargement direct plutôt que copier-coller : plus fiable sur mobile
    // quand le JSON est gros (le clipboard mobile plante souvent en silence
    // au-delà de quelques centaines de Ko).
    console.log(`export-matches: ${formatted.length} matchs, ${json.length} caractères`);
    res.setHeader("Content-Disposition", 'attachment; filename="matches.json"');
    res.type("application/json").send(json);
  } catch (e) {
    console.error("export-matches error:", e.message);
    res.status(502).send("Erreur PandaScore : " + e.message);
  }
});

// Rejoue exactement le calcul de cotes du front (même formule, même
// pondération), mais direct côté backend avec les données actuelles de
// matches.json. Sert à isoler si le souci vient de la donnée/calcul (dans ce
// cas ce sera plat ici aussi) ou du transport backend -> app (dans ce cas ici
// ce sera un vrai écart, pas 50/50).
// Usage : /admin/compute-odds?team1=Gentle Mates&team2=Eintracht Frankfurt
const ODDS_GENERAL_LIMIT = 20;
const ODDS_H2H_LIMIT = 10;
const ODDS_H2H_MIN_SAMPLE = 3;
const ODDS_H2H_WEIGHT = 0.35;
const ODDS_PRIOR_WEIGHT = 4;

function norm(s) {
  return (s || "").trim().toLowerCase();
}

function teamResultDbg(m, teamName) {
  const t = norm(teamName);
  const [s1, s2] = (m.score || "").split("-").map((x) => parseInt(x.trim(), 10));
  if (Number.isNaN(s1) || Number.isNaN(s2)) return null;
  if (norm(m.team1) === t) return s1 > s2 ? "W" : s1 < s2 ? "L" : null;
  if (norm(m.team2) === t) return s2 > s1 ? "W" : s2 < s1 ? "L" : null;
  return null;
}

function recentWinrateDbg(teamName, matches, limit) {
  const sorted = [...matches].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  let wins = 0, played = 0;
  const used = [];
  for (const m of sorted) {
    if (played >= limit) break;
    const r = teamResultDbg(m, teamName);
    if (r == null) continue;
    played++;
    used.push({ date: m.date, team1: m.team1, team2: m.team2, score: m.score, result: r });
    if (r === "W") wins++;
  }
  return { wins, played, used };
}

function h2hWinrateDbg(a, b, matches, limit) {
  const an = norm(a), bn = norm(b);
  const filt = matches.filter(
    (m) => (norm(m.team1) === an && norm(m.team2) === bn) || (norm(m.team1) === bn && norm(m.team2) === an)
  );
  const sorted = filt.sort((x, y) => (y.date || "").localeCompare(x.date || ""));
  let wins = 0, played = 0;
  for (const m of sorted) {
    if (played >= limit) break;
    const r = teamResultDbg(m, a);
    if (r == null) continue;
    played++;
    if (r === "W") wins++;
  }
  return { wins, played };
}

function shrinkDbg(wins, played) {
  return (wins + ODDS_PRIOR_WEIGHT * 0.5) / (played + ODDS_PRIOR_WEIGHT);
}

app.get("/admin/compute-odds", (req, res) => {
  try {
    const team1 = req.query.team1;
    const team2 = req.query.team2;
    if (!team1 || !team2) return res.status(400).json({ error: "team1 et team2 requis" });

    const matches = JSON.parse(fs.readFileSync(MATCHES_PATH, "utf-8"));

    const gen1 = recentWinrateDbg(team1, matches, ODDS_GENERAL_LIMIT);
    const gen2 = recentWinrateDbg(team2, matches, ODDS_GENERAL_LIMIT);
    let wr1 = shrinkDbg(gen1.wins, gen1.played);
    let wr2 = shrinkDbg(gen2.wins, gen2.played);

    const h2h = h2hWinrateDbg(team1, team2, matches, ODDS_H2H_LIMIT);
    if (h2h.played >= ODDS_H2H_MIN_SAMPLE) {
      const h2hWr1 = h2h.wins / h2h.played;
      wr1 = wr1 * (1 - ODDS_H2H_WEIGHT) + h2hWr1 * ODDS_H2H_WEIGHT;
      wr2 = wr2 * (1 - ODDS_H2H_WEIGHT) + (1 - h2hWr1) * ODDS_H2H_WEIGHT;
    }

    const total = wr1 + wr2;
    const p1 = total > 0 ? wr1 / total : 0.5;

    res.json({
      team1,
      team2,
      odds1_pct: Math.round(p1 * 100),
      odds2_pct: 100 - Math.round(p1 * 100),
      team1_forme: { victoires: gen1.wins, matchs_trouves: gen1.played, derniers_matchs: gen1.used },
      team2_forme: { victoires: gen2.wins, matchs_trouves: gen2.played },
      face_a_face: h2h,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Visibilité sur la mini base SQLite qui s'accumule en tâche de fond à chaque
// appel de /api/valorant-results (voir match-history-store.js). Ne remplace
// PAS /api/match-history (qui sert toujours matches.json, les 2553 matchs
// importés) — sert juste à vérifier que l'accumulation fonctionne bien.
app.get("/admin/live-history-count", (req, res) => {
  try {
    res.json({ matchs_accumules: getFullHistory(100000).length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "split-app-backend" });
});

// ==========================================================================
// Debug : rejoue le pipeline complet (match terminé -> nom d'équipe -> id
// vlr.gg de l'équipe -> id du match vlr.gg -> détails/scores par map) pas à
// pas, uniquement pour les 3 derniers matchs terminés à l'instant présent.
// But : vérifier étape par étape que chaque maillon fonctionne (équipe
// trouvée, match trouvé, scores trouvés) avant de compter sur le sweep
// silencieux de enrichWithMapScores pour tous les matchs.
app.get("/admin/debug-last3-map-scores", async (req, res) => {
  try {
    const data = await cachedFetch("results", "/valorant/matches/past?per_page=50");

    const finished = data
      .filter((m) => m.status === "finished")
      .sort((a, b) => new Date(b.begin_at) - new Date(a.begin_at))
      .slice(0, 3);

    const steps = [];
    for (const m of finished) {
      const team1 = m.opponents?.[0]?.opponent?.name || null;
      const team2 = m.opponents?.[1]?.opponent?.name || null;
      const date = (m.begin_at || "").slice(0, 10);

      const entry = {
        pandascore_match_id: m.id,
        team1,
        team2,
        date,
        etape_1_id_equipe_vlr: null,
        etape_2_id_match_vlr: null,
        etape_3_scores_par_map: null,
      };

      if (team1 && team2 && date) {
        entry.etape_1_id_equipe_vlr = await findTeamId(team1);
        entry.etape_2_id_match_vlr = await findMatchId(team1, team2, date);
        entry.etape_3_scores_par_map = await getMapScores(team1, team2, date);
      }

      steps.push(entry);
    }

    res.json({ matchs_testes: steps.length, details: steps });
  } catch (e) {
    console.error("debug-last3-map-scores error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ==========================================================================
// Force une nouvelle tentative IMMÉDIATE de récupération du score par map
// pour UN match précis (id PandaScore), en contournant complètement l'état
// stocké en base (nextRetryAt à respecter, ou abandon définitif après les
// paliers de RETRY_DELAYS_MS). Utile après un correctif (ex: ajout d'un
// alias manquant dans team-aliases.json) pour "réparer" un match déjà marqué
// abandonné, sans attendre un futur redeploy qui viderait toute la base.
// Usage : /admin/force-map-scores?id=<pandascore_id>
app.get("/admin/force-map-scores", async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "paramètre ?id=<pandascore_id> manquant" });

    const data = await cachedFetch("results", "/valorant/matches/past?per_page=50");
    const m = data.find((x) => String(x.id) === String(id));
    if (!m) {
      return res.status(404).json({ error: "match introuvable parmi les 50 derniers résultats PandaScore" });
    }

    const team1 = m.opponents?.[0]?.opponent?.name || null;
    const team2 = m.opponents?.[1]?.opponent?.name || null;
    const date = (m.begin_at || "").slice(0, 10);
    if (!team1 || !team2 || !date) {
      return res.status(422).json({ error: "données d'équipe/date manquantes sur ce match", team1, team2, date });
    }

    const mapScores = await getMapScores(team1, team2, date);
    if (mapScores) {
      saveMapScores(id, mapScores); // persiste le succès, remet le compteur de retentatives à zéro
      // Sans ça, /api/valorant-results continuerait de servir l'ancien cache
      // en mémoire (enrichedResultsCache, TTL 10 min) sans jamais relire la
      // base tant qu'il est encore frais -> le site resterait sur l'ancien
      // score jusqu'à 10 min de plus après cette correction manuelle.
      enrichedResultsCache = null;
    } else {
      saveMapScoresFailure(id); // reprogramme un prochain essai normal (ne force pas un abandon)
    }

    res.json({ id, team1, team2, date, map_scores: mapScores, cache_invalide: !!mapScores });
  } catch (e) {
    console.error("force-map-scores error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ==========================================================================
// Pont vlr.gg : va chercher le score détaillé par map (ex: 13-9) d'un match,
// que PandaScore ne fournit pas. Les IDs PandaScore et vlr.gg ne correspondent
// pas entre eux, donc on identifie le match vlr.gg par équipe + date au lieu
// d'un ID direct : équipe1 -> recherche vlr.gg -> ID équipe -> historique de
// l'équipe -> trouve le match contre équipe2 à la bonne date -> ID du match
// -> détails complets (score par map).
const VLRGGAPI_BASE = process.env.VLRGGAPI_BASE || "https://vlrggapi-production-b3a0.up.railway.app";

async function vlrFetch(path) {
  const res = await fetch(VLRGGAPI_BASE + path);
  if (!res.ok) throw new Error("vlrggapi HTTP " + res.status);
  const json = await res.json();
  return json.data;
}

// Similarité simple entre deux noms d'équipe (insensible à la casse/accents),
// suffisant pour départager "Gentle Mates" trouvé via une recherche "gentle".
function similar(a, b) {
  const clean = (s) =>
    (s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const ca = clean(a), cb = clean(b);
  return ca === cb || ca.includes(cb) || cb.includes(ca);
}

// Différence en jours entre deux dates ISO (YYYY-MM-DD), pour tolérer les
// petits écarts (fuseaux horaires, "2h 44m ago" imprécis côté vlr.gg).
function daysBetween(d1, d2) {
  if (!d1 || !d2) return Infinity;
  const t1 = new Date(d1).getTime();
  const t2 = new Date(d2).getTime();
  if (Number.isNaN(t1) || Number.isNaN(t2)) return Infinity;
  return Math.abs(t1 - t2) / 86400000;
}

// Test rapide : ce endpoint vlrggapi fonctionne-t-il pour une équipe connue
// (Sentinels, id=2, utilisée dans leur propre doc) ? Sert à savoir si le
// souci vient de vlrggapi en général ou juste de Gentle Mates.
app.get("/admin/test-vlr", async (req, res) => {
  try {
    const sentinels = await vlrFetch("/v2/team?id=2&q=matches&page=1");
    res.json({ sentinels_matches_count: (sentinels?.matches || []).length, sample: sentinels?.matches?.slice(0, 2) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- VLR bracket endpoints ---

const vlrEventsCache = { data: null, at: 0 };
const VLR_EVENTS_TTL = 15 * 60 * 1000;

const VCT_REGION_MAP = {
  EMEA: ["emea"],
  AMERICAS: ["americas"],
  PACIFIC: ["pacific"],
  CN: ["china"],
};

async function fetchVlrEvents(query) {
  const r = await fetch(VLRGGAPI_BASE + "/v2/events?q=" + query + "&page=1");
  if (!r.ok) return [];
  const b = await r.json();
  return (b && b.data && b.data.segments) || [];
}

app.get("/api/vlr-events", async (req, res) => {
  try {
    if (vlrEventsCache.data && Date.now() - vlrEventsCache.at < VLR_EVENTS_TTL) {
      return res.json(vlrEventsCache.data);
    }

    const [upcoming, ongoing] = await Promise.all([
      fetchVlrEvents("upcoming"),
      fetchVlrEvents("ongoing"),
    ]);
    const all = [...ongoing, ...upcoming];
    const seen = new Set();
    const events = all.filter((e) => {
      if (seen.has(e.event_id)) return false;
      seen.add(e.event_id);
      return true;
    });

    const isVCT = (t) => t.includes("vct") && !t.includes("game changers") && !t.includes("challengers");

    const result = { kickoff: {}, stage: {}, masters: null, champions: null };

    for (const e of events) {
      const t = (e.title || "").toLowerCase();
      if (!isVCT(t)) continue;

      const info = { event_id: e.event_id, title: e.title, status: e.status, dates: e.dates };

      if (t.includes("masters")) {
        if (!result.masters || e.status === "ongoing") result.masters = info;
        continue;
      }
      if (t.includes("champions")) {
        if (!result.champions || e.status === "ongoing") result.champions = info;
        continue;
      }

      const isKickoff = t.includes("kickoff");
      const bucket = isKickoff ? "kickoff" : "stage";

      for (const [region, keywords] of Object.entries(VCT_REGION_MAP)) {
        if (keywords.some((kw) => t.includes(kw))) {
          if (!result[bucket][region] || e.status === "ongoing") {
            result[bucket][region] = info;
          }
        }
      }
    }

    vlrEventsCache.data = result;
    vlrEventsCache.at = Date.now();
    res.json(result);
  } catch (e) {
    console.error("vlr-events error:", e.message);
    res.status(502).json({ error: "Impossible de récupérer les events VLR." });
  }
});

const vlrHistoryCache = { data: null, at: 0 };

app.get("/api/vlr-history", async (req, res) => {
  try {
    if (vlrHistoryCache.data && Date.now() - vlrHistoryCache.at < VLR_EVENTS_TTL) {
      return res.json(vlrHistoryCache.data);
    }

    const completed = await fetchVlrEvents("completed");
    const isVCT = (t) => t.includes("vct") && !t.includes("game changers") && !t.includes("challengers");

    const history = { kickoff: [], stage: [], masters: [], champions: [] };

    for (const e of completed) {
      const t = (e.title || "").toLowerCase();
      if (!isVCT(t)) continue;
      const info = { event_id: e.event_id, title: e.title, status: e.status, dates: e.dates };

      if (t.includes("champions")) { history.champions.push(info); continue; }
      if (t.includes("masters")) { history.masters.push(info); continue; }
      if (t.includes("kickoff")) { history.kickoff.push(info); continue; }
      history.stage.push(info);
    }

    vlrHistoryCache.data = history;
    vlrHistoryCache.at = Date.now();
    res.json(history);
  } catch (e) {
    console.error("vlr-history error:", e.message);
    res.status(502).json({ error: "Impossible de récupérer l'historique VLR." });
  }
});

const bracketCache = new Map();
const BRACKET_CACHE_TTL = 5 * 60 * 1000;

const ROUND_ORDER = [
  "upper round 1", "upper quarterfinals", "upper semifinals", "upper final",
  "lower round 1", "lower round 2", "lower round 3", "lower round 4", "lower final",
  "grand final",
];

function classifyRound(series) {
  const s = (series || "").toLowerCase().trim();
  if (s.includes("grand final")) return { bracket: "grand_final", round: s, sort: 100 };
  if (s.includes("upper") || s.includes("winners")) return { bracket: "upper", round: s, sort: ROUND_ORDER.indexOf(s) >= 0 ? ROUND_ORDER.indexOf(s) : 50 };
  if (s.includes("lower") || s.includes("losers")) return { bracket: "lower", round: s, sort: ROUND_ORDER.indexOf(s) >= 0 ? ROUND_ORDER.indexOf(s) : 60 };
  if (/^week \d+$/i.test(s) || s.includes("group") || s.includes("regular season") || s.includes("play-in") || s.includes("opening") || s.includes("elimination")) return { bracket: "group", round: s, sort: -1 };
  if (s.includes("semifinal")) return { bracket: "upper", round: s, sort: 45 };
  if (s.includes("quarterfinal")) return { bracket: "upper", round: s, sort: 40 };
  if (s.includes("final")) return { bracket: "grand_final", round: s, sort: 100 };
  return { bracket: "other", round: s, sort: -1 };
}

app.get("/api/vlr-bracket/:eventId", async (req, res) => {
  const { eventId } = req.params;
  const phase = req.query.phase || "all";
  if (!/^\d+$/.test(eventId)) return res.status(400).json({ error: "eventId invalide" });

  try {
    const cacheKey = "bracket:" + eventId + ":" + phase;
    const cached = bracketCache.get(cacheKey);
    if (cached && Date.now() - cached.at < BRACKET_CACHE_TTL) {
      return res.json(cached.data);
    }

    const [matchesRes, eventRes] = await Promise.all([
      fetch(VLRGGAPI_BASE + "/v2/events/matches?event_id=" + eventId),
      fetch(VLRGGAPI_BASE + "/v2/event/" + eventId),
    ]);
    if (!matchesRes.ok) throw new Error("vlrggapi matches HTTP " + matchesRes.status);
    const matchesBody = await matchesRes.json();
    const allMatches = (matchesBody && matchesBody.data && matchesBody.data.segments) || [];

    let eventInfo = null;
    if (eventRes.ok) {
      const eventBody = await eventRes.json();
      const seg = eventBody?.data?.segments;
      eventInfo = { title: seg?.title, dates: seg?.dates, prize: seg?.prize, logo: seg?.logo };
    }

    const bracketMatches = [];
    const groupMatches = [];
    const playInMatches = [];

    for (const m of allMatches) {
      const cl = classifyRound(m.event_series);
      const match = {
        match_id: m.match_id,
        date: m.date,
        status: m.status,
        round: m.event_series,
        round_normalized: cl.round,
        bracket: cl.bracket,
        sort: cl.sort,
        team1: m.team1 || { name: "TBD", score: "–", is_winner: false },
        team2: m.team2 || { name: "TBD", score: "–", is_winner: false },
        url: m.url,
      };
      if (cl.bracket === "group" || cl.bracket === "other") {
        const s = (m.event_series || "").toLowerCase();
        if (s.includes("play-in") || s.includes("elimination") || s.includes("decider")) {
          playInMatches.push(match);
        } else {
          groupMatches.push(match);
        }
      } else {
        bracketMatches.push(match);
      }
    }

    bracketMatches.sort((a, b) => a.sort - b.sort);

    const groupStandings = {};
    for (const m of groupMatches) {
      const grp = m.round || "Group";
      if (!groupStandings[grp]) groupStandings[grp] = {};
      for (const team of [m.team1, m.team2]) {
        const name = team.name || "TBD";
        if (name === "TBD") continue;
        if (!groupStandings[grp][name]) groupStandings[grp][name] = { wins: 0, losses: 0, maps_won: 0, maps_lost: 0 };
        const completed = (m.status || "").toLowerCase() === "completed";
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

    const piRounds = {};
    for (const m of [...playInMatches, ...bracketMatches.filter(b => {
      const s = (b.round || "").toLowerCase();
      return s.includes("play-in") || s.includes("opening") || s.includes("elimination");
    })]) {
      const key = m.round;
      if (!piRounds[key]) piRounds[key] = { name: m.round, bracket: m.bracket, sort: m.sort, matches: [] };
      piRounds[key].matches.push(m);
    }

    const playoffBracketMatches = bracketMatches.filter(b => {
      const s = (b.round || "").toLowerCase();
      return !s.includes("play-in") && !s.includes("opening") && !s.includes("elimination");
    });

    const rounds = {};
    for (const m of playoffBracketMatches) {
      const key = m.round;
      if (!rounds[key]) rounds[key] = { name: m.round, bracket: m.bracket, sort: m.sort, matches: [] };
      rounds[key].matches.push(m);
    }

    const upper = Object.values(rounds).filter((r) => r.bracket === "upper").sort((a, b) => a.sort - b.sort);
    const lower = Object.values(rounds).filter((r) => r.bracket === "lower").sort((a, b) => a.sort - b.sort);
    const grandFinal = Object.values(rounds).filter((r) => r.bracket === "grand_final").sort((a, b) => a.sort - b.sort);

    const teamsList = new Set();
    for (const m of allMatches) {
      if (m.team1?.name && m.team1.name !== "TBD") teamsList.add(m.team1.name);
      if (m.team2?.name && m.team2.name !== "TBD") teamsList.add(m.team2.name);
    }

    const result = {
      event: eventInfo,
      group_stage: { matches: groupMatches, standings },
      play_ins: {
        rounds: Object.values(piRounds).sort((a, b) => (a.sort || 0) - (b.sort || 0)),
        matches: playInMatches,
      },
      playoffs: {
        bracket: { upper, lower, grand_final: grandFinal },
      },
      teams: [...teamsList].sort(),
      total_matches: allMatches.length,
    };

    bracketCache.set(cacheKey, { data: result, at: Date.now() });
    res.json(result);
  } catch (e) {
    console.error("vlr-bracket error:", e.message);
    res.status(502).json({ error: "Impossible de récupérer le bracket VLR." });
  }
});

app.get("/admin/debug-vlr-americas", async (req, res) => {
  const teams = ["Sentinels", "NRG", "Leviatan", "G2 Esports", "KRU Esports", "Cloud9", "MIBR", "Evil Geniuses"];
  try {
    const results = await Promise.all(teams.map((t) => getUpcomingMatchesForTeam(t)));
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/admin/debug-tournaments", async (req, res) => {
  const search = req.query.search || "Americas";
  try {
    const data = await pandaFetch(
      "/valorant/tournaments?search[name]=" + encodeURIComponent(search) + "&per_page=100&sort=-begin_at"
    );
    const summary = (data || []).map((t) => ({
      id: t.id,
      name: t.name,
      serie: t.serie?.full_name,
      begin_at: t.begin_at,
      end_at: t.end_at,
      has_bracket: t.has_bracket,
    }));
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/map-scores", async (req, res) => {
  const { team1, team2, date } = req.query;
  if (!team1 || !team2) {
    return res.status(400).json({ error: "team1 et team2 requis (date optionnelle, format YYYY-MM-DD)." });
  }

  try {
    // 1. Trouve l'équipe 1 sur vlr.gg
    const search = await vlrFetch("/v2/search?q=" + encodeURIComponent(team1));
    const teamHit = (search?.segments?.results?.teams || []).find((t) => similar(t.name, team1));
    if (!teamHit) {
      return res.status(404).json({ error: "Équipe introuvable sur vlr.gg : " + team1 });
    }

    // 2. Parcourt son historique de matchs pour trouver celui contre team2.
    // Plus de pages si une date est fournie (un match ancien peut être loin
    // dans l'historique), sinon on s'arrête vite (juste le plus récent).
    const MAX_PAGES = date ? 15 : 3;
    let found = null;
    const debugPages = [];
    for (let page = 1; page <= MAX_PAGES && !found; page++) {
      const matches = await vlrFetch("/v2/team?id=" + teamHit.id + "&q=matches&page=" + page);
      const list = matches?.matches || [];
      debugPages.push({ page, count: list.length, sample: list.slice(0, 2) });
      if (list.length === 0) break;

      for (const m of list) {
        const opp = m.teams?.team1 && similar(m.teams.team1, team1) ? m.teams.team2 : m.teams?.team1;
        if (!similar(opp, team2)) continue;
        if (date && daysBetween(m.date, date) > 3) continue; // tolère ±3 jours
        found = m;
        break;
      }
    }

    if (!found) {
      return res.status(404).json({
        error: "Match introuvable sur vlr.gg pour " + team1 + " vs " + team2,
        debug_team_id: teamHit.id,
        debug_team_name: teamHit.name,
        debug_pages: debugPages,
      });
    }

    // 3. Récupère le détail complet (score par map)
    const details = await vlrFetch("/v2/match/details?match_id=" + found.match_id);

    res.json({
      match_id: found.match_id,
      event: details.event,
      date: details.date,
      teams: details.teams,
      maps: (details.maps || []).map((mp) => ({
        map_name: mp.map_name,
        picked_by: mp.picked_by,
        score_team1: mp.score?.team1?.total,
        score_team2: mp.score?.team2?.total,
      })),
    });
  } catch (e) {
    console.error("map-scores error:", e.message);
    res.status(502).json({ error: "Erreur vlr.gg : " + e.message });
  }
});

// --- Championship Points ---

const VCT_CHAMPIONSHIP_POINTS = {
  EMEA: [
    { team: "Team Vitality", pts: 14 },
    { team: "FUT Esports", pts: 13 },
    { team: "Team Heretics", pts: 12 },
    { team: "BBL Esports", pts: 11 },
    { team: "Team Liquid", pts: 9 },
    { team: "FNATIC", pts: 8 },
    { team: "Eternal Fire", pts: 8 },
    { team: "Gentle Mates", pts: 7 },
    { team: "NAVI", pts: 4 },
    { team: "Karmine Corp", pts: 4 },
    { team: "GIANTX", pts: 3 },
    { team: "PCIFIC Esports", pts: 0 },
  ],
  AMERICAS: [
    { team: "Leviatán Esports", pts: 19 },
    { team: "G2 Esports", pts: 17 },
    { team: "NRG", pts: 16 },
    { team: "100 Thieves", pts: 9 },
    { team: "FURIA", pts: 7 },
    { team: "MIBR", pts: 7 },
    { team: "LOUD", pts: 6 },
    { team: "KRÜ Esports", pts: 5 },
    { team: "Sentinels", pts: 4 },
    { team: "ENVY", pts: 3 },
    { team: "Cloud9", pts: 3 },
    { team: "Evil Geniuses", pts: 2 },
  ],
  PACIFIC: [
    { team: "Paper Rex", pts: 25 },
    { team: "Nongshim RedForce", pts: 14 },
    { team: "T1", pts: 13 },
    { team: "Global Esports", pts: 9 },
    { team: "FULL SENSE", pts: 8 },
    { team: "Rex Regum Qeon", pts: 7 },
    { team: "Gen.G", pts: 6 },
    { team: "DetonatioN FocusMe", pts: 5 },
    { team: "Kiwoom DRX", pts: 5 },
    { team: "VARREL", pts: 4 },
    { team: "ZETA DIVISION", pts: 3 },
    { team: "Team Secret", pts: 2 },
  ],
  CN: [
    { team: "EDward Gaming", pts: 23 },
    { team: "Xi Lai Gaming", pts: 18 },
    { team: "TYLOO", pts: 15 },
    { team: "All Gamers", pts: 13 },
    { team: "Bilibili Gaming", pts: 12 },
    { team: "Nova Esports", pts: 10 },
    { team: "Dragon Ranger Gaming", pts: 10 },
    { team: "JD Gaming", pts: 10 },
    { team: "FunPlus Phoenix", pts: 6 },
    { team: "Wolves Esports", pts: 4 },
    { team: "Trace Esports", pts: 2 },
    { team: "TITAN Esports Club", pts: 3 },
  ],
};

app.get("/api/vct-points", (req, res) => {
  const region = (req.query.region || "").toUpperCase();
  if (region && VCT_CHAMPIONSHIP_POINTS[region]) {
    return res.json({ [region]: VCT_CHAMPIONSHIP_POINTS[region] });
  }
  res.json(VCT_CHAMPIONSHIP_POINTS);
});

app.listen(PORT, () => {
  console.log("Backend démarré sur le port " + PORT);
  // Reset automatique des matchs Valorant "abandon définitif" à chaque
  // démarrage. Maintenant que saveMapScoresFailure ne produit plus d'abandon
  // définitif (backoff plafonné à 4h), ce reset ne sert que pour les anciens
  // matchs déjà marqués "null" en base.
  try {
    const resetCount = resetAbandonedMapScores();
    if (resetCount > 0) {
      console.log(`[startup] ${resetCount} match(s) Valorant "abandon définitif" remis en jeu automatiquement.`);
    }
  } catch (e) {
    console.error("[startup] échec de la réinitialisation des matchs abandonnés:", e.message);
  }
  try {
    const fixedCount = resetInconsistentMapScores();
    if (fixedCount > 0) {
      console.log(`[startup] ${fixedCount} match(s) Valorant map_scores incohérents (ordre vlr.gg inversé) remis en jeu.`);
    }
  } catch (e) {
    console.error("[startup] échec du nettoyage des map_scores incohérents:", e.message);
  }
});
