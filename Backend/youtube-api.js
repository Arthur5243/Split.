import express from "express";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_BASE = "https://www.googleapis.com/youtube/v3/search";

const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;

function cleanCache() {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (now - v.at > CACHE_TTL) cache.delete(k);
  }
}

async function searchVideo(query, publishedAfter, publishedBefore, eventType) {
  if (!YOUTUBE_API_KEY) return null;
  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    maxResults: "1",
    order: "relevance",
    key: YOUTUBE_API_KEY,
  });
  if (publishedAfter) params.set("publishedAfter", publishedAfter);
  if (publishedBefore) params.set("publishedBefore", publishedBefore);
  if (eventType) params.set("eventType", eventType);
  const res = await fetch(YOUTUBE_BASE + "?" + params);
  if (!res.ok) {
    console.log("[youtube] HTTP " + res.status + " for query: " + query);
    return null;
  }
  const data = await res.json();
  const item = data.items && data.items[0];
  if (!item) return null;
  return {
    url: "https://www.youtube.com/watch?v=" + item.id.videoId,
    title: item.snippet.title,
    channel: item.snippet.channelTitle,
  };
}

const router = express.Router();

router.get("/api/youtube-replay", async (req, res) => {
  try {
    if (!YOUTUBE_API_KEY) {
      return res.json({ url: null, error: "YOUTUBE_API_KEY not set" });
    }
    const { team1, team2, date, game } = req.query;
    if (!team1 || !team2) {
      return res.status(400).json({ url: null, error: "missing team1/team2" });
    }

    const cacheKey = [team1, team2, date, game].join("|").toLowerCase();
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL) {
      return res.json(cached.data);
    }

    const query = team1 + " VS " + team2 + " " + (game || "") + " replay";
    let after = null;
    let before = null;
    if (date) {
      const d = new Date(date);
      if (!isNaN(d)) {
        after = new Date(d.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
        before = new Date(d.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
      }
    }

    const result = await searchVideo(query, after, before);
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
