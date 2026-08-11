
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import oddsRouter from "./odds.js";
import { getMapScores } from "./vlr-scores.js";
import { storeFinishedMatches, getFullHistory, getTeamHistory } from "./match-history-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MATCHES_PATH = path.join(__dirname, "data", "matches.json");

const app = express();
app.use(cors());
app.use(oddsRouter);

const PORT = process.env.PORT || 3000;
const PANDASCORE_API_KEY = process.env.PANDASCORE_API_KEY;
const PANDASCORE_BASE = "https://api.pandascore.co";

if (!PANDASCORE_API_KEY) {
  console.warn(
    "⚠️  PANDASCORE_API_KEY n'est pas définie. Ajoute-la dans les variables d'environnement de Railway."
  );
}

async function pandaFetch(path) {
  const res = await fetch(PANDASCORE_BASE + path, {
    headers: {
      Authorization: "Bearer " + PANDASCORE_API_KEY,
    },
  });
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

app.get("/api/valorant-upcoming", async (req, res) => {
  try {
    const data = await cachedFetch("upcoming", "/valorant/matches/upcoming?per_page=50");
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "Impossible de récupérer les matchs à venir." });
  }
});

app.get("/api/valorant-live", async (req, res) => {
  try {
    const data = await cachedFetch("live", "/valorant/matches/running?per_page=50");
    res.json(data);
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

async function enrichWithMapScores(data) {
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

  await mapWithConcurrency(finished, 1, async (m) => {
    const t1 = m.opponents?.[0]?.opponent?.name;
    const t2 = m.opponents?.[1]?.opponent?.name;
    const date = (m.begin_at || "").slice(0, 10);
    if (!t1 || !t2 || !date) {
      console.log(`[map_scores] skip (données manquantes) — t1=${t1} t2=${t2} date=${date}`);
      return;
    }
    try {
      m.map_scores = await getMapScores(t1, t2, date); // null si pas trouvé
      console.log(`[map_scores] ${t1} vs ${t2} (${date}) →`, JSON.stringify(m.map_scores));
    } catch (e) {
      m.map_scores = null;
      console.log(`[map_scores] ${t1} vs ${t2} (${date}) → ERREUR:`, e.message);
    }
    // 900ms (au lieu de 400) : depuis qu'on enrichit TOUS les matchs terminés
    // (plus de limite à 8), il faut laisser plus de marge au rate-limiter de
    // vlrggapi entre chaque match, sinon seul le 1er passe et les suivants
    // se prennent des 429 en cascade.
    await sleep(900);
  });
}

app.get("/api/valorant-results", async (req, res) => {
  try {
    const now = Date.now();
    if (enrichedResultsCache && now - enrichedResultsCache.time < ENRICHED_RESULTS_TTL_MS) {
      return res.json(enrichedResultsCache.data);
    }

    const data = await cachedFetch("results", "/valorant/matches/past?per_page=50");

    // Ajoute le score par manche (13-9) via vlr.gg quand c'est trouvable.
    // Échec silencieux par match : jamais de crash si un match n'est pas trouvé.
    await enrichWithMapScores(data);

    enrichedResultsCache = { data, time: now };

    // Accumule les matchs terminés dans la mini base SQLite (voir
    // match-history-store.js). N'affecte pas la réponse ni /api/match-history
    // pour l'instant — c'est un stock qui s'accumule en parallèle, en attendant
    // qu'on décide comment le fusionner avec l'historique statique matches.json.
    const rows = data.map(toHistoryRow).filter(Boolean);
    storeFinishedMatches(rows);

    res.json(data);
  } catch (e) {
    console.error(e);
    // Si le sweep échoue mais qu'on a un cache même périmé, mieux vaut le
    // servir que de renvoyer une erreur au front.
    if (enrichedResultsCache) return res.json(enrichedResultsCache.data);
    res.status(502).json({ error: "Impossible de récupérer les résultats." });
  }
});

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

app.listen(PORT, () => {
  console.log("Backend démarré sur le port " + PORT);
});
