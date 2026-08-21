import express from "express";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_SEARCH = "https://www.googleapis.com/youtube/v3/search";
const YOUTUBE_CHANNELS = "https://www.googleapis.com/youtube/v3/channels";
const MIN_SUBSCRIBERS = 40000;

const VALO_CHANNELS = {
  pacific: "UCA8fUfoBLWyUpAZTbXB0uoA",
  americas: "UCifCesg-EUkjKyQedaB3hRg",
  emea: "UCp6n8d8Y8r3MwKNw_MMaouQ",
  cn: "UCc1VJX_5Z2RdGi58XU4IfbA",
};

function detectValoRegion(league) {
  if (!league) return null;
  const l = league.toLowerCase();
  if (l.includes("pacific") || l.includes("apac")) return "pacific";
  if (l.includes("americas") || l.includes("america")) return "americas";
  if (l.includes("emea") || l.includes("europe")) return "emea";
  if (l.includes("china") || l === "cn" || l.includes("vct cn")) return "cn";
  return null;
}

const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;

function cleanCache() {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (now - v.at > CACHE_TTL) cache.delete(k);
  }
}

async function getChannelSubscriberCounts(channelIds) {
  if (!channelIds.length) return {};
  const params = new URLSearchParams({
    part: "statistics",
    id: channelIds.join(","),
    key: YOUTUBE_API_KEY,
  });
  try {
    const res = await fetch(YOUTUBE_CHANNELS + "?" + params);
    if (!res.ok) return {};
    const data = await res.json();
    const map = {};
    for (const ch of data.items || []) {
      map[ch.id] = parseInt(ch.statistics.subscriberCount || "0", 10);
    }
    return map;
  } catch { return {}; }
}

async function searchVideo(query, publishedAfter, publishedBefore, eventType, channelId) {
  if (!YOUTUBE_API_KEY) return null;
  const isLive = eventType === "live";
  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    maxResults: isLive ? "1" : "5",
    order: "relevance",
    key: YOUTUBE_API_KEY,
  });
  if (publishedAfter) params.set("publishedAfter", publishedAfter);
  if (publishedBefore) params.set("publishedBefore", publishedBefore);
  if (eventType) params.set("eventType", eventType);
  if (channelId) params.set("channelId", channelId);
  const res = await fetch(YOUTUBE_SEARCH + "?" + params);
  if (!res.ok) {
    console.log("[youtube] HTTP " + res.status + " for query: " + query);
    return null;
  }
  const data = await res.json();
  const items = data.items || [];
  if (items.length === 0) return null;

  if (isLive || channelId) {
    const item = items[0];
    return {
      url: "https://www.youtube.com/watch?v=" + item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
    };
  }

  const chIds = [...new Set(items.map((i) => i.snippet.channelId))];
  const subs = await getChannelSubscriberCounts(chIds);

  for (const item of items) {
    const chSubs = subs[item.snippet.channelId] || 0;
    if (chSubs >= MIN_SUBSCRIBERS) {
      return {
        url: "https://www.youtube.com/watch?v=" + item.id.videoId,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        subscribers: chSubs,
      };
    }
  }

  console.log("[youtube] no channel >= " + MIN_SUBSCRIBERS + " subs for: " + query + " → skipped");
  return null;
}

const router = express.Router();

router.get("/api/youtube-replay", async (req, res) => {
  try {
    if (!YOUTUBE_API_KEY) {
      return res.json({ url: null, error: "YOUTUBE_API_KEY not set" });
    }
    const { team1, team2, date, game, league } = req.query;
    if (!team1 || !team2) {
      return res.status(400).json({ url: null, error: "missing team1/team2" });
    }

    const cacheKey = [team1, team2, date, game, league].join("|").toLowerCase();
    const cached = cache.get(cacheKey);
    const ttl = cached && cached.data.url ? CACHE_TTL : 10 * 60 * 1000;
    if (cached && Date.now() - cached.at < ttl) {
      return res.json(cached.data);
    }

    let after = null;
    let before = null;
    if (date) {
      const d = new Date(date);
      if (!isNaN(d)) {
        after = new Date(d.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
        before = new Date(d.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      }
    }

    const region = detectValoRegion(league);
    const officialChannelId = region ? VALO_CHANNELS[region] : null;

    let result = null;

    if (officialChannelId) {
      const channelQueries = [
        team1 + " vs " + team2,
        team1 + " " + team2,
      ];
      for (const q of channelQueries) {
        result = await searchVideo(q, after, before, null, officialChannelId);
        if (result) break;
      }
      if (result) {
        console.log("[youtube] found on official " + region + " channel: " + result.title);
      }
    }

    if (!result) {
      const queries = [
        team1 + " vs " + team2 + " " + (game || "") + " full game",
        team1 + " vs " + team2 + " " + (game || ""),
        team1 + " vs " + team2 + " " + (game || "") + " replay",
        team1 + " " + team2 + " " + (game || "") + " full game",
      ];
      for (const q of queries) {
        result = await searchVideo(q, after, before);
        if (result) break;
      }
    }
    const payload = result ? { url: result.url, title: result.title, channel: result.channel } : { url: null };
    cache.set(cacheKey, { data: payload, at: Date.now() });
    if (cache.size > 500) cleanCache();
    res.json(payload);
  } catch (e) {
    console.error("[youtube] error:", e.message);
    res.json({ url: null, error: e.message });
  }
});

router.get("/api/youtube-live", async (req, res) => {
  try {
    if (!YOUTUBE_API_KEY) {
      return res.json({ url: null, error: "YOUTUBE_API_KEY not set" });
    }
    const { team1, team2, game } = req.query;
    if (!team1 || !team2) {
      return res.status(400).json({ url: null, error: "missing team1/team2" });
    }

    const cacheKey = "live|" + [team1, team2, game].join("|").toLowerCase();
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < 5 * 60 * 1000) {
      return res.json(cached.data);
    }

    const query = team1 + " VS " + team2 + " " + (game || "");
    const result = await searchVideo(query, null, null, "live");
    const payload = result ? { url: result.url, title: result.title, channel: result.channel } : { url: null };
    cache.set(cacheKey, { data: payload, at: Date.now() });
    res.json(payload);
  } catch (e) {
    console.error("[youtube-live] error:", e.message);
    res.json({ url: null, error: e.message });
  }
});

export default router;
