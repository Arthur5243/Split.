import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import oddsRouter from "./odds.js";

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

app.get("/api/valorant-results", async (req, res) => {
  try {
    const data = await cachedFetch("results", "/valorant/matches/past?per_page=50");
    res.json(data);
  } catch (e) {
    console.error(e);
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

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "split-app-backend" });
});

app.listen(PORT, () => {
  console.log("Backend démarré sur le port " + PORT);
});
