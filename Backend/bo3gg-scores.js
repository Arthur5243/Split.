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
  const candidates = [base, base + "-cs"];

  for (const slug of candidates) {
    const data = await fetchJson(`${BO3_API}/teams/${slug}`);
    if (data && data.slug) {
      teamSlugCache.set(teamName, data.slug);
      return data.slug;
    }
  }

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

export { getMapScoresFromBo3gg };
