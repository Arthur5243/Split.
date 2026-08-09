// Backend/scripts/update-matches.js
//
// Va chercher les derniers matchs Valorant terminés sur PandaScore,
// compare avec ce qui existe déjà dans Backend/data/matches.json,
// et n'ajoute que les nouveaux (dédup par pandascore_id).
//
// Lancé automatiquement par .github/workflows/update-matches.yml
// Peut aussi être lancé à la main : PANDASCORE_API_KEY=xxx node Backend/scripts/update-matches.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "..", "data", "matches.json");

const PANDASCORE_API_KEY = process.env.PANDASCORE_API_KEY;
const PANDASCORE_BASE = "https://api.pandascore.co";

if (!PANDASCORE_API_KEY) {
  console.error("❌ PANDASCORE_API_KEY manquante (variable d'env ou secret GitHub).");
  process.exit(1);
}

async function fetchRecentResults() {
  // per_page 50, on trie par date desc pour avoir les plus récents en premier
  const url = `${PANDASCORE_BASE}/valorant/matches/past?sort=-begin_at&per_page=50`;
  const res = await fetch(url, {
    headers: { Authorization: "Bearer " + PANDASCORE_API_KEY },
  });
  if (!res.ok) throw new Error("PandaScore HTTP " + res.status);
  return res.json();
}

// Adapte un match brut PandaScore vers notre schéma interne.
// ⚠️ À vérifier/ajuster après le premier run : décommente le console.log
// plus bas pour voir la vraie forme des données PandaScore et corriger
// les noms de champs si besoin (leur API bouge parfois d'une version à l'autre).
function normalizeMatch(raw) {
  const opponents = (raw.opponents || []).map((o) => o.opponent?.name).filter(Boolean);
  const [team1, team2] = opponents;
  if (!team1 || !team2) return null;

  const results = raw.results || [];
  const score =
    results.length === 2
      ? `${results[0].score}-${results[1].score}`
      : null;

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

async function main() {
  const existing = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));

  // Set des matchs déjà connus, par pandascore_id (les 204 matchs de base
  // n'ont pas de pandascore_id, seuls les matchs ajoutés automatiquement en ont)
  const knownIds = new Set(
    existing.filter((m) => m.pandascore_id).map((m) => m.pandascore_id)
  );

  const raw = await fetchRecentResults();
  // console.log(JSON.stringify(raw[0], null, 2)); // <- décommente pour debug la forme des données

  const normalized = raw.map(normalizeMatch).filter(Boolean);
  const newOnes = normalized.filter((m) => !knownIds.has(m.pandascore_id));

  if (newOnes.length === 0) {
    console.log("✅ Rien de nouveau, base déjà à jour.");
    return;
  }

  let nextId = Math.max(...existing.map((m) => m.match_id || 0)) + 1;
  for (const m of newOnes) {
    m.match_id = nextId++;
  }

  const updated = [...existing, ...newOnes].sort((a, b) =>
    (a.date || "").localeCompare(b.date || "")
  );

  fs.writeFileSync(DATA_PATH, JSON.stringify(updated, null, 2) + "\n");
  console.log(`✅ ${newOnes.length} nouveau(x) match(s) ajouté(s).`);
}

main().catch((e) => {
  console.error("❌ Erreur:", e.message);
  process.exit(1);
});
