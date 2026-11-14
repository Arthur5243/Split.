/**
 * Routes HTTP pour le constructeur de brackets custom.
 *
 * Toutes les routes de mutation sont protegees par le password admin
 * (BRACKET_ADMIN_PASSWORD ou fallback ADMIN_KEY). Le password est verifie
 * via le header x-bracket-admin ou query ?key=.
 *
 * Routes publiques (lecture seule) :
 *   GET  /api/custom-brackets                       -> liste
 *   GET  /api/custom-brackets/:id                   -> detail
 *   GET  /api/custom-brackets/search?game=X&q=Y     -> search par tournoi
 *   GET  /api/custom-brackets/tournaments?game=X&q= -> autocomplete tournois
 *                                                      presents en base (matchs)
 *   GET  /api/custom-brackets/match-search?game=X&q -> search matchs individuels
 *                                                      (pour associer a une case)
 *
 * Routes admin :
 *   POST /api/custom-brackets/verify-password       -> check password
 *   POST /api/custom-brackets                       -> upsert
 *   DEL  /api/custom-brackets/:id                   -> delete
 */

import express from "express";
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  listCustomBrackets,
  getCustomBracket,
  findCustomBracketsByTournament,
  upsertCustomBracket,
  deleteCustomBracket,
} from "./custom-brackets-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "matches.db");

const router = express.Router();

function adminPassword() {
  return process.env.BRACKET_ADMIN_PASSWORD || process.env.ADMIN_KEY || null;
}

function checkPwd(req, res) {
  const pwd = adminPassword();
  if (!pwd) { res.status(500).json({ error: "BRACKET_ADMIN_PASSWORD non configure" }); return false; }
  const provided = req.headers["x-bracket-admin"] || req.query.key || req.body?.password;
  if (provided !== pwd) { res.status(403).json({ error: "forbidden" }); return false; }
  return true;
}

router.post("/api/custom-brackets/verify-password", (req, res) => {
  const pwd = adminPassword();
  if (!pwd) return res.status(500).json({ ok: false, error: "non configure" });
  const given = req.body?.password || req.headers["x-bracket-admin"];
  if (given === pwd) return res.json({ ok: true });
  return res.status(403).json({ ok: false });
});

router.get("/api/custom-brackets", (req, res) => {
  try { res.json(listCustomBrackets(req.query.game)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/api/custom-brackets/search", (req, res) => {
  try {
    const game = req.query.game;
    const q = req.query.q;
    if (!game || !q) return res.json([]);
    res.json(findCustomBracketsByTournament(game, q));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Helper : scorer de similarite texte (gere typos legers + sous-chaine).
// 100 = match exact, 0 = aucun lien.
function similarity(needle, hay) {
  if (!needle || !hay) return 0;
  const a = needle.toLowerCase();
  const b = hay.toLowerCase();
  if (b === a) return 100;
  if (b.includes(a)) return 90 - (b.length - a.length) * 0.1;
  const tokens = a.split(/\s+/).filter(Boolean);
  if (tokens.every(t => b.includes(t))) return 70;
  let hits = 0;
  for (const t of tokens) if (b.includes(t)) hits++;
  if (hits > 0) return 40 + hits * 10;
  // Prefix match character par character (tolere typos legers)
  let matched = 0;
  for (const ch of a) if (b.includes(ch)) matched++;
  return Math.max(0, (matched / a.length) * 20);
}

// Autocomplete tournois : retourne {name, league, phase, count} avec
// score de similarite et tri. Query vide = liste tout. Supporte typos
// legers via ranking multi-token.
router.get("/api/custom-brackets/tournaments", (req, res) => {
  try {
    const game = req.query.game;
    const q = (req.query.q || "").trim();
    if (!game) return res.json([]);
    const db = new Database(DB_PATH, { readonly: true });

    const rows = [];
    try {
      // Valorant : table matches avec colonnes league + phase.
      const vRows = db.prepare(
        "SELECT league, phase, COUNT(*) as n FROM matches WHERE league IS NOT NULL GROUP BY league, phase"
      ).all();
      for (const r of vRows) {
        const full = r.phase ? `${r.league} · ${r.phase}` : r.league;
        rows.push({ game: "valorant", name: full, league: r.league, phase: r.phase, count: r.n });
      }
    } catch {}
    db.close();

    // CS2/RL: pas de table dediee pour l'instant, on retourne juste les
    // leagues trouvees cote Valorant pour l'instant. A completer ensuite.

    const filtered = q
      ? rows.map(r => ({ ...r, _score: similarity(q, r.name) }))
            .filter(r => r._score > 10)
            .sort((a, b) => b._score - a._score)
      : rows.sort((a, b) => b.count - a.count);

    res.json(filtered.slice(0, 30));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Recherche matchs individuels (pour associer manuellement a une case).
router.get("/api/custom-brackets/match-search", (req, res) => {
  try {
    const q = (req.query.q || "").toLowerCase().trim();
    if (!q) return res.json([]);
    const db = new Database(DB_PATH, { readonly: true });
    let rows = [];
    try {
      rows = db.prepare(
        `SELECT id, team1_name, team2_name, league, phase, day, time, score1, score2, status
         FROM matches
         WHERE lower(team1_name) LIKE ? OR lower(team2_name) LIKE ? OR lower(league) LIKE ?
         ORDER BY day DESC, time DESC LIMIT 50`
      ).all("%" + q + "%", "%" + q + "%", "%" + q + "%");
    } catch {}
    db.close();
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Auto-fill : renvoie TOUS les matchs d'un tournoi pour pre-remplir les
// cases du bracket. L'UI admin les repartit ensuite par round selon la
// structure definie (4-2-1 pour un bracket SF-F-GF, etc.).
router.get("/api/custom-brackets/auto-fill", (req, res) => {
  try {
    const game = req.query.game;
    const tournament = (req.query.tournament || "").trim();
    if (!game || !tournament) return res.json([]);
    // Parse "League · Phase" ou juste "League".
    const parts = tournament.split("·").map(p => p.trim()).filter(Boolean);
    const league = parts[0];
    const phase = parts[1] || null;

    const db = new Database(DB_PATH, { readonly: true });
    let rows = [];
    try {
      let sql = `SELECT id, team1_name, team2_name, score1, score2, status, day, time, league, phase
                 FROM matches WHERE league = ?`;
      const params = [league];
      if (phase) { sql += " AND phase = ?"; params.push(phase); }
      sql += " ORDER BY day ASC, time ASC";
      rows = db.prepare(sql).all(...params);
    } catch {}
    db.close();
    res.json({ game, tournament, league, phase, matches: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/api/custom-brackets/:id", (req, res) => {
  try {
    const row = getCustomBracket(req.params.id);
    if (!row) return res.status(404).json({ error: "not_found" });
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/api/custom-brackets", (req, res) => {
  if (!checkPwd(req, res)) return;
  try {
    const { id, game, tournament_name, structure } = req.body || {};
    const row = upsertCustomBracket({ id, game, tournament_name, structure });
    res.json(row);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete("/api/custom-brackets/:id", (req, res) => {
  if (!checkPwd(req, res)) return;
  try {
    const ok = deleteCustomBracket(req.params.id);
    if (!ok) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
