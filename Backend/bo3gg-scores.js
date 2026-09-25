/**
 * Fallback pour les scores par map CS2 via l'API bo3.gg (gratuite, pas de clé).
 *
 * Pipeline : Liquipedia (priorité) → bo3.gg (fallback) → saisie manuelle.
 *
 * bo3.gg couvre les tournois C-tier que Liquipedia ignore (EPL Regular Season,
 * CCT Challengers, Fiesta Series, etc.). L'API est REST, non documentée
 * publiquement mais stable (Nuxt SSR l'utilise en interne).
 *
 * Endpoint principal :
 *   GET https://api.bo3.gg/api/v1/matches/{slug}?with=games
 *   → renvoie le match avec un tableau `games` contenant map_name,
 *     winner_clan_score, loser_clan_score, winner_clan_name, loser_clan_name.
 *
 * Le slug suit le format : {team1-slug}-vs-{team2-slug}-{DD}-{MM}-{YYYY}.
 * Certaines équipes ont un suffixe "-cs" dans leur slug bo3.gg (pour les
 * distinguer de l'équipe Valorant/LoL homonyme). On essaie sans, puis avec.
 */

const BO3_API = "https://api.bo3.gg/api/v1";

const teamSlugCache = new Map();

function slugify(name) {
  return (name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function fetchJson(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": "Split-Esport-Backend/1.0" },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`bo3.gg ${r.status} for ${url}`);
  return r.json();
}

async function resolveTeamSlug(teamName) {
  const cached = teamSlugCache.get(teamName);
  if (cached !== undefined) return cached;

  const base = slugify(teamName);
  // Plus de suffixes couverts : les équipes CS pro utilisent souvent des
  // suffixes disambigus sur bo3.gg (`-cs`, `-esports`, `-team`, etc.), et
  // certaines n'ont même pas le "esports" côté PandaScore mais l'ont côté bo3.
  const candidates = [
    base,
    base + "-cs",
    base + "-esports",
    base + "-esport",
    base + "-team",
    base + "-gaming",
    // Sans article "the" (ex: "the-mongolz" → "mongolz")
    base.replace(/^the-/, ""),
    // Version sans espaces (déjà géré par slugify, mais au cas où l'espace était un tiret)
    base.replace(/-/g, ""),
  ];

  // Retire les doublons tout en préservant l'ordre
  const seen = new Set();
  const unique = candidates.filter((s) => s && !seen.has(s) && seen.add(s));

  for (const slug of unique) {
    try {
      const data = await fetchJson(`${BO3_API}/teams/${slug}`);
      if (data && data.slug) {
        teamSlugCache.set(teamName, data.slug);
        console.log(`[bo3gg] slug "${teamName}" → "${data.slug}"`);
        return data.slug;
      }
    } catch {
      // continue avec le prochain candidat
    }
  }

  // Fallback : recherche floue via l'endpoint /teams?filter[title]=X
  try {
    const searchUrl = `${BO3_API}/teams?filter[title]=${encodeURIComponent(teamName)}&limit=5`;
    const data = await fetchJson(searchUrl);
    const list = data?.data || data?.teams || (Array.isArray(data) ? data : null);
    if (Array.isArray(list) && list.length > 0) {
      // Match sur nom normalisé
      const q = slugify(teamName);
      const best = list.find((t) => t.slug && (slugify(t.name || t.title || "") === q || slugify(t.slug) === q)) || list[0];
      if (best?.slug) {
        teamSlugCache.set(teamName, best.slug);
        console.log(`[bo3gg] slug (via search) "${teamName}" → "${best.slug}"`);
        return best.slug;
      }
    }
  } catch {}

  teamSlugCache.set(teamName, null);
  return null;
}

function formatDateForSlug(dateStr) {
  const [y, m, d] = (dateStr || "").split("-");
  if (!y || !m || !d) return null;
  return `${d}-${m}-${y}`;
}

async function getMapScoresFromBo3gg(team1Name, team2Name, dateStr) {
  const slug1 = await resolveTeamSlug(team1Name);
  const slug2 = await resolveTeamSlug(team2Name);
  if (!slug1 || !slug2) return null;

  const datePart = formatDateForSlug(dateStr);
  if (!datePart) return null;

  const slugCandidates = [
    `${slug1}-vs-${slug2}-${datePart}`,
    `${slug2}-vs-${slug1}-${datePart}`,
  ];

  for (const matchSlug of slugCandidates) {
    const data = await fetchJson(`${BO3_API}/matches/${matchSlug}?with=games`);
    if (!data || !Array.isArray(data.games) || data.games.length === 0) continue;

    const games = data.games
      .filter((g) => g.status === "finished" && g.winner_clan_score != null)
      .sort((a, b) => (a.number || 0) - (b.number || 0));

    if (games.length === 0) continue;

    const mapName = (raw) =>
      (raw || "").replace(/^de_/, "").replace(/^\w/, (c) => c.toUpperCase());

    const t1Slug = slugify(team1Name);

    const result = games.map((g) => {
      const winnerSlug = slugify(g.winner_clan_name || "");
      const winnerIsTeam1 =
        winnerSlug.includes(t1Slug) || t1Slug.includes(winnerSlug);
      return {
        map: mapName(g.map_name),
        score1: winnerIsTeam1 ? g.winner_clan_score : g.loser_clan_score,
        score2: winnerIsTeam1 ? g.loser_clan_score : g.winner_clan_score,
      };
    });

    console.log(
      `[bo3gg] ${team1Name} vs ${team2Name} (${dateStr}) → ${result.length} map(s) trouvée(s) via slug "${matchSlug}"`
    );
    return result;
  }

  return null;
}

/**
 * Version LIVE : renvoie aussi les games en cours (status "started",
 * "in_progress"), pas seulement "finished". Utilisé par la route /api/cs2-live
 * pour diffuser les scores map en temps réel.
 */
async function getLiveMapScoresFromBo3gg(team1Name, team2Name, dateStr) {
  const slug1 = await resolveTeamSlug(team1Name);
  const slug2 = await resolveTeamSlug(team2Name);
  if (!slug1 || !slug2) return null;

  const datePart = formatDateForSlug(dateStr);
  if (!datePart) return null;

  const slugCandidates = [
    `${slug1}-vs-${slug2}-${datePart}`,
    `${slug2}-vs-${slug1}-${datePart}`,
  ];

  for (const matchSlug of slugCandidates) {
    const data = await fetchJson(`${BO3_API}/matches/${matchSlug}?with=games`);
    if (!data || !Array.isArray(data.games) || data.games.length === 0) continue;

    const games = data.games
      .filter((g) => (g.winner_clan_score != null && g.loser_clan_score != null) || g.status === "in_progress" || g.status === "started")
      .sort((a, b) => (a.number || 0) - (b.number || 0));

    if (games.length === 0) continue;

    const mapName = (raw) =>
      (raw || "").replace(/^de_/, "").replace(/^\w/, (c) => c.toUpperCase());

    const t1Slug = slugify(team1Name);

    const result = games.map((g) => {
      const s1raw = g.winner_clan_score;
      const s2raw = g.loser_clan_score;
      const winnerSlug = slugify(g.winner_clan_name || "");
      const winnerIsTeam1 =
        winnerSlug && (winnerSlug.includes(t1Slug) || t1Slug.includes(winnerSlug));
      const s1 = winnerIsTeam1 ? s1raw : s2raw;
      const s2 = winnerIsTeam1 ? s2raw : s1raw;
      return {
        map: mapName(g.map_name || `Map ${g.number || "?"}`),
        score1: s1 ?? 0,
        score2: s2 ?? 0,
      };
    });

    console.log(
      `[bo3gg-live] ${team1Name} vs ${team2Name} (${dateStr}) → ${result.length} game(s) via slug "${matchSlug}"`
    );
    return result;
  }

  return null;
}

// Cache mémoire pour /api/cs2-live : la route ne peut pas await bo3.gg par
// match (timeout Railway). Un worker de fond poll les matchs live enregistrés
// via registerBo3ggLiveMatches() toutes les 45s.
const bo3ggLiveCache = new Map(); // key: t1|t2|date → { scores, at }
const bo3ggLiveTargets = new Map(); // même clé → { t1, t2, date }
const BO3GG_LIVE_TTL_MS = 5 * 60 * 1000;
const BO3GG_LIVE_POLL_MS = 45_000;

function bo3Key(t1, t2, date) {
  const a = slugify(t1);
  const b = slugify(t2);
  return [a < b ? a : b, a < b ? b : a, date].join("|");
}

function registerBo3ggLiveMatches(matches) {
  const next = new Map();
  for (const m of matches || []) {
    const t1 = m.team1 || m.opponents?.[0]?.opponent?.name;
    const t2 = m.team2 || m.opponents?.[1]?.opponent?.name;
    const date = (m.begin_at || m.beginAt || "").slice(0, 10);
    if (!t1 || !t2 || !date) continue;
    next.set(bo3Key(t1, t2, date), { t1, t2, date });
  }
  bo3ggLiveTargets.clear();
  for (const [k, v] of next) bo3ggLiveTargets.set(k, v);
}

function getBo3ggLiveScores(t1, t2, date) {
  const entry = bo3ggLiveCache.get(bo3Key(t1, t2, date));
  if (!entry) return null;
  if (Date.now() - entry.at > BO3GG_LIVE_TTL_MS) return null;
  return entry.scores;
}

async function pollBo3ggLive() {
  const now = Date.now();
  for (const [k, e] of bo3ggLiveCache) {
    if (now - e.at > BO3GG_LIVE_TTL_MS * 2) bo3ggLiveCache.delete(k);
  }
  for (const [k, { t1, t2, date }] of bo3ggLiveTargets) {
    try {
      const scores = await getLiveMapScoresFromBo3gg(t1, t2, date);
      if (scores && scores.length > 0) {
        bo3ggLiveCache.set(k, { scores, at: Date.now() });
      }
    } catch (e) {
      // ignore par match
    }
  }
}

function startBo3ggLiveWorker() {
  console.log("[bo3gg-live] worker démarré, poll toutes les 45s sur les matchs CS2 live enregistrés");
  async function loop() {
    try { await pollBo3ggLive(); } catch {}
    setTimeout(loop, BO3GG_LIVE_POLL_MS);
  }
  setTimeout(loop, 15_000);
}

export { getMapScoresFromBo3gg, getLiveMapScoresFromBo3gg, registerBo3ggLiveMatches, getBo3ggLiveScores, startBo3ggLiveWorker };
