// Backend/scripts/build-team-aliases.js
//
// Construit (ou rafraîchit) Backend/data/team-aliases.json : un mapping
// "nom PandaScore" -> { vlr_name, vlr_id } pour toutes les équipes présentes
// dans Backend/data/matches.json.
//
// Une fois ce fichier rempli, findTeamId() dans vlr-scores.js le consulte en
// premier (zéro requête réseau, zéro faux positif) et ne retombe sur la
// recherche live /v2/search que pour les équipes absentes du fichier.
//
// Usage :
//   node Backend/scripts/build-team-aliases.js            # ajoute seulement les équipes manquantes
//   node Backend/scripts/build-team-aliases.js --refresh   # re-vérifie aussi les équipes déjà présentes
//
// Peut être lancé à la main ou via .github/workflows/build-team-aliases.yml
// (cron mensuel, voir ce fichier).

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MATCHES_PATH = path.join(__dirname, "..", "data", "matches.json");
const ALIASES_PATH = path.join(__dirname, "..", "data", "team-aliases.json");
const UNMATCHED_PATH = path.join(__dirname, "..", "data", "unmatched-teams.log");

const VLR_API_BASE = process.env.VLR_API_BASE || "https://vlrggapi-production-b3a0.up.railway.app";
const REFRESH = process.argv.includes("--refresh");

function normalize(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function vlrFetch(pathAndQuery, attempt = 0) {
  const res = await fetch(VLR_API_BASE + pathAndQuery);
  if (res.status === 429 && attempt < 3) {
    await sleep(1000 * (attempt + 1));
    return vlrFetch(pathAndQuery, attempt + 1);
  }
  if (!res.ok) throw new Error("vlr-api HTTP " + res.status);
  return res.json();
}

// Ne renvoie un résultat QUE si le nom matche exactement (une fois
// normalisé). Pas de "teams[0]" par défaut ici : ce fichier doit être fiable
// à 100%, donc on préfère un miss (-> log) à un faux positif.
async function searchExact(teamName) {
  const json = await vlrFetch("/v2/search?q=" + encodeURIComponent(teamName));
  const teams =
    (json && json.data && json.data.segments && json.data.segments.results && json.data.segments.results.teams) ||
    [];
  const target = normalize(teamName);
  return teams.find((t) => normalize(t.name) === target) || null;
}

function loadJsonSafe(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (e) {
    return fallback;
  }
}

async function main() {
  const matches = loadJsonSafe(MATCHES_PATH, []);
  const teamNames = new Set();
  for (const m of matches) {
    if (m.team1) teamNames.add(m.team1);
    if (m.team2) teamNames.add(m.team2);
  }

  const aliases = loadJsonSafe(ALIASES_PATH, {});
  const toProcess = [...teamNames].filter((name) => REFRESH || !aliases[name]);

  console.log(`ℹ️  ${teamNames.size} équipe(s) au total, ${toProcess.length} à traiter (${REFRESH ? "mode --refresh" : "nouvelles seulement"}).`);

  const unmatched = [];
  let found = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const name = toProcess[i];
    try {
      const match = await searchExact(name);
      if (match) {
        aliases[name] = { vlr_name: match.name, vlr_id: match.id };
        found++;
        console.log(`✅ [${i + 1}/${toProcess.length}] ${name} -> ${match.name} (#${match.id})`);
      } else {
        unmatched.push(name);
        console.log(`⚠️  [${i + 1}/${toProcess.length}] ${name} -> aucun match exact`);
      }
    } catch (e) {
      unmatched.push(name);
      console.log(`❌ [${i + 1}/${toProcess.length}] ${name} -> erreur (${e.message})`);
    }
    // Pause entre chaque requête pour ménager vlrggapi et éviter les 429.
    await sleep(600);
  }

  const sortedAliases = Object.fromEntries(
    Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b))
  );
  fs.writeFileSync(ALIASES_PATH, JSON.stringify(sortedAliases, null, 2) + "\n");

  if (unmatched.length > 0) {
    const stamp = new Date().toISOString().slice(0, 10);
    const lines = unmatched.map((n) => `${stamp} — ${n}`).join("\n") + "\n";
    fs.appendFileSync(UNMATCHED_PATH, lines);
  }

  console.log(`\n✅ ${found} équipe(s) ajoutée(s)/confirmée(s) dans team-aliases.json.`);
  if (unmatched.length > 0) {
    console.log(`⚠️  ${unmatched.length} équipe(s) non trouvée(s) (voir Backend/data/unmatched-teams.log) : ${unmatched.join(", ")}`);
  }
}

main().catch((e) => {
  console.error("❌ Erreur:", e.message);
  process.exit(1);
});