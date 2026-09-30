/**
 * Fallback "search-driven" pour les scores par map CS2.
 *
 * Objectif: eviter de bruler le quota Cito API en utilisant une recherche
 * web (Google/DuckDuckGo) comme index vers bo3.gg / HLTV / Liquipedia,
 * puis fetch la premiere source trouvee et parse les scores.
 *
 * Priorite:
 *  1) bo3.gg (parse JSON stable via slug URL)
 *  2) HLTV (parse HTML des stats matchpage)
 *  3) Liquipedia (via API deja utilisee ailleurs)
 *
 * Zero API key requise. Fait 1 requete Google + 1 requete source par
 * match. Attention: fragile face aux User-Agent bans. Utilise en dernier
 * recours (aprs echec de toutes les sources directes).
 */

const SEARCH_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// Cache par match (key: team1|team2|date) pour ne pas re-scraper si deja fait
const scrapeCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function googleSearchUrls(query) {
  // DuckDuckGo HTML endpoint (moins de rate limit que Google, parse plus simple)
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": SEARCH_UA, "Accept": "text/html" },
    });
    if (!r.ok) return [];
    const html = await r.text();
    // Extrait tous les liens des SERP DuckDuckGo (format: uddg=<url encoded>)
    const urls = [];
    const re = /uddg=([^&"]+)/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      try {
        const decoded = decodeURIComponent(m[1]);
        urls.push(decoded);
      } catch {}
      if (urls.length >= 30) break;
    }
    return urls;
  } catch (e) {
    return [];
  }
}

// bo3.gg URL: https://bo3.gg/matches/team1-vs-team2-DD-MM-YYYY
function extractBo3ggSlug(url) {
  const m = url.match(/bo3\.gg\/matches?\/([a-z0-9-]+)/i);
  return m ? m[1] : null;
}

async function fetchBo3ggMapsBySlug(slug) {
  const url = `https://api.bo3.gg/api/v1/matches/${slug}?with=games`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": SEARCH_UA } });
    if (!r.ok) return null;
    const data = await r.json();
    const games = data?.games || data?.data?.games || [];
    if (!Array.isArray(games) || games.length === 0) return null;
    const finished = games.filter((g) => g.status === "finished" || g.winner_clan_score != null);
    if (finished.length === 0) return null;
    // On ne connait pas team1/team2 sans plus d'info. On expose brut:
    return finished.map((g) => ({
      map: g.map_name || g.map?.name || "?",
      // bo3.gg n'a pas score1/score2 lie a team1/team2 directement.
      // On expose winner_clan_score + loser_clan_score + winner_clan_name
      winnerScore: g.winner_clan_score,
      loserScore: g.loser_clan_score,
      winnerName: g.winner_clan?.name || g.winner_clan_name,
    }));
  } catch (e) {
    return null;
  }
}

// HLTV URL: https://www.hltv.org/matches/12345/team1-vs-team2-tournament
// Le fetch HLTV depuis Railway est bloque par Cloudflare - on skip.
// Liquipedia URL: https://liquipedia.net/counterstrike/...
// Deja gere par liquipedia-scores.js - on skip aussi.

// Fonction principale: chercher scores par map pour un match.
export async function findMapScoresViaGoogle(team1Name, team2Name, dateISO) {
  const cacheKey = `${team1Name}|${team2Name}|${dateISO || ""}`;
  const cached = scrapeCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  const query = `${team1Name} vs ${team2Name} cs2 map score bo3.gg`;
  const urls = await googleSearchUrls(query);

  // Cherche URL bo3.gg dans les resultats
  const bo3gg = urls.find((u) => /bo3\.gg\/matches?\//i.test(u));
  if (bo3gg) {
    const slug = extractBo3ggSlug(bo3gg);
    if (slug) {
      const rawGames = await fetchBo3ggMapsBySlug(slug);
      if (rawGames && rawGames.length > 0) {
        // Mappe winner/loser aux team1/team2 fournis (par nom fuzzy)
        const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const n1 = norm(team1Name);
        const mapScores = rawGames.map((g) => {
          const wn = norm(g.winnerName);
          const winnerIsT1 = wn === n1 || wn.includes(n1) || n1.includes(wn);
          return {
            map: g.map,
            score1: winnerIsT1 ? g.winnerScore : g.loserScore,
            score2: winnerIsT1 ? g.loserScore : g.winnerScore,
          };
        });
        scrapeCache.set(cacheKey, { data: mapScores, at: Date.now() });
        return mapScores;
      }
    }
  }

  scrapeCache.set(cacheKey, { data: null, at: Date.now() });
  return null;
}
