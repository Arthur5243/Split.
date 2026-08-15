/**
 * Suivi des scores par map CS2 via hltv-match-api (ton fork corrigé,
 * auto-hébergé sur Railway : https://github.com/Arthur5243/hltv-match-api).
 *
 * DIFFÉRENCE STRUCTURELLE IMPORTANTE avec vlr-scores.js (Valorant) : cette
 * API n'expose QUE les matchs live et à venir —
 *   GET /api/matches, /api/matches/live, /api/matches/upcoming
 * — il n'existe PAS d'endpoint "détail d'un match déjà terminé". Sur un
 * match live, elle renvoie :
 *   team1Score / team2Score  -> score de MANCHES de la map EN COURS
 *   team1MapWins / team2MapWins -> nb de maps déjà remportées par équipe
 * Donc aucun lookup a posteriori n'est possible une fois le match terminé.
 *
 * Stratégie : sonder /api/matches/live à intervalle régulier PENDANT que le
 * match est en direct, et figer le score d'une map au moment précis où
 * mapWins augmente — la map qui vient de se terminer avait le score vu au
 * sondage PRÉCÉDENT, juste avant l'incrémentation (au sondage suivant, le
 * compteur est déjà reparti à 0 sur la map suivante). Le tout est gardé en
 * mémoire ici, puis remonté à cs2-routes.js dès qu'un match disparaît de la
 * liste "running" PandaScore (= terminé), voir `finalizeAndGet`.
 *
 * Défensif comme le reste de l'app : HLTV_API_BASE absent, service
 * injoignable, équipe non trouvée, suivi incomplet -> on renvoie `null`,
 * jamais un score inventé. L'appelant (cs2-routes.js) retombe alors sur son
 * propre repli (PandaScore /csgo/games/{id}), puis sur "0-0" côté front.
 */

const HLTV_API_BASE = (process.env.HLTV_API_BASE || "").replace(/\/$/, "");

// 1 min : assez fréquent pour ne pas rater la fin d'une map (une map CS2
// dure généralement 30-45 min), assez espacé pour rester léger sur
// l'instance auto-hébergée.
const POLL_INTERVAL_MS = 60 * 1000;

if (!HLTV_API_BASE) {
  console.warn(
    "ℹ️  HLTV_API_BASE n'est pas définie : le suivi live hltv-match-api pour les scores par map CS2 est désactivé (repli sur PandaScore/csgo/games)."
  );
}

// Même comparateur que vlr-scores.js/server.js (insensible à la casse/accents).
function similar(a, b) {
  const clean = (s) =>
    (s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const ca = clean(a);
  const cb = clean(b);
  if (!ca || !cb) return false;
  return ca === cb || ca.includes(cb) || cb.includes(ca);
}

async function fetchHltvLive() {
  if (!HLTV_API_BASE) return [];
  const res = await fetch(HLTV_API_BASE + "/api/matches/live");
  if (!res.ok) throw new Error("hltv-match-api HTTP " + res.status);
  const json = await res.json();
  return Array.isArray(json) ? json : json.liveMatches || [];
}

function findHltvMatch(hltvMatches, team1Name, team2Name) {
  return hltvMatches.find(
    (h) =>
      (similar(h.team1Name, team1Name) && similar(h.team2Name, team2Name)) ||
      (similar(h.team1Name, team2Name) && similar(h.team2Name, team1Name))
  );
}

// hltvMatch liste-t-il les équipes dans le MÊME ordre que PandaScore pour ce
// match (team1 HLTV == team1 PandaScore) ? Sert à ne jamais inverser
// score1/score2 si HLTV les liste dans l'autre sens.
function isSameOrder(hltvMatch, team1Name) {
  return similar(hltvMatch.team1Name, team1Name);
}

// pandascoreMatchId (string) -> { maps: [{score1,score2}], lastSnapshot, lastSeenAt }
const tracked = new Map();

// Un tour de sondage : appelé régulièrement (cf startHltvTracker) avec la
// liste des matchs CS2 bruts "running" côté PandaScore (opponents[].opponent
// avec .id/.name, tel que renvoyé par /csgo/matches/running).
async function pollOnce(pandascoreLiveMatches) {
  if (!HLTV_API_BASE || !pandascoreLiveMatches || pandascoreLiveMatches.length === 0) return;

  let hltvMatches;
  try {
    hltvMatches = await fetchHltvLive();
  } catch (e) {
    console.log("[hltv] sondage impossible:", e.message);
    return;
  }

  for (const m of pandascoreLiveMatches) {
    const t1 = m.opponents?.[0]?.opponent;
    const t2 = m.opponents?.[1]?.opponent;
    if (!t1 || !t2) continue;

    const hMatch = findHltvMatch(hltvMatches, t1.name, t2.name);
    if (!hMatch) continue; // pas (encore) trouvé côté HLTV -> on retentera au prochain sondage

    const sameOrder = isSameOrder(hMatch, t1.name);
    const score1 = sameOrder ? hMatch.team1Score : hMatch.team2Score;
    const score2 = sameOrder ? hMatch.team2Score : hMatch.team1Score;
    const mapWins1 = (sameOrder ? hMatch.team1MapWins : hMatch.team2MapWins) || 0;
    const mapWins2 = (sameOrder ? hMatch.team2MapWins : hMatch.team1MapWins) || 0;
    if (score1 == null || score2 == null) continue;

    const key = String(m.id);
    const state = tracked.get(key) || { maps: [], lastSnapshot: null };
    const prev = state.lastSnapshot;
    const totalMapsBefore = prev ? prev.mapWins1 + prev.mapWins2 : 0;
    const totalMapsNow = mapWins1 + mapWins2;

    if (prev && totalMapsNow > totalMapsBefore) {
      // Une map vient de se terminer entre les deux sondages : on fige son
      // score avec le DERNIER snapshot connu avant l'incrémentation (prev),
      // jamais le score courant (déjà reparti à 0 sur la map suivante).
      state.maps.push({ score1: prev.score1, score2: prev.score2 });
    }

    state.lastSnapshot = { score1, score2, mapWins1, mapWins2 };
    state.lastSeenAt = Date.now();
    tracked.set(key, state);
  }
}

/**
 * À appeler une fois qu'un match a quitté la liste "running" PandaScore
 * (donc terminé) : finalise la dernière map en cours (celle qui n'a jamais
 * eu de sondage "après" pour détecter son incrémentation) et renvoie le
 * tableau complet au même format que PandaScore ({score1, score2} par map,
 * sans nom de map — HLTV ne l'expose pas sur ces endpoints).
 *
 * `expectedTotalMaps` = nb de maps jouées d'après le score de série
 * PandaScore (results). Si le suivi est incomplet par rapport à ce total
 * (serveur redémarré en cours de route, match raté au tout début...), on
 * renvoie `null` plutôt qu'un score partiel trompeur.
 */
function finalizeAndGet(pandascoreMatchId, expectedTotalMaps) {
  const key = String(pandascoreMatchId);
  const state = tracked.get(key);
  tracked.delete(key); // libère la mémoire, qu'on ait ou non un résultat exploitable
  if (!state) return null;

  if (state.lastSnapshot && state.maps.length < expectedTotalMaps) {
    state.maps.push({ score1: state.lastSnapshot.score1, score2: state.lastSnapshot.score2 });
  }

  if (!expectedTotalMaps || state.maps.length !== expectedTotalMaps) return null;
  return state.maps;
}

let intervalHandle = null;

/**
 * Démarre le sondage périodique en arrière-plan. `getLiveMatchesFn` doit
 * renvoyer (async) les matchs CS2 bruts "running" côté PandaScore. No-op si
 * HLTV_API_BASE n'est pas configurée, ou si déjà démarré.
 */
function startHltvTracker(getLiveMatchesFn) {
  if (!HLTV_API_BASE || intervalHandle) return;
  const tick = async () => {
    try {
      const live = await getLiveMatchesFn();
      await pollOnce(live || []);
    } catch (e) {
      console.log("[hltv] erreur de sondage:", e.message);
    }
  };
  tick();
  intervalHandle = setInterval(tick, POLL_INTERVAL_MS);
}

export { startHltvTracker, finalizeAndGet, HLTV_API_BASE };
