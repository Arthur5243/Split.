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
