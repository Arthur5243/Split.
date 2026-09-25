/**
 * Twitch live scraper — poll les chaînes officielles Valorant et extrait
 * les scores série/map depuis le titre du stream.
 *
 * Utilise l'endpoint GraphQL public de Twitch avec le Client-Id public bien
 * connu (utilisé par le client web Twitch officiel). Pas d'OAuth requis.
 *
 * Complémentaire au vlr-live-scraper : Twitch donne le score série (mis à
 * jour par le production team), VLR donne les scores map détaillés. Le
 * front peut choisir quelle source afficher.
 */

const TWITCH_GQL = "https://gql.twitch.tv/gql";
const TWITCH_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko"; // client-id public web Twitch

const HEADERS = {
  "Client-Id": TWITCH_CLIENT_ID,
  "Content-Type": "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

// Chaînes officielles Valorant par région (identique à REGION_TWITCH côté front)
const CHANNELS = [
  "valorant_emea",
  "valorant_americas",
  "valorant_pacific",
  "valorantesports_cn",
  "valorant",
];

const TTL_MS = 60 * 1000;
const POLL_INTERVAL_MS = 45_000;

const cache = new Map(); // channel → { title, seriesScore, mapScores, team1, team2, scrapedAt }

function normalize(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

async function fetchStreamTitle(channel) {
  try {
    const body = [
      {
        operationName: "StreamMetadata",
        variables: { channelLogin: channel, previewImageURL: null },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash:
              "252a46e3f5b1ddc431b396e688331d8d020daec27079893ac7d4e6db759a7402",
          },
        },
      },
    ];
    const res = await fetch(TWITCH_GQL, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const user = data?.[0]?.data?.user;
    const stream = user?.stream;
    if (!stream) return null;
    // Le titre est en fait dans lastBroadcast.title ou stream.game.displayName
    // Selon la version, il faut faire un 2nd call. Fallback: fetch simple.
    const title = user?.lastBroadcast?.title || stream?.title || "";
    return {
      isLive: true,
      title,
      viewers: stream.viewersCount || 0,
    };
  } catch {
    return null;
  }
}

// Fallback: query simple GraphQL en clair — moins fragile qu'un persistedQuery
// dont le hash peut être invalidé par Twitch à tout moment.
async function fetchStreamTitleRaw(channel) {
  try {
    const body = {
      query: `query { user(login: "${channel.replace(/"/g, '')}") { stream { id title createdAt viewersCount } lastBroadcast { title startedAt } } }`,
    };
    const res = await fetch(TWITCH_GQL, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const user = data?.data?.user;
    const stream = user?.stream;
    if (!stream) return null;
    return {
      isLive: true,
      title: stream.title || user?.lastBroadcast?.title || "",
      viewers: stream.viewersCount || 0,
    };
  } catch {
    return null;
  }
}

function parseTitle(title) {
  if (!title) return { team1: null, team2: null, seriesScore: null, mapScores: [] };
  const t = title.replace(/\s+/g, " ").trim();

  // Extraction team1 vs team2 : cherche "X vs Y" (case-insensitive)
  let team1 = null, team2 = null;
  const vsMatch = t.match(/([A-Z0-9][\w.& -]{1,25})\s+(?:vs\.?|v)\s+([A-Z0-9][\w.& -]{1,25})/i);
  if (vsMatch) {
    team1 = vsMatch[1].trim().replace(/[\s|\-]+$/, "");
    team2 = vsMatch[2].trim().replace(/[\s|\-]+$/, "");
  }

  // Score série (0-2, 1-1, 2-0, etc.)
  const seriesMatch = t.match(/(?:^|\s|\(|\[)(\d)\s*[-–:]\s*(\d)(?:\s|\)|\]|$)/);
  const seriesScore = seriesMatch
    ? { a: Number(seriesMatch[1]), b: Number(seriesMatch[2]) }
    : null;

  // Scores map Valorant : 13-x, x-13 (nouveau format) ou anciens formats jusqu'à 30
  const mapRe = /(\d{1,2})\s*[-–:]\s*(\d{1,2})/g;
  const mapScores = [];
  let m;
  while ((m = mapRe.exec(t))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a <= 30 && b <= 30 && (a >= 8 || b >= 8)) {
      mapScores.push({ score1: a, score2: b });
    }
  }

  return { team1, team2, seriesScore, mapScores };
}

async function pollChannel(channel) {
  // Essaie la query brute en priorité (plus stable qu'un persistedQuery)
  const info = (await fetchStreamTitleRaw(channel)) || (await fetchStreamTitle(channel));
  if (!info || !info.isLive) {
    cache.delete(channel);
    return;
  }
  const parsed = parseTitle(info.title);
  cache.set(channel, {
    title: info.title,
    viewers: info.viewers,
    team1: parsed.team1,
    team2: parsed.team2,
    seriesScore: parsed.seriesScore,
    mapScores: parsed.mapScores,
    scrapedAt: Date.now(),
  });
  console.log(
    `[twitch-scraper] ${channel} → "${info.title.slice(0, 90)}"`,
    parsed.team1 ? `${parsed.team1} vs ${parsed.team2}` : "",
    parsed.seriesScore ? `series=${parsed.seriesScore.a}-${parsed.seriesScore.b}` : "",
    parsed.mapScores.length ? `maps=${parsed.mapScores.map((s) => `${s.score1}-${s.score2}`).join(",")}` : ""
  );
}

async function pollAll() {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (now - v.scrapedAt > TTL_MS * 5) cache.delete(k);
  }
  const jobs = CHANNELS.map((c) => pollChannel(c));
  await Promise.allSettled(jobs);
}

/**
 * Cherche un scrape correspondant à ce couple d'équipes dans le cache.
 * Renvoie `{ title, seriesScore, mapScores, viewers, channel, scrapedAt }` ou null.
 */
export function getTwitchScoresForMatch(team1Name, team2Name) {
  const q1 = normalize(team1Name);
  const q2 = normalize(team2Name);
  for (const [channel, entry] of cache) {
    if (!entry.team1 || !entry.team2) continue;
    const t1 = normalize(entry.team1);
    const t2 = normalize(entry.team2);
    // Match partiel accepté (le titre Twitch abrège souvent : "T1" au lieu de "T1 Esports")
    const match1 = t1 === q1 || t1.includes(q1) || q1.includes(t1);
    const match2 = t2 === q2 || t2.includes(q2) || q2.includes(t2);
    const matchSwap1 = t1 === q2 || t1.includes(q2) || q2.includes(t1);
    const matchSwap2 = t2 === q1 || t2.includes(q1) || q1.includes(t2);
    if ((match1 && match2) || (matchSwap1 && matchSwap2)) {
      const swap = matchSwap1 && matchSwap2;
      return {
        channel,
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

export function startTwitchScraper() {
  console.log("[twitch-scraper] démarrage, poll toutes les 45s sur", CHANNELS.length, "chaînes Valorant");
  async function loop() {
    try {
      await pollAll();
    } catch (err) {
      console.error("[twitch-scraper] erreur:", err.message);
    }
    setTimeout(loop, POLL_INTERVAL_MS);
  }
  setTimeout(loop, 12_000);
}
