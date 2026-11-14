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

// Autocomplete : retourne les noms de tournois presents dans la base
// (tables de matchs de chaque jeu). L'UI admin l'utilise pour verifier
// que le tournoi existe avant de laisser creer un bracket.
router.get("/api/custom-brackets/tournaments", (req, res) => {
  try {
    const game = req.query.game;
    const q = (req.query.q || "").toLowerCase().trim();
    if (!game) return res.json([]);
    const db = new Database(DB_PATH, { readonly: true });
    // Les matchs scrapes sont dans matches.db dans la table "matches" (pour
    // valorant) ou "cs2_matches" / "rl_matches" selon l'implementation.
    // La table "matches" contient tous les matchs Valo scrapes. CS2/RL sont
    // dans des fichiers data/matches-*.json (historique profond) mais pas
    // directement en DB. Pour l'autocomplete on utilise les noms de league
    // des matchs stockes.
    let rows = [];
    try {
      rows = db.prepare(
        "SELECT DISTINCT league_name as name FROM matches WHERE league_name IS NOT NULL AND lower(league_name) LIKE ? ORDER BY league_name LIMIT 30"
      ).all("%" + q + "%");
    } catch { rows = []; }
    db.close();
    res.json(rows.map(r => r.name));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/api/custom-brackets/match-search", (req, res) => {
  try {
    const game = req.query.game;
    const q = (req.query.q || "").toLowerCase().trim();
    if (!game || !q) return res.json([]);
    const db = new Database(DB_PATH, { readonly: true });
    let rows = [];
    try {
      rows = db.prepare(
        `SELECT match_id as id, team1_name, team2_name, league_name, begin_at
         FROM matches
         WHERE lower(team1_name) LIKE ? OR lower(team2_name) LIKE ? OR lower(league_name) LIKE ?
         ORDER BY begin_at DESC LIMIT 30`
      ).all("%" + q + "%", "%" + q + "%", "%" + q + "%");
    } catch { rows = []; }
    db.close();
    res.json(rows);
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
