/**
 * Store SQLite des alias d'equipes esports (toutes games confondus).
 *
 * Objectif : eviter les erreurs de type "SEC affiche le logo de Team Spirit",
 * "IG vs FPX ne trouve pas le scraper" etc. Chaque equipe a UN nom canonique,
 * UN logo canonique, et une liste d'alias (abreviations, variantes d'ecriture,
 * anciens noms).
 *
 * Schema :
 *   teams(
 *     id            TEXT PK,                  -- slug lower-no-space du nom canonique
 *     canonical     TEXT NOT NULL,            -- "Team Spirit"
 *     game          TEXT,                     -- valorant / cs2 / rl / null (cross-game)
 *     logo_url      TEXT,
 *     liquipedia    TEXT,                     -- URL wiki Liquipedia si connue
 *     country       TEXT,
 *     updated_at    TEXT
 *   )
 *   team_aliases(
 *     alias_norm    TEXT PK,                  -- nom alias normalise (lowercase, no-space)
 *     team_id       TEXT NOT NULL,            -- FK teams.id
 *     alias_raw     TEXT,                     -- affichage original ("SEC", "Team Spirit")
 *     added_by      TEXT,                     -- "manual" / "scraper" / "auto"
 *     added_at      TEXT
 *   )
 *
 * Normalisation : NFD + lowercase + supprime tout sauf [a-z0-9].
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "matches.db");

let initDone = false;
function ensureInit() {
  if (initDone) return;
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      canonical TEXT NOT NULL,
      game TEXT,
      logo_url TEXT,
      liquipedia TEXT,
      country TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS team_aliases (
      alias_norm TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      alias_raw TEXT,
      added_by TEXT,
      added_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_team_aliases_team ON team_aliases(team_id);
  `);
  db.close();
  initDone = true;
}

export function normTeamName(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function slugify(s) {
  return normTeamName(s) || "unknown_" + Math.random().toString(36).slice(2, 8);
}

/**
 * Cherche l'equipe canonique a partir d'un nom raw (alias quelconque).
 * Retourne { id, canonical, logo_url, liquipedia, aliases: [...] } ou null.
 */
export function resolveTeam(rawName) {
  ensureInit();
  const n = normTeamName(rawName);
  if (!n) return null;
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const alias = db.prepare("SELECT team_id FROM team_aliases WHERE alias_norm = ?").get(n);
    if (!alias) return null;
    const team = db.prepare("SELECT id, canonical, game, logo_url, liquipedia, country FROM teams WHERE id = ?").get(alias.team_id);
    if (!team) return null;
    const aliases = db.prepare("SELECT alias_raw FROM team_aliases WHERE team_id = ?").all(team.id).map(r => r.alias_raw);
    return { ...team, aliases };
  } finally { db.close(); }
}

/**
 * Enregistre (ou merge) une equipe. Si canonical correspond deja a une equipe
 * existante, on ajoute uniquement les nouveaux alias.
 */
export function upsertTeam({ canonical, game, logo_url, liquipedia, country, aliases = [], added_by = "manual" }) {
  ensureInit();
  if (!canonical || canonical.length < 1) throw new Error("canonical requis");
  const db = new Database(DB_PATH);
  const tx = db.transaction(() => {
    const canonSlug = slugify(canonical);
    const existing = db.prepare("SELECT id FROM teams WHERE id = ?").get(canonSlug);
    if (existing) {
      db.prepare(`UPDATE teams SET canonical = ?, game = COALESCE(?, game), logo_url = COALESCE(?, logo_url),
                  liquipedia = COALESCE(?, liquipedia), country = COALESCE(?, country),
                  updated_at = datetime('now') WHERE id = ?`)
        .run(canonical, game || null, logo_url || null, liquipedia || null, country || null, canonSlug);
    } else {
      db.prepare(`INSERT INTO teams (id, canonical, game, logo_url, liquipedia, country, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`)
        .run(canonSlug, canonical, game || null, logo_url || null, liquipedia || null, country || null);
    }
    // Ajoute canonical lui-meme comme alias
    const allAliases = new Set([canonical, ...aliases]);
    const stmt = db.prepare(`INSERT OR REPLACE INTO team_aliases
                             (alias_norm, team_id, alias_raw, added_by, added_at)
                             VALUES (?, ?, ?, ?, datetime('now'))`);
    for (const a of allAliases) {
      const n = normTeamName(a);
      if (!n) continue;
      stmt.run(n, canonSlug, String(a), added_by);
    }
  });
  tx();
  db.close();
  return { id: slugify(canonical) };
}

export function listTeams({ game, q, limit = 50 } = {}) {
  ensureInit();
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const where = [];
    const params = [];
    if (game) { where.push("game = ?"); params.push(game); }
    if (q) {
      where.push("(lower(canonical) LIKE ? OR id IN (SELECT team_id FROM team_aliases WHERE alias_norm LIKE ?))");
      params.push("%" + q.toLowerCase() + "%", "%" + normTeamName(q) + "%");
    }
    const sql = "SELECT id, canonical, game, logo_url, liquipedia FROM teams"
              + (where.length ? " WHERE " + where.join(" AND ") : "")
              + " ORDER BY canonical ASC LIMIT " + Number(limit);
    const rows = db.prepare(sql).all(...params);
    for (const r of rows) {
      r.aliases = db.prepare("SELECT alias_raw FROM team_aliases WHERE team_id = ?").all(r.id).map(x => x.alias_raw);
    }
    return rows;
  } finally { db.close(); }
}

export function deleteTeam(id) {
  ensureInit();
  const db = new Database(DB_PATH);
  try {
    db.prepare("DELETE FROM team_aliases WHERE team_id = ?").run(id);
    const r = db.prepare("DELETE FROM teams WHERE id = ?").run(id);
    return r.changes > 0;
  } finally { db.close(); }
}

export function removeAlias(aliasRaw, teamId) {
  ensureInit();
  const db = new Database(DB_PATH);
  try {
    const n = normTeamName(aliasRaw);
    const r = db.prepare("DELETE FROM team_aliases WHERE alias_norm = ? AND team_id = ?").run(n, teamId);
    return r.changes > 0;
  } finally { db.close(); }
}

/**
 * Seed initial avec les cas problematiques connus (SEC, IG/FPX etc).
 */
export function seedKnownAliasesIfEmpty() {
  ensureInit();
  const db = new Database(DB_PATH);
  const n = db.prepare("SELECT COUNT(*) as n FROM teams").get()?.n ?? 0;
  if (n > 0) { db.close(); return false; }
  db.close();

  const seed = [
    // Valorant
    { canonical: "Team Spirit",       game: "valorant", aliases: ["TSM", "Spirit"] },
    { canonical: "Spirit Esports",    game: "cs2",      aliases: ["Team Spirit", "Spirit"] },
    { canonical: "Sentinels",         game: "valorant", aliases: ["SEN"] },
    { canonical: "100 Thieves",       game: "valorant", aliases: ["100T"] },
    { canonical: "Cloud9",            game: "valorant", aliases: ["C9"] },
    { canonical: "Evil Geniuses",     game: "valorant", aliases: ["EG"] },
    { canonical: "NRG",               game: "valorant", aliases: ["NRG Esports"] },
    { canonical: "LOUD",              game: "valorant", aliases: [] },
    { canonical: "Leviatán",          game: "valorant", aliases: ["LEV", "Leviatan"] },
    { canonical: "KRÜ Esports",       game: "valorant", aliases: ["KRU", "KRU Esports"] },
    { canonical: "MIBR",              game: "valorant", aliases: ["Made in Brazil"] },
    { canonical: "FURIA",             game: "valorant", aliases: ["FURIA Esports"] },
    { canonical: "Team Heretics",     game: "valorant", aliases: ["TH", "Heretics"] },
    { canonical: "Team Liquid",       game: "valorant", aliases: ["TL", "Liquid"] },
    { canonical: "Fnatic",            game: "valorant", aliases: ["FNC"] },
    { canonical: "KOI",               game: "valorant", aliases: [] },
    { canonical: "Karmine Corp",      game: "valorant", aliases: ["KC", "Karmine"] },
    { canonical: "BBL Esports",       game: "valorant", aliases: ["BBL"] },
    { canonical: "FUT Esports",       game: "valorant", aliases: ["FUT"] },
    { canonical: "Giants Gaming",     game: "valorant", aliases: ["GIA", "Giants"] },
    { canonical: "NAVI",              game: "valorant", aliases: ["Natus Vincere", "Na`Vi"] },
    { canonical: "Vitality",          game: "valorant", aliases: ["VIT", "Team Vitality"] },
    { canonical: "Gentle Mates",      game: "valorant", aliases: ["GM", "GentleMates", "M8"] },
    { canonical: "Paper Rex",         game: "valorant", aliases: ["PRX"] },
    { canonical: "DRX",               game: "valorant", aliases: [] },
    { canonical: "Gen.G",             game: "valorant", aliases: ["GEN", "GenG"] },
    { canonical: "T1",                game: "valorant", aliases: [] },
    { canonical: "ZETA DIVISION",     game: "valorant", aliases: ["ZETA"] },
    { canonical: "DetonatioN FocusMe",game: "valorant", aliases: ["DFM"] },
    { canonical: "Rex Regum Qeon",    game: "valorant", aliases: ["RRQ"] },
    { canonical: "Team Secret",       game: "valorant", aliases: ["TS"] },
    { canonical: "Bleed Esports",     game: "valorant", aliases: ["BLD", "Bleed"] },
    { canonical: "Global Esports",    game: "valorant", aliases: ["GE", "GlobalEsports"] },
    { canonical: "EDward Gaming",     game: "valorant", aliases: ["EDG"] },
    { canonical: "FunPlus Phoenix",   game: "valorant", aliases: ["FPX"] },
    { canonical: "Invictus Gaming",   game: "valorant", aliases: ["IG", "iG"] },
    { canonical: "Bilibili Gaming",   game: "valorant", aliases: ["BLG"] },
    { canonical: "Trace Esports",     game: "valorant", aliases: ["TE"] },
    { canonical: "Dragon Ranger Gaming",game:"valorant",aliases: ["DRG"] },
    { canonical: "Wolves Esports",    game: "valorant", aliases: ["WOL", "Wolves"] },
    { canonical: "Nova Esports",      game: "valorant", aliases: ["NOV"] },
    { canonical: "TYLOO",             game: "valorant", aliases: [] },
    { canonical: "All Gamers",        game: "valorant", aliases: ["AG"] },
    { canonical: "JD Gaming",         game: "valorant", aliases: ["JDG"] },

    // CS2
    { canonical: "G2 Esports",        game: "cs2",      aliases: ["G2"] },
    { canonical: "FaZe Clan",         game: "cs2",      aliases: ["FaZe", "FAZE"] },
    { canonical: "Natus Vincere",     game: "cs2",      aliases: ["NAVI", "Na`Vi", "NaVi"] },
    { canonical: "MOUZ",              game: "cs2",      aliases: ["mousesports"] },
    { canonical: "Vitality",          game: "cs2",      aliases: ["Team Vitality", "VIT"] },
    { canonical: "Falcons",           game: "cs2",      aliases: ["Team Falcons", "FLCN"] },
    { canonical: "Liquid",            game: "cs2",      aliases: ["Team Liquid", "TL"] },
    { canonical: "HEROIC",            game: "cs2",      aliases: [] },
    { canonical: "Astralis",          game: "cs2",      aliases: ["AST"] },
    { canonical: "BIG",               game: "cs2",      aliases: ["BIG Clan"] },
    { canonical: "Complexity",        game: "cs2",      aliases: ["coL", "COL"] },
    { canonical: "ENCE",              game: "cs2",      aliases: [] },
    { canonical: "FURIA",             game: "cs2",      aliases: ["FURIA Esports"] },
    { canonical: "MIBR",              game: "cs2",      aliases: [] },
    { canonical: "paiN Gaming",       game: "cs2",      aliases: ["paiN"] },
    { canonical: "9INE",              game: "cs2",      aliases: [] },
    { canonical: "Imperial",          game: "cs2",      aliases: ["Imperial Esports"] },
    { canonical: "Virtus.pro",        game: "cs2",      aliases: ["VP", "Virtus Pro"] },
    { canonical: "Monte",             game: "cs2",      aliases: [] },
    { canonical: "3DMAX",             game: "cs2",      aliases: [] },
    { canonical: "GamerLegion",       game: "cs2",      aliases: ["GL"] },
    { canonical: "Falcons",           game: "cs2",      aliases: ["Team Falcons"] },
    { canonical: "The MongolZ",       game: "cs2",      aliases: ["MongolZ"] },
    { canonical: "Eternal Fire",      game: "cs2",      aliases: ["EF"] },
    { canonical: "Fluxo",             game: "cs2",      aliases: [] },
    { canonical: "Legacy",            game: "cs2",      aliases: ["RED Canids", "RED"] },
    { canonical: "BetBoom Team",      game: "cs2",      aliases: ["BetBoom", "BB"] },
    { canonical: "Spirit",            game: "cs2",      aliases: ["Team Spirit"] },
    // "SEC" ambigu : plusieurs equipes CS2 ont utilise SEC comme tag (Secret
    // Club, SEC Esports Russia, ...). On NE SEED PAS d'alias SEC pour eviter
    // les faux positifs. L'admin peut le resoudre a la main via /password.

    // Rocket League
    { canonical: "Team Vitality",     game: "rl",       aliases: ["VIT"] },
    { canonical: "Karmine Corp",      game: "rl",       aliases: ["KC"] },
    { canonical: "Team Falcons",      game: "rl",       aliases: ["FLCN", "Falcons"] },
    { canonical: "NRG",               game: "rl",       aliases: ["NRG Esports"] },
    { canonical: "G2 Esports",        game: "rl",       aliases: ["G2"] },
    { canonical: "FURIA",             game: "rl",       aliases: ["FURIA Esports"] },
    { canonical: "Spacestation Gaming",game: "rl",      aliases: ["SSG"] },
    { canonical: "Gen.G Mobil1 Racing",game:"rl",       aliases: ["Gen.G"] },
    { canonical: "Team BDS",          game: "rl",       aliases: ["BDS"] },
    { canonical: "Williams Resolve",  game: "rl",       aliases: [] },
    { canonical: "M8",                game: "rl",       aliases: ["Gentle Mates", "GM"] },
    { canonical: "Dignitas",          game: "rl",       aliases: ["DIG"] },
    { canonical: "Complexity",        game: "rl",       aliases: ["coL"] },
    { canonical: "KRÜ Esports",       game: "rl",       aliases: ["KRU", "Kru"] },
    { canonical: "Luminosity Gaming", game: "rl",       aliases: ["LG"] },
    { canonical: "Oxygen Esports",    game: "rl",       aliases: ["OXG"] },
  ];

  for (const t of seed) {
    try { upsertTeam({ ...t, added_by: "seed" }); } catch {}
  }
  console.log(`[team-aliases] seed applique (${seed.length} equipes)`);
  return true;
}
