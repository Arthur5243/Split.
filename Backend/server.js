import express from "express";
import cors from "cors";
import oddsRouter from "./odds.js";

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

app.get("/api/valorant-results", async (req, res) => {
  try {
    const data = await cachedFetch("results", "/valorant/matches/past?per_page=50");
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "Impossible de récupérer les résultats." });
  }
});

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "split-app-backend" });
});

app.listen(PORT, () => {
  console.log("Backend démarré sur le port " + PORT);
});
