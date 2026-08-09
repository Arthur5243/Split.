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
      return y === "2025" || y === "2026";
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

    res.type("html").send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Export matchs</title></head>
<body style="font-family:sans-serif;padding:12px;">
<h3>${formatted.length} matchs trouvés (2025-2026)</h3>
<button onclick="copyIt()" style="width:100%;padding:16px;font-size:16px;background:#22c55e;color:white;border:none;border-radius:8px;margin-bottom:10px;">📋 Copier tout</button>
<div id="status" style="text-align:center;margin-bottom:10px;color:#666;"></div>
<textarea id="data" readonly style="width:100%;height:70vh;box-sizing:border-box;font-family:monospace;font-size:12px;">${json}</textarea>
<script>
function copyIt() {
  const el = document.getElementById('data');
  el.select();
  el.setSelectionRange(0, 999999999);
  navigator.clipboard.writeText(el.value).then(() => {
    document.getElementById('status').textContent = '✅ Copié !';
  }).catch(() => {
    document.execCommand('copy');
    document.getElementById('status').textContent = '✅ Copié (fallback) !';
  });
}
</script>
</body></html>`);
  } catch (e) {
    console.error("export-matches error:", e.message);
    res.status(502).send("Erreur PandaScore : " + e.message);
  }
});

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "split-app-backend" });
});

app.listen(PORT, () => {
  console.log("Backend démarré sur le port " + PORT);
});
