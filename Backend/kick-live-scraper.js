/**
 * Kick live scraper — poll Kick channels for stream titles and extract
 * CS2 map scores. Channel names come from PandaScore's `stream_url` on
 * live CS2 matches (kick.com/<channel>).
 *
 * Kick expose une API publique JSON (`/api/v2/channels/<slug>`) qui
 * renvoie `livestream.session_title`. Les casters mettent souvent le
 * score série (ex: "T1 vs FaZe 1-0 | IEM Cologne"). On tente aussi
 * d'extraire un score de map (ex: "Dust 2 13-7").
 */

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

const KICK_API_BASE = "https://kick.com/api/v2/channels/";
const TTL_MS = 60 * 1000;
const POLL_INTERVAL_MS = 60_000;

const cache = new Map(); // key: normalized channel slug → { title, seriesScore, mapScores, scrapedAt, matchKey }
const activeChannels = new Map(); // channel → { team1, team2 }

function normalize(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function extractKickChannel(streamUrl) {
  if (!streamUrl) return null;
  const m = String(streamUrl).match(/kick\.com\/([a-z0-9_-]+)/i);
  return m ? m[1].toLowerCase() : null;
}

function parseTitle(title, team1, team2) {
  if (!title) return { seriesScore: null, mapScores: [] };
  const t = title.replace(/\s+/g, " ").trim();

  // Score série (petit, <10 des 2 côtés) — ex: "1-0", "2-1", "3 - 2"
  const seriesMatch = t.match(/(?:^|\s|\(|\[)(\d)\s*[-–:]\s*(\d)(?:\s|\)|\]|$)/);
  const seriesScore = seriesMatch
    ? { a: Number(seriesMatch[1]), b: Number(seriesMatch[2]) }
    : null;

  // Scores de maps CS2 (13-x, x-13, 16-x pour ancien format) : nombres 0-30
  const mapRe = /(\d{1,2})\s*[-–:]\s*(\d{1,2})/g;
  const mapScores = [];
  let m;
  while ((m = mapRe.exec(t))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    // On ne garde que ce qui ressemble à un score de map CS2 :
    // au moins un des deux ≥ 6, max 30 par côté, différent du score série.
    if (a <= 30 && b <= 30 && (a >= 6 || b >= 6)) {
      mapScores.push({ score1: a, score2: b });
    }
  }

  return { seriesScore, mapScores };
}

async function fetchChannel(channel) {
  try {
    const res = await fetch(KICK_API_BASE + encodeURIComponent(channel), {
      headers: HEADERS,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.livestream) return null;
    return {
      title: data.livestream.session_title || "",
      isLive: !!data.livestream.is_live,
      viewers: data.livestream.viewer_count || 0,
    };
  } catch {
    return null;
  }
}

async function pollChannel(channel, ctx) {
  const info = await fetchChannel(channel);
  if (!info || !info.isLive) {
    cache.delete(channel);
    return;
  }
  const { seriesScore, mapScores } = parseTitle(info.title, ctx.team1, ctx.team2);
  cache.set(channel, {
    title: info.title,
    viewers: info.viewers,
    seriesScore,
    mapScores,
    team1: ctx.team1,
    team2: ctx.team2,
    scrapedAt: Date.now(),
  });
  console.log(
    `[kick-scraper] ${channel} (${ctx.team1} vs ${ctx.team2}) → "${info.title.slice(0, 80)}"`,
    seriesScore ? `series=${seriesScore.a}-${seriesScore.b}` : "",
    mapScores.length ? `maps=${mapScores.map((s) => `${s.score1}-${s.score2}`).join(",")}` : ""
  );
}

async function pollAll() {
  const now = Date.now();
  // Purge stale entries (channels no longer tracked or expired)
  for (const [k, v] of cache) {
    if (now - v.scrapedAt > TTL_MS * 5) cache.delete(k);
  }
  const jobs = [];
  for (const [channel, ctx] of activeChannels) {
    jobs.push(pollChannel(channel, ctx));
  }
  await Promise.allSettled(jobs);
}

/**
 * Enregistre les couples channel/match à scraper. Appelé depuis la route
 * cs2-live pour dire "voici les streams Kick des matchs actuellement en
 * direct". Ceux qui disparaissent ne sont plus poll.
 */
export function registerKickChannels(matches) {
  const next = new Map();
  for (const m of matches || []) {
    const su = m.stream_url || (Array.isArray(m.streams_list) ? m.streams_list.find((s) => s?.raw_url?.includes("kick.com"))?.raw_url : null);
    const channel = extractKickChannel(su);
    if (!channel) continue;
    const t1 = m.opponents?.[0]?.opponent?.name || m.team1 || "";
    const t2 = m.opponents?.[1]?.opponent?.name || m.team2 || "";
    next.set(channel, { team1: t1, team2: t2 });
  }
  activeChannels.clear();
  for (const [k, v] of next) activeChannels.set(k, v);
}

/**
 * Cherche dans le cache un scrape correspondant à ce couple d'équipes.
 * Renvoie `{ title, seriesScore, mapScores, viewers, scrapedAt }` ou null.
 */
export function getKickScoresForMatch(team1Name, team2Name) {
  const q1 = normalize(team1Name);
  const q2 = normalize(team2Name);
  for (const entry of cache.values()) {
    const t1 = normalize(entry.team1);
    const t2 = normalize(entry.team2);
    if ((t1 === q1 && t2 === q2) || (t1 === q2 && t2 === q1)) {
      const swap = t1 === q2;
      return {
        title: entry.title,
        viewers: entry.viewers,
        seriesScore: entry.seriesScore
          ? swap
            ? { a: entry.seriesScore.b, b: entry.seriesScore.a }
            : entry.seriesScore
          : null,
        mapScores: entry.mapScores.map((m) =>
          swap ? { score1: m.score2, score2: m.score1 } : m
        ),
        scrapedAt: entry.scrapedAt,
      };
    }
  }
  return null;
}

export function startKickScraper() {
  console.log("[kick-scraper] démarrage, poll par channel toutes les 60s");
  async function loop() {
    try {
      await pollAll();
    } catch (err) {
      console.error("[kick-scraper] erreur:", err.message);
    }
    setTimeout(loop, POLL_INTERVAL_MS);
  }
  setTimeout(loop, 10_000);
}
