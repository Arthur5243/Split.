// Backend/scripts/backfill-matches.js
//
// Va chercher TOUT l'historique Valorant terminé sur PandaScore entre le
// 1er janvier 2025 et aujourd'hui (VCT 2025 + 2026), page par page, et
// fusionne avec Backend/data/matches.json (dédup par pandascore_id, comme
// update-matches.js). Contrairement à update-matches.js (50 derniers matchs
// seulement), celui-ci ratisse large -> à lancer une fois pour repartir sur
// une vraie base complète, ensuite update-matches.js prend le relais au fil de l'eau.
//
// Lancement : PANDASCORE_API_KEY=xxx node Backend/scripts/backfill-matches.js
// (la clé est déjà dans les variables d'env Railway si le déploiement tourne déjà)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "..", "data", "matches.json");

const PANDASCORE_API_KEY = process.env.PANDASCORE_API_KEY;
const PANDASCORE_BASE = "https://api.pandascore.co";

// Plage à couvrir : VCT 2025 + 2026. Modifie si besoin.
const RANGE_START = "2025-01-01T00:00:00Z";
const RANGE_END = new Date().toISOString();

const PER_PAGE = 100; // max autorisé par PandaScore
const DELAY_MS = 650; // pour rester sous la limite de rate-limit

if (!PANDASCORE_API_KEY) {
  console.error("❌ PANDASCORE_API_KEY manquante (variable d'env).");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Récupère UNE page de matchs terminés, triés du plus ancien au plus récent.
async function fetchPage(page) {
  const url =
    `${PANDASCORE_BASE}/valorant/matches/past` +
    `?sort=begin_at` +
    `&per_page=${PER_PAGE}` +
    `&page=${page}` +
    `&range[begin_at]=${RANGE_START},${RANGE_END}`;

  const res = await fetch(url, {
    headers: { Authorization: "Bearer " + PANDASCORE_API_KEY },
  });

  if (res.status === 429) {
    console.warn("⏳ Rate limit atteint, pause 5s...");
    await sleep(5000);
    return fetchPage(page);
  }
  if (!res.ok) throw new Error("PandaScore HTTP " + res.status + " (page " + page + ")");
  return res.json();
}

// Même logique que update-matches.js pour rester cohérent avec le reste du projet.
function normalizeMatch(raw) {
  const opponents = (raw.opponents || []).map((o) => o.opponent?.name).filter(Boolean);
  const [team1, team2] = opponents;
  if (!team1 || !team2) return null;

  const results = raw.results || [];
  const score = results.length === 2 ? `${results[0].score}-${results[1].score}` : null;

  const winner =
    raw.winner?.name ||
    (raw.winner_id
      ? raw.opponents?.find((o) => o.opponent?.id === raw.winner_id)?.opponent?.name
      : null);

  return {
    pandascore_id: raw.id,
    tournament_id: raw.tournament?.id ? `PANDA_${raw.tournament.id}` : "PANDA_UNKNOWN",
    tournament_name: raw.tournament?.name || raw.league?.name || "Unknown",
    tier: raw.league?.name || "Unknown",
    region: "AUTO",
    date: raw.begin_at ? raw.begin_at.slice(0, 10) : null,
    stage: raw.name || raw.serie?.full_name || "Unknown",
    team1,
    team2,
    score,
    winner,
  };
}

async function fetchAllPages() {
  let page = 1;
  let all = [];
  while (true) {
    console.log(`→ page ${page}...`);
    const batch = await fetchPage(page);
    if (!Array.isArray(batch) || batch.length === 0) break;
    all = all.concat(batch);
    if (batch.length < PER_PAGE) break; // dernière page
    page++;
    await sleep(DELAY_MS);
  }
  return all;
}

async function main() {
  const existing = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
  const knownIds = new Set(existing.filter((m) => m.pandascore_id).map((m) => m.pandascore_id));

  const raw = await fetchAllPages();
  console.log(`📦 ${raw.length} match(s) brut(s) récupéré(s) sur la période.`);

  const normalized = raw.map(normalizeMatch).filter(Boolean);
  const newOnes = normalized.filter((m) => !knownIds.has(m.pandascore_id));

  if (newOnes.length === 0) {
    console.log("✅ Rien de nouveau, base déjà à jour.");
    return;
  }

  let nextId = Math.max(0, ...existing.map((m) => m.match_id || 0)) + 1;
  for (const m of newOnes) {
    m.match_id = nextId++;
  }

  const updated = [...existing, ...newOnes].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  fs.writeFileSync(DATA_PATH, JSON.stringify(updated, null, 2) + "\n");
  console.log(`✅ ${newOnes.length} nouveau(x) match(s) ajouté(s) (total: ${updated.length}).`);
}

main().catch((e) => {
  console.error("❌ Erreur:", e.message);
  process.exit(1);
});
